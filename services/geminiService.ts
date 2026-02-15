
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";
import { logAction, logError, getUserId } from './analyticsService';
import { supabase } from './supabaseClient';
import { auth, database } from './firebase';
import { ref, remove } from 'firebase/database';

// Configuration for Gemini Model
// Using 'gemini-2.5-flash-image' (Nano Banana) as requested for efficient generation.
const PRIMARY_IMAGE_MODEL = 'gemini-2.5-flash-image'; 
// Using gemini-2.0-flash for text tasks to save quota on the image model and reduce 429s.
const TEXT_MODEL = 'gemini-2.0-flash';

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
 * Robustly resizes an image Data URL to ensure it fits within token limits.
 * Default is 512px.
 */
const resizeImageForApi = (dataUrl: string, maxDimension: number = 512): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;
            // If already small enough, return original
            if (width <= maxDimension && height <= maxDimension) {
                resolve(dataUrl);
                return;
            }
            // Calculate new dimensions
            if (width > height) {
                height = Math.round(height * (maxDimension / width));
                width = maxDimension;
            } else {
                width = Math.round(width * (maxDimension / height));
                height = maxDimension;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            // Draw on white background to handle transparency correctly
            if (ctx) {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                // Export as efficient JPEG with slightly lower quality to further save bytes
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            } else {
                resolve(dataUrl); // Fallback
            }
        };
        img.onerror = () => {
            console.warn("Failed to resize image for API, sending original.");
            resolve(dataUrl);
        };
        img.src = dataUrl;
    });
};

/**
 * A robust way to get the Gemini AI client.
 */
const getAiClient = (): GoogleGenAI => {
    // The API key is injected via vite.config.ts (process.env.API_KEY).
    // It handles the fallback logic securely.
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
        console.log(`Detected API requested wait time: ${seconds}s`);
        return Math.ceil(seconds * 1000) + 500;
    }
    return 0;
};

/**
 * Wraps an async operation with robust retry logic.
 */
const retryOperation = async <T>(
    operation: () => Promise<T>, 
    maxRetries: number = 3, 
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
                
                // Allow slightly longer wait times (up to 25s) before giving up, to handle short spikes
                // But still fail fast if > 25s to avoid bad UX
                if (delay > 25000) {
                    throw new Error(`System is currently busy (High Traffic). Please wait ${Math.ceil(delay/1000)} seconds and try again.`);
                }

                if (delay === 0) delay = initialDelay * Math.pow(2, i);

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
 * Executes a generation request using the primary model.
 */
const generateWithModel = async (
    ai: GoogleGenAI, 
    params: any
): Promise<GenerateContentResponse> => {
    return await retryOperation(() => ai.models.generateContent({
        ...params,
        model: PRIMARY_IMAGE_MODEL
    }));
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

        if (typeof result === 'string' && (result.startsWith('data:image') || result.startsWith('http'))) {
            (async () => {
                try {
                    const userId = getUserId();
                    const filename = `${featureName.replace(/\s/g, '_')}-${Date.now()}.png`;
                    let imageFile: File;
                    
                    if (result.startsWith('http')) {
                        const res = await fetch(result);
                        const blob = await res.blob();
                        imageFile = new File([blob], filename, { type: blob.type });
                    } else {
                        imageFile = await dataURLtoFile(result, filename);
                    }
                    
                    const filePath = `${userId}/${filename}`;

                    const { error: uploadError } = await supabase.storage
                        .from('generated-images')
                        .upload(filePath, imageFile, { 
                            upsert: true 
                        });
                    
                    if (uploadError) {
                        logError('adminUpload', `${uploadError.message} (User: ${userId})`);
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
                    // console.error("Admin upload failed (non-critical):", e);
                }
            })();
        }

        return result;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        // Don't log rate limit errors as application errors to avoid clutter
        if (!errorMessage.includes('429') && !errorMessage.includes('busy')) {
             logError(featureName, errorMessage);
        }
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

    // Iterate through all parts to find the image, as per SDK guidelines for Flash Image models
    const imagePartFromResponse = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (imagePartFromResponse?.inlineData) {
        const { mimeType, data } = imagePartFromResponse.inlineData;
        return `data:${mimeType};base64,${data}`;
    }

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
        throw new Error(`AI stopped: ${finishReason}`);
    }
    
    // Check if there is text content (error message from model) if no image found
    const textFeedback = response.text?.trim();
    throw new Error(`No image returned. AI said: "${textFeedback || 'Unknown error'}"`);
};


export const generateEditedImage = async (
    originalImage: string,
    userPrompt: string,
    maskImage: File
): Promise<string> => {
    return timedApiCall('retouch', { prompt: userPrompt, provider: 'google' }, async () => {
        
        // Ensure input is optimized size (512px)
        const optimizedImage = await resizeImageForApi(originalImage, 512);

        // Google Logic
        const ai = getAiClient();
        const originalImagePart = dataUrlToPart(optimizedImage);
        const maskImagePart = await fileToPart(maskImage);
        const systemPrompt = `You are a precision digital artist. Edit the image based on the prompt ONLY in the white areas of the mask. The black areas of the mask must remain completely untouched. The edit must be seamless and hyper-realistic.`;
        const prompt = `${systemPrompt}\n\nUser's request: "${userPrompt}"`;

        const response = await generateWithModel(ai, {
            contents: { parts: [originalImagePart, maskImagePart, { text: prompt }] },
            config: { responseModalities: [Modality.IMAGE] },
        });

        return handleSingleApiResponse(response, 'edit');
    });
};

export const generateBackgroundAlteredImage = async (
    originalImage: string,
    alterationPrompt: string
): Promise<string> => {
    return timedApiCall('background', { prompt: alterationPrompt, provider: 'google' }, async () => {

        // Ensure input is optimized size (512px)
        const optimizedImage = await resizeImageForApi(originalImage, 512);

        const ai = getAiClient();
        const systemPrompt = `Isolate the main subject and replace the background. Subject must be preserved perfectly. The new background should realistically match the subject's lighting and perspective.`;
        const finalPrompt = `${systemPrompt}\n\nUser's request: "${alterationPrompt}"`;
        const originalImagePart = dataUrlToPart(optimizedImage);

        const response = await generateWithModel(ai, {
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
    // Basic Chat implementation
    try {
        const ai = getAiClient();
        // Use gemini-2.0-flash for fast, cheap text responses
        const chat = ai.chats.create({
            model: TEXT_MODEL,
            history: history,
        });
        const result = await chat.sendMessage({ message: newMessage });
        return result.text || "I'm not sure how to respond to that.";
    } catch (e) {
        console.error(e);
        return "I'm having trouble connecting right now.";
    }
};

export const generateImageFromText = async (
    prompt: string
): Promise<string> => {
    return timedApiCall('generateImage', { prompt, provider: 'google' }, async () => {

        const ai = getAiClient();
        const response = await generateWithModel(ai, {
            contents: { parts: [{ text: prompt }] },
            config: { responseModalities: [Modality.IMAGE] },
        });
        return handleSingleApiResponse(response, 'generate image');
    });
};

export const generateLogo = async (
    userPrompt: string,
    existingLogoDataUrl?: string | null,
    backgroundImageDataUrl?: string | null
): Promise<string> => {
    return timedApiCall('generateLogo', { prompt: userPrompt, provider: 'google' }, async () => {

        const ai = getAiClient();
        let systemPrompt = !existingLogoDataUrl && !backgroundImageDataUrl 
            ? `You are a professional logo designer AI. Create a unique, high-quality logo based on the user's description. Focus on symbolic iconography.`
            : `You are a professional logo designer AI. Modify the existing logo or place a new logo on the provided background based on the user's description.`;
        
        const prompt = `${systemPrompt}\n\nUser's request: "${userPrompt}"`;
        let parts: any[] = [{ text: prompt }];

        if (backgroundImageDataUrl) {
            // Aggressively resize background to 256px for context
            const resizedBg = await resizeImageForApi(backgroundImageDataUrl, 256);
            parts.unshift(dataUrlToPart(resizedBg));
        }
        else if (existingLogoDataUrl) {
            // CRITICAL FIX: Resize the "logoInProgress" to 256px before sending it back to the API.
            // 256px is sufficient for context but drastic token saving compared to 1024px.
            const resizedLogo = await resizeImageForApi(existingLogoDataUrl, 256);
            parts.unshift(dataUrlToPart(resizedLogo));
        }

        const response = await generateWithModel(ai, {
            contents: { parts: parts },
            config: { responseModalities: [Modality.IMAGE] },
        });

        return handleSingleApiResponse(response, 'logo generation');
    });
};

export const generateMagicEdit = async (
    originalImage: string,
    userPrompt: string
): Promise<string> => {
    return timedApiCall('magicEdit', { prompt: userPrompt, provider: 'google' }, async () => {

        // Ensure input is optimized size (512px)
        const optimizedImage = await resizeImageForApi(originalImage, 512);

        const ai = getAiClient();
        const originalImagePart = dataUrlToPart(optimizedImage);
        const response = await generateWithModel(ai, {
            contents: { parts: [originalImagePart, { text: userPrompt }] },
            config: { responseModalities: [Modality.IMAGE] },
        });
        return handleSingleApiResponse(response, 'magic edit');
    });
};

export const composeImages = async (
    originalImage: string,
    secondImage: string,
    userPrompt: string
): Promise<string> => {
    return timedApiCall('composeImages', { prompt: userPrompt, provider: 'google' }, async () => {

        // Ensure both inputs are optimized to 512px
        const optimizedOriginal = await resizeImageForApi(originalImage, 512);
        const optimizedSecond = await resizeImageForApi(secondImage, 512);

        const ai = getAiClient();
        const originalImagePart = dataUrlToPart(optimizedOriginal);
        const secondImagePart = dataUrlToPart(optimizedSecond);
        const response = await generateWithModel(ai, {
            contents: { parts: [originalImagePart, secondImagePart, { text: userPrompt }] },
            config: { responseModalities: [Modality.IMAGE] },
        });
        return handleSingleApiResponse(response, 'image composition');
    });
};

export const enhancePrompt = async (
    userPrompt: string,
    image?: string | null
): Promise<string> => {
    return timedApiCall('enhancePrompt', { prompt: userPrompt, hasImage: !!image, provider: 'google' }, async () => {
        const ai = getAiClient();
        const parts: any[] = [{ text: userPrompt }];
        let systemInstruction = `You are a prompt engineering expert. Expand the user's brief idea into a detailed prompt for high-quality image generation. Respond ONLY with the enhanced prompt.`;

        if (image) {
            // Resize for text analysis as well to save tokens (256px for text context is enough)
            const resizedContext = await resizeImageForApi(image, 256); 
            parts.unshift(dataUrlToPart(resizedContext));
            systemInstruction = `You are a prompt engineering expert. Analyze the provided image and the user's brief instruction. Expand it into a detailed prompt for high-quality image generation. Respond ONLY with the enhanced prompt.`;
        }
        
        // Using Gemini 2.0 Flash for text capability (Faster/Cheaper)
        const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
            model: TEXT_MODEL, 
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
