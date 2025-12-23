
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";
import { logAction, logError, getUserId } from './analyticsService';
import { supabase } from './supabaseClient';
import { auth, database } from './firebase';
import { ref, remove } from 'firebase/database';

// Configuration for Intelligent Model Fallback
// We cascade through these models to avoid hitting the rate limit on a single one.
const MODEL_CASCADE = [
    'gemini-2.5-flash-image',      // Primary: Fast & New
    'gemini-2.0-flash-exp',        // Secondary: Experimental (often distinct quota)
    'gemini-3-pro-image-preview'   // Tertiary: High Quality (Pro quota)
];

// Helper to convert a data URL string to a File object for saving.
export const dataURLtoFile = async (dataUrl: string, filename:string): Promise<File> => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type });
};

/**
 * Detects if the current environment is an Android APK or Mobile App.
 */
export const isMobileApp = (): boolean => {
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  const isAndroidWebView = /android/i.test(userAgent) && /wv/i.test(userAgent);
  const isLocalFile = window.location.protocol === 'file:';
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
  return isAndroidWebView || isLocalFile || isIOS;
};

/**
 * A robust way to get the Gemini AI client.
 * Uses the single configured API key.
 */
const getAiClient = (): GoogleGenAI => {
    const apiKey = process.env.API_KEY;

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
        const errorMessage = "API Key is not configured. Please reload.";
        console.error("Critical Error: API Key is missing.");
        throw new Error(errorMessage);
    }
    return new GoogleGenAI({ apiKey });
};

/**
 * Utility to wait for a specified duration
 */
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Parses the error message to find a suggested wait time.
 */
const getRetryDelay = (error: any): number => {
    let textToSearch = "";
    if (typeof error === 'string') textToSearch += error;
    if (error.message) textToSearch += " " + error.message;
    if (error.toString) textToSearch += " " + error.toString();
    try { textToSearch += " " + JSON.stringify(error); } catch(e) {}

    // Matches: "retry in 54.5s", "retryDelay": "54s"
    const match = textToSearch.match(/retry in\s+([0-9.]+)\s*s/i) || 
                  textToSearch.match(/retryDelay"?\s*:\s*"?([0-9.]+)\s*s"?/i);
                  
    if (match && match[1]) {
        const seconds = parseFloat(match[1]);
        // Add a small buffer
        return Math.ceil(seconds * 1000) + 1000;
    }
    return 0;
};

/**
 * Wraps an async operation with robust retry logic.
 * @param operation The async function to retry
 * @param maxRetries Max attempts
 * @param initialDelay Delay in ms
 * @param failFast If true, throws immediately on 429/503 errors (used to switch models quickly)
 */
const retryOperation = async <T>(
    operation: () => Promise<T>, 
    maxRetries: number = 3,
    initialDelay: number = 2000,
    failFast: boolean = false 
): Promise<T> => {
    let lastError: any;
    
    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;
            let errString = "";
            try {
                errString = (error.message || "") + (error.toString ? error.toString() : "") + JSON.stringify(error);
            } catch(e) { errString = "unknown error"; }
            
            const isRateLimit = errString.includes('429') || errString.includes('RESOURCE_EXHAUSTED') || errString.includes('quota');
            const isServerOverload = errString.includes('503') || errString.includes('Overloaded');

            // If failFast is true and we hit a limit, throw immediately so the caller can switch models
            if ((isRateLimit || isServerOverload) && failFast) {
                console.warn("Fast fail triggered due to rate limit. Switching models...");
                throw error;
            }

            if ((isRateLimit || isServerOverload) && i < maxRetries) {
                let delay = getRetryDelay(error);
                if (delay === 0) delay = initialDelay * Math.pow(2, i);

                // If the API asks to wait more than 15 seconds, just abort this retry loop
                // and let the app try a different model strategy if possible.
                if (delay > 15000) {
                     console.warn(`Retry delay ${delay}ms is too long. Aborting retry for this model.`);
                     throw error;
                }

                const waitTimeSec = (delay/1000).toFixed(1);
                console.log(`%c ⏳ API Busy. Waiting ${waitTimeSec}s...`, 'color: orange;');
                
                await wait(delay);
                continue;
            }
            break;
        }
    }
    throw lastError;
};

/**
 * Executes a generation request with a multi-model fallback mechanism.
 * Tries models in sequence: 2.5-flash -> 2.0-flash -> 3-pro
 */
const generateWithFallback = async (
    ai: GoogleGenAI, 
    params: any
): Promise<GenerateContentResponse> => {
    let lastError: any;

    for (let i = 0; i < MODEL_CASCADE.length; i++) {
        const modelName = MODEL_CASCADE[i];
        const isLastAttempt = i === MODEL_CASCADE.length - 1;
        
        try {
            console.log(`Attempting generation with ${modelName}...`);
            // If it's not the last model, failFast=true so we switch instantly on 429
            // If it IS the last model, failFast=false so we actually wait/retry
            return await retryOperation(
                () => ai.models.generateContent({ ...params, model: modelName }),
                isLastAttempt ? 3 : 0, // No retries for early models, just switch
                2000,
                !isLastAttempt // Fail fast unless it's the last hope
            );
        } catch (error: any) {
            lastError = error;
            const errString = error.toString();
            console.warn(`Model ${modelName} failed:`, errString);
            
            // If it's not a rate limit/overload error (e.g. invalid prompt), stop trying other models
            const isRateLimit = errString.includes('429') || errString.includes('RESOURCE_EXHAUSTED') || errString.includes('503') || errString.includes('Overloaded');
            
            if (!isRateLimit) {
                throw error; // Don't try other models for logic errors
            }
            
            // If we have more models, continue loop
            if (!isLastAttempt) {
                console.log("Switching to next available model...");
                continue;
            }
        }
    }
    
    throw lastError;
};

/**
 * A wrapper function to time API calls, log performance, and handle errors.
 */
const timedApiCall = async <T>(
    featureName: string,
    details: Record<string, any> | null,
    apiCall: () => Promise<T>
): Promise<T> => {
    const startTime = Date.now();
    try {
        const result = await apiCall();
        const duration = (Date.now() - startTime) / 1000;
        
        const augmentedDetails = { ...details, duration };
        logAction(featureName, augmentedDetails);

        if (typeof result === 'string' && result.startsWith('data:image')) {
            (async () => {
                try {
                    const userId = getUserId();
                    const filename = `${featureName.replace(/\s/g, '_')}-${Date.now()}.png`;
                    const imageFile = await dataURLtoFile(result, filename);
                    const filePath = `${userId}/${filename}`;

                    const { error: uploadError } = await supabase.storage
                        .from('generated-images')
                        .upload(filePath, imageFile);
                    
                    if (uploadError) {
                        logError('adminUpload', uploadError.message);
                        return;
                    }

                    const { data: { publicUrl } } = supabase.storage
                        .from('generated-images')
                        .getPublicUrl(filePath);

                    logAction('generation', {
                        imageUrl: publicUrl,
                        prompt: details?.prompt,
                        originalFeature: featureName
                    });

                } catch (e) {
                    console.error("Admin upload failed (non-critical):", e);
                }
            })();
        }

        return result;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        logError(featureName, errorMessage);
        console.error(`Error in feature '${featureName}':`, error);
        throw error;
    }
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(blob);
        reader.onload = () => {
            const bytes = new Uint8Array(reader.result as ArrayBuffer);
            const binary = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
            resolve(btoa(binary));
        };
        reader.onerror = (error) => reject(new Error("Could not convert file to base64."));
    });
};

const fileToPart = async (file: File): Promise<{ inlineData: { mimeType: string; data: string; } }> => {
    const mimeType = file.type;
    const data = await blobToBase64(file);
    return { inlineData: { mimeType, data } };
};

const dataUrlToPart = (dataUrl: string): { inlineData: { mimeType: string; data: string; } } => {
    const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match) throw new Error('Invalid data URL format');
    return { inlineData: { mimeType: match[1], data: match[2] } };
};

const handleSingleApiResponse = (
    response: GenerateContentResponse,
    context: string 
): string => {
    if (response.promptFeedback?.blockReason) {
        throw new Error(`Blocked: ${response.promptFeedback.blockReason}`);
    }

    const imagePartFromResponse = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (imagePartFromResponse?.inlineData) {
        const { mimeType, data } = imagePartFromResponse.inlineData;
        return `data:${mimeType};base64,${data}`;
    }

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
        throw new Error(`AI stopped: ${finishReason}`);
    }
    
    const textFeedback = response.text?.trim();
    throw new Error(`No image returned. AI said: "${textFeedback || 'Unknown error'}"`);
};


export const generateEditedImage = async (
    originalImage: string,
    userPrompt: string,
    maskImage: File,
): Promise<string> => {
    return timedApiCall('retouch', { prompt: userPrompt }, async () => {
        const ai = getAiClient();
        const originalImagePart = dataUrlToPart(originalImage);
        const maskImagePart = await fileToPart(maskImage);
        const systemPrompt = `You are a precision digital artist. Edit the image based on the prompt ONLY in the white areas of the mask. The black areas of the mask must remain completely untouched. The edit must be seamless and hyper-realistic.`;
        const prompt = `${systemPrompt}\n\nUser's request: "${userPrompt}"`;

        const response = await generateWithFallback(ai, {
            contents: { parts: [originalImagePart, maskImagePart, { text: prompt }] },
            config: { responseModalities: [Modality.IMAGE] },
        });

        return handleSingleApiResponse(response, 'edit');
    });
};

export const generateBackgroundAlteredImage = async (
    originalImage: string,
    alterationPrompt: string,
): Promise<string> => {
    return timedApiCall('background', { prompt: alterationPrompt }, async () => {
        const ai = getAiClient();
        const systemPrompt = `Isolate the main subject and replace the background. Subject must be preserved perfectly. The new background should realistically match the subject's lighting and perspective.`;
        const finalPrompt = `${systemPrompt}\n\nUser's request: "${alterationPrompt}"`;
        const originalImagePart = dataUrlToPart(originalImage);

        const response = await generateWithFallback(ai, {
            contents: { parts: [originalImagePart, { text: finalPrompt }] },
            config: { responseModalities: [Modality.IMAGE] },
        });
        
        return handleSingleApiResponse(response, 'background');
    });
};

export const getAssistantResponse = async (
    history: any[],
    newMessage: string
): Promise<string> => {
    return "Assistant is currently disabled.";
};

export const generateImageFromText = async (
    prompt: string,
): Promise<string> => {
    return timedApiCall('generateImage', { prompt }, async () => {
        const ai = getAiClient();
        const response = await generateWithFallback(ai, {
            contents: { parts: [{ text: prompt }] },
            config: { responseModalities: [Modality.IMAGE] },
        });
        return handleSingleApiResponse(response, 'generate image');
    });
};

export const generateLogo = async (
    userPrompt: string,
    existingLogoDataUrl?: string | null,
    backgroundImageDataUrl?: string | null,
): Promise<string> => {
    return timedApiCall('generateLogo', { prompt: userPrompt }, async () => {
        const ai = getAiClient();
        let systemPrompt = !existingLogoDataUrl && !backgroundImageDataUrl 
            ? `You are a professional logo designer AI. Create a unique, high-quality logo based on the user's description. Focus on symbolic iconography.`
            : `You are a professional logo designer AI. Modify the existing logo or place a new logo on the provided background based on the user's description.`;
        
        const prompt = `${systemPrompt}\n\nUser's request: "${userPrompt}"`;
        let parts: any[] = [{ text: prompt }];

        if (backgroundImageDataUrl) parts.unshift(dataUrlToPart(backgroundImageDataUrl));
        else if (existingLogoDataUrl) parts.unshift(dataUrlToPart(existingLogoDataUrl));

        const response = await generateWithFallback(ai, {
            contents: { parts: parts },
            config: { responseModalities: [Modality.IMAGE] },
        });

        return handleSingleApiResponse(response, 'logo generation');
    });
};

export const generateMagicEdit = async (
    originalImage: string,
    userPrompt: string,
): Promise<string> => {
    return timedApiCall('magicEdit', { prompt: userPrompt }, async () => {
        const ai = getAiClient();
        const originalImagePart = dataUrlToPart(originalImage);
        const response = await generateWithFallback(ai, {
            contents: { parts: [originalImagePart, { text: userPrompt }] },
            config: { responseModalities: [Modality.IMAGE] },
        });
        return handleSingleApiResponse(response, 'magic edit');
    });
};

export const composeImages = async (
    originalImage: string,
    secondImage: string,
    userPrompt: string,
): Promise<string> => {
    return timedApiCall('composeImages', { prompt: userPrompt }, async () => {
        const ai = getAiClient();
        const originalImagePart = dataUrlToPart(originalImage);
        const secondImagePart = dataUrlToPart(secondImage);
        const response = await generateWithFallback(ai, {
            contents: { parts: [originalImagePart, secondImagePart, { text: userPrompt }] },
            config: { responseModalities: [Modality.IMAGE] },
        });
        return handleSingleApiResponse(response, 'image composition');
    });
};

export const enhancePrompt = async (
    userPrompt: string,
    image?: string | null,
): Promise<string> => {
    return timedApiCall('enhancePrompt', { prompt: userPrompt, hasImage: !!image }, async () => {
        const ai = getAiClient();
        const parts: any[] = [{ text: userPrompt }];
        let systemInstruction = `You are a prompt engineering expert. Expand the user's brief idea into a detailed prompt for high-quality image generation. Respond ONLY with the enhanced prompt.`;

        if (image) {
            parts.unshift(dataUrlToPart(image));
            systemInstruction = `You are a prompt engineering expert. Analyze the provided image and the user's brief instruction. Expand it into a detailed prompt for high-quality image generation. Respond ONLY with the enhanced prompt.`;
        }
        
        const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash-preview', 
            contents: { parts: parts },
            config: { systemInstruction: systemInstruction },
        }));

        const enhanced = response.text?.trim();
        if (!enhanced) throw new Error("The AI could not enhance the prompt.");
        return enhanced;
    });
};

// --- Supabase Storage ---
export interface SupabaseStoredImage {
    url: string;
    name: string;
    timestamp: number;
}

export const saveImageToGallery = async (imageFile: File): Promise<void> => {
    const authInstance = auth;
    if (!authInstance) throw new Error("Firebase Auth not initialized.");
    const userId = authInstance.currentUser?.uid;
    if (!userId) throw new Error("User not authenticated.");
    const filePath = `${userId}/${imageFile.name}`;
    const { error } = await supabase.storage.from('gallery-images').upload(filePath, imageFile);
    if (error) throw new Error(error.message);
};

export const getImagesFromGallery = async (userId: string): Promise<SupabaseStoredImage[]> => {
    const { data: fileList, error: listError } = await supabase.storage
        .from('gallery-images')
        .list(userId, { limit: 100, offset: 0, sortBy: { column: 'created_at', order: 'desc' } });

    if (listError) throw new Error(listError.message);
    if (!fileList) return [];

    return fileList.map(file => ({
        url: supabase.storage.from('gallery-images').getPublicUrl(`${userId}/${file.name}`).data.publicUrl,
        name: file.name,
        timestamp: file.created_at ? new Date(file.created_at).getTime() : 0,
    }));
};

export const deleteImageFromGallery = async (imageName: string, userId: string): Promise<void> => {
    const filePath = `${userId}/${imageName}`;
    const { error } = await supabase.storage.from('gallery-images').remove([filePath]);
    if (error) throw new Error(error.message);
};

export const deleteGeneratedImage = async (action: { id: string, details: { imageUrl: string } }): Promise<void> => {
    if (!action.id || !action.details.imageUrl) throw new Error("Action ID or Image URL is missing.");
    const { id: actionId, details: { imageUrl } } = action;

    try {
        const url = new URL(imageUrl);
        const bucketId = 'generated-images';
        const pathIdentifier = `/storage/v1/object/public/${bucketId}/`;
        const pathStartIndex = url.pathname.indexOf(pathIdentifier);
        if (pathStartIndex === -1) throw new Error(`Could not parse file path.`);
        
        const filePath = decodeURIComponent(url.pathname.substring(pathStartIndex + pathIdentifier.length));
        const { error } = await supabase.storage.from(bucketId).remove([filePath]);
        if (error) throw new Error(`Supabase storage error: ${error.message}`);
    } catch (e) {
        console.error("Supabase deletion error:", e);
        throw new Error(`Failed to delete image from cloud storage.`);
    }

    try {
        // Capture database locally to ensure TS knows it exists
        const db = database;
        if (!db) throw new Error("Firebase is not configured.");
        await remove(ref(db, `actions/${actionId}`));
    } catch(e) {
        console.error("Log removal error:", e);
        throw new Error(`Image deleted, but failed to remove log.`);
    }
};
