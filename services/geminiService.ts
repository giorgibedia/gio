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
// Using 2.5 Flash Image as primary. 
// Fallback is set to the same model to provide a second round of retries on 429/503 errors.
// NOTE: gemini-2.0-flash-exp caused 400 errors as it doesn't support image modalities.
const PRIMARY_IMAGE_MODEL = 'gemini-2.5-flash-image';
const FALLBACK_IMAGE_MODEL = 'gemini-2.5-flash-image';

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
 */
const getAiClient = (): GoogleGenAI => {
    let apiKey: string | undefined;
    const providedKey = "AIzaSyAlxwqP5mywXvsBig0WwsvLgyf8ijbspyo";

    if (isMobileApp()) {
      apiKey = providedKey;
      console.log("Mobile App/APK Environment detected. Using embedded API Key.");
    } else {
      apiKey = process.env.API_KEY || providedKey;
    }

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
        console.log(`Detected API requested wait time: ${seconds}s`);
        // Add a small buffer
        return Math.ceil(seconds * 1000) + 1000;
    }
    return 0;
};

/**
 * Wraps an async operation with robust retry logic.
 */
const retryOperation = async <T>(
    operation: () => Promise<T>, 
    maxRetries: number = 2, // Reduced retries to avoid long hangs
    initialDelay: number = 2000
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

            if ((isRateLimit || isServerOverload) && i < maxRetries) {
                let delay = getRetryDelay(error);
                if (delay === 0) delay = initialDelay * Math.pow(2, i);

                // UX IMPROVEMENT: If the API asks to wait more than 15 seconds, 
                // it's better to fail fast and let the user try again later (or switch models)
                // rather than freezing the app for a minute.
                if (delay > 15000) {
                    console.warn(`Wait time (${(delay/1000).toFixed(1)}s) is too long. Aborting retry to fallback.`);
                    throw new Error(`High traffic: Server requested ${Math.round(delay/1000)}s wait. Please try again.`);
                }

                const waitTimeSec = (delay/1000).toFixed(1);
                console.warn(`API Rate Limit hit. Waiting ${waitTimeSec}s before attempt ${i + 2}/${maxRetries + 1}...`);
                await wait(delay);
                continue;
            }
            break;
        }
    }
    throw lastError;
};

/**
 * Executes a generation request with a fallback mechanism and retry logic.
 */
const generateWithFallback = async (
    ai: GoogleGenAI, 
    params: any
): Promise<GenerateContentResponse> => {
    try {
        console.log(`Attempting generation with ${PRIMARY_IMAGE_MODEL}...`);
        return await retryOperation(() => ai.models.generateContent({
            ...params,
            model: PRIMARY_IMAGE_MODEL
        }));
    } catch (error: any) {
        const errString = error.toString();
        // If it's a 429 (High traffic) or 403 (Permission), try the fallback model.
        if (errString.includes('429') || errString.includes('High traffic') || errString.includes('403') || errString.includes('PERMISSION_DENIED') || errString.includes('404') || errString.includes('NOT_FOUND')) {
            console.warn(`Primary model failed (${errString}). Retrying with ${FALLBACK_IMAGE_MODEL}.`);
            
            return await retryOperation(() => ai.models.generateContent({
                ...params,
                model: FALLBACK_IMAGE_MODEL
            }));
        }
        throw error;
    }
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

        // ONLY attempt to upload to admin panel if we have a valid User ID from Auth.
        // If auth is disabled (auth?.currentUser is undefined), skip this to prevent errors.
        if (auth?.currentUser && typeof result === 'string' && result.startsWith('data:image')) {
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
                        // logError('adminUpload', uploadError.message);
                        console.warn("Admin upload skipped or failed:", uploadError.message);
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
        
        // SWITCH to 1.5-flash for text tasks to save 2.5-image quota and ensure speed.
        const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-1.5-flash', 
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
    // FIX: Check if auth and auth.currentUser exist before accessing uid
    if (!auth || !auth.currentUser) {
        throw new Error("Cloud storage is temporarily unavailable (Maintenance).");
    }
    const userId = auth.currentUser.uid;
    
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
        if (!database) throw new Error("Firebase is not configured.");
        await remove(ref(database, `actions/${actionId}`));
    } catch(e) {
        console.error("Log removal error:", e);
        throw new Error(`Image deleted, but failed to remove log.`);
    }
};