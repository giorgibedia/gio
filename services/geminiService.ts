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
// Switched to Gemini 2.5 as primary to ensure stability and avoid 403 errors
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
 * This checks for Android WebViews, local file protocols, or iOS environments.
 * @returns True if running in a mobile app/APK environment.
 */
export const isMobileApp = (): boolean => {
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  
  // Check for Android WebView specific indicators
  // "wv" is common in Android WebView user agents
  const isAndroidWebView = /android/i.test(userAgent) && /wv/i.test(userAgent);
  
  // Check if running from local file system (common in standard APK builds)
  const isLocalFile = window.location.protocol === 'file:';

  // Check for iOS WebView
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
  
  return isAndroidWebView || isLocalFile || isIOS;
};

/**
 * A robust way to get the Gemini AI client.
 * It checks for the API key's existence and validity right before instantiation.
 * This is a critical fix for potential environment issues on mobile platforms,
 * where environment variables might become unavailable during the app's lifecycle.
 * @returns An instance of GoogleGenAI.
 * @throws An error if the API key is missing or invalid.
 */
const getAiClient = (): GoogleGenAI => {
    let apiKey: string | undefined;
    const providedKey = "AIzaSyAlxwqP5mywXvsBig0WwsvLgyf8ijbspyo";

    if (isMobileApp()) {
      // Hardcoded API key specific for APK/Mobile environment where .env might fail.
      // Using the key provided in previous context for iOS/Mobile
      apiKey = providedKey;
      console.log("Mobile App/APK Environment detected. Using embedded API Key.");
    } else {
      // Standard method for web, with fallback to hardcoded key
      apiKey = process.env.API_KEY || providedKey;
    }

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
        const errorMessage = "API Key is not configured or has become invalid. This can sometimes happen on mobile devices when the app is resumed. Please try reloading the application. If the problem persists, contact support.";
        console.error("Critical Error: API Key is missing or invalid. Value:", apiKey);
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
 * Google API often returns "Please retry in X s." or "retryDelay":"Xs"
 */
const getRetryDelay = (error: any): number => {
    let textToSearch = "";
    
    // Aggregate all possible error text sources
    if (typeof error === 'string') textToSearch += error;
    if (error.message) textToSearch += " " + error.message;
    if (error.toString) textToSearch += " " + error.toString();
    try {
        textToSearch += " " + JSON.stringify(error);
    } catch(e) {}

    // Regex to find "retry in X.XXs" or "retryDelay":"Xs"
    // Matches: "retry in 54.5s", "retryDelay": "54s", "retryDelay":"54s"
    const match = textToSearch.match(/retry in\s+([0-9.]+)\s*s/i) || 
                  textToSearch.match(/retryDelay"?\s*:\s*"?([0-9.]+)\s*s"?/i);
                  
    if (match && match[1]) {
        // Return seconds parsed as milliseconds, plus a 2-second safety buffer
        const seconds = parseFloat(match[1]);
        console.log(`Detected API requested wait time: ${seconds}s`);
        return Math.ceil(seconds * 1000) + 2000;
    }
    return 0;
};

/**
 * Wraps an async operation with robust retry logic for 429 (Rate Limit) errors.
 * It specifically handles long wait times requested by the API.
 */
const retryOperation = async <T>(
    operation: () => Promise<T>, 
    maxRetries: number = 6, // Increased retries
    initialDelay: number = 2000
): Promise<T> => {
    let lastError: any;
    
    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;
            // Create a comprehensive string for checking error type
            let errString = "";
            try {
                errString = (error.message || "") + (error.toString ? error.toString() : "") + JSON.stringify(error);
            } catch(e) { errString = "unknown error"; }
            
            // Check for 429 (Resource Exhausted / Too Many Requests) or 503 (Service Unavailable)
            const isRateLimit = errString.includes('429') || errString.includes('RESOURCE_EXHAUSTED') || errString.includes('quota');
            const isServerOverload = errString.includes('503') || errString.includes('Overloaded');

            if ((isRateLimit || isServerOverload) && i < maxRetries) {
                // 1. Try to get exact wait time from the error message
                let delay = getRetryDelay(error);
                
                // 2. If no specific time found, use exponential backoff
                if (delay === 0) {
                    delay = initialDelay * Math.pow(2, i);
                }

                // Log distinct warning so user knows it's waiting
                const waitTimeSec = (delay/1000).toFixed(1);
                console.warn(`API Rate Limit hit. Waiting ${waitTimeSec}s before attempt ${i + 2}/${maxRetries + 1}...`);
                
                // Wait the required amount
                await wait(delay);
                continue;
            }
            
            // If it's not a retriable error, or we ran out of retries, break loop
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
    // 1. Try Primary Model (with robust retries)
    try {
        console.log(`Attempting generation with ${PRIMARY_IMAGE_MODEL}...`);
        return await retryOperation(() => ai.models.generateContent({
            ...params,
            model: PRIMARY_IMAGE_MODEL
        }));
    } catch (error: any) {
        const errString = error.toString();
        
        // 2. Check for Permission/Access errors (403/404) to switch models
        // Note: 429 is handled inside retryOperation, so if we are here, retries failed or it's a diff error.
        if (errString.includes('403') || errString.includes('PERMISSION_DENIED') || errString.includes('404') || errString.includes('NOT_FOUND')) {
            console.warn(`Primary model ${PRIMARY_IMAGE_MODEL} failed (Access Restricted). Auto-switching to ${FALLBACK_IMAGE_MODEL}.`);
            
            // Try Fallback Model
            return await retryOperation(() => ai.models.generateContent({
                ...params,
                model: FALLBACK_IMAGE_MODEL
            }));
        }
        
        // Rethrow if it's a safety error or retries exhausted
        throw error;
    }
};

// NOTE TO USER: In your Supabase dashboard, you must create a NEW PUBLIC Storage bucket.
// This bucket must be named "generated-images".
// This will store all images generated by users for viewing in the admin panel.
//
// Example RLS Policies for the "generated-images" bucket:
// 1. Allow anyone to upload:
//    CREATE POLICY "Allow public uploads" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'generated-images');
// 2. Allow anyone to read:
//    CREATE POLICY "Allow public read access" ON storage.objects FOR SELECT USING (bucket_id = 'generated-images');

/**
 * A wrapper function to time API calls, log performance, and handle errors.
 * It now also handles uploading generated images to a separate bucket for admin review.
 * @param featureName The name of the feature being logged.
 * @param details Additional details to log (like prompts).
 * @param apiCall The async function to execute and time.
 * @returns The result of the apiCall.
 */
const timedApiCall = async <T>(
    featureName: string,
    details: Record<string, any> | null,
    apiCall: () => Promise<T>
): Promise<T> => {
    const startTime = Date.now();
    try {
        const result = await apiCall();
        const duration = (Date.now() - startTime) / 1000; // duration in seconds
        
        // Always log the primary action for performance tracking etc.
        const augmentedDetails = { ...details, duration };
        logAction(featureName, augmentedDetails);

        // If the result is an image, upload it for the admin panel and log a special 'generation' event.
        // This is a "fire-and-forget" operation so it doesn't slow down the user experience.
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
                        console.error('Admin Panel Upload Error:', uploadError.message);
                        logError('adminUpload', uploadError.message);
                        return; // Exit if upload fails
                    }

                    // Retrieve the public URL after successful upload
                    const { data: { publicUrl } } = supabase.storage
                        .from('generated-images')
                        .getPublicUrl(filePath);

                    // Log a separate, dedicated action for the image feed
                    logAction('generation', {
                        imageUrl: publicUrl,
                        prompt: details?.prompt, // Pass along the original prompt
                        originalFeature: featureName // Keep track of the source feature
                    });

                } catch (e) {
                    console.error("Failed to save generated image for admin panel:", e);
                    logError('adminUpload', e instanceof Error ? e.message : 'Unknown error during admin upload');
                }
            })();
        }

        return result;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        logError(featureName, errorMessage);
        console.error(`Error in feature '${featureName}':`, error);
        throw error; // Re-throw the error to be handled by the UI
    }
};

/**
 * Converts a Blob object to a base64 encoded string.
 */
const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(blob);
        reader.onload = () => {
            const bytes = new Uint8Array(reader.result as ArrayBuffer);
            const binary = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
            resolve(btoa(binary));
        };
        reader.onerror = (error) => {
            console.error("Error converting blob to base64:", error);
            reject(new Error("Could not convert file to base64."));
        };
    });
};

/**
 * Converts a File object to a Gemini API Part using a robust base64 conversion method.
 */
const fileToPart = async (file: File): Promise<{ inlineData: { mimeType: string; data: string; } }> => {
    const mimeType = file.type;
    const data = await blobToBase64(file);
    return { inlineData: { mimeType, data } };
};

/**
 * Converts a data URL string to a Gemini API Part.
 */
const dataUrlToPart = (dataUrl: string): { inlineData: { mimeType: string; data: string; } } => {
    const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match) {
        throw new Error('Invalid data URL format');
    }
    const mimeType = match[1];
    const data = match[2];
    return { inlineData: { mimeType, data } };
};

const handleSingleApiResponse = (
    response: GenerateContentResponse,
    context: string 
): string => {
    if (response.promptFeedback?.blockReason) {
        const { blockReason, blockReasonMessage } = response.promptFeedback;
        const userMessage = `This request could not be completed due to safety guidelines (${blockReason}). Please try a different prompt or image.`;
        console.error(`Request blocked: ${blockReason}. ${blockReasonMessage || ''}`, { response });
        throw new Error(userMessage);
    }

    const imagePartFromResponse = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (imagePartFromResponse?.inlineData) {
        const { mimeType, data } = imagePartFromResponse.inlineData;
        console.log(`Received image data (${mimeType}) for ${context}`);
        return `data:${mimeType};base64,${data}`;
    }

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
        let userMessage = `The request could not be completed. The AI stopped for the following reason: ${finishReason}. This is often related to safety settings. Please try a different prompt or image.`;
        
        if (finishReason === 'RECITATION') {
            userMessage = 'The AI was unable to generate this image because the result was too similar to a known, possibly copyrighted, image. Please try a more generic or different prompt.';
        }

        console.error(`Image generation stopped unexpectedly. Reason: ${finishReason}.`, { response });
        throw new Error(userMessage);
    }
    
    const textFeedback = response.text?.trim();
    const userMessage = `The AI did not return an image. ${textFeedback ? `It responded with: "${textFeedback}"` : 'This can happen if the request is unclear or violates safety policies. Please try rephrasing your prompt.'}`;
    console.error(`Model response did not contain an image part for ${context}.`, { response });
    throw new Error(userMessage);
};


export const generateEditedImage = async (
    originalImage: string,
    userPrompt: string,
    maskImage: File,
): Promise<string> => {
    return timedApiCall('retouch', { prompt: userPrompt }, async () => {
        const ai = getAiClient();
        console.log(`Starting generative edit with mask...`);
        
        const originalImagePart = dataUrlToPart(originalImage);
        const maskImagePart = await fileToPart(maskImage);

        const systemPrompt = `You are a precision digital artist. Edit the image based on the prompt ONLY in the white areas of the mask. The black areas of the mask must remain completely untouched. The edit must be seamless and hyper-realistic.`;
        const prompt = `${systemPrompt}\n\nUser's request: "${userPrompt}"`;

        const textPart = { text: prompt };

        const response = await generateWithFallback(ai, {
            contents: { parts: [originalImagePart, maskImagePart, textPart] },
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
        console.log(`Starting background alteration: ${alterationPrompt}`);
        
        const systemPrompt = `Isolate the main subject and replace the background. Subject must be preserved perfectly. The new background should realistically match the subject's lighting and perspective.`;
        const finalPrompt = `${systemPrompt}\n\nUser's request: "${alterationPrompt}"`;

        const originalImagePart = dataUrlToPart(originalImage);
        const textPart = { text: finalPrompt };

        const response = await generateWithFallback(ai, {
            contents: { parts: [originalImagePart, textPart] },
            config: { responseModalities: [Modality.IMAGE] },
        });
        
        return handleSingleApiResponse(response, 'background');
    });
};

// Chat assistant logic removed as per previous requests, keeping function empty/placeholder or removed.
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
        console.log(`Starting image generation from text...`);
        
        const textPart = { text: prompt };
        
        const response = await generateWithFallback(ai, {
            contents: { parts: [textPart] },
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
    return timedApiCall('generateLogo', { prompt: userPrompt, hasExisting: !!existingLogoDataUrl, hasBackground: !!backgroundImageDataUrl }, async () => {
        const ai = getAiClient();
        let systemPrompt: string;

        if (!existingLogoDataUrl && !backgroundImageDataUrl) {
            systemPrompt = `You are a professional logo designer AI. Create a unique, high-quality logo based on the user's description. Focus on symbolic iconography.`;
        } else {
            systemPrompt = `You are a professional logo designer AI. Modify the existing logo or place a new logo on the provided background based on the user's description.`;
        }
        
        const prompt = `${systemPrompt}\n\nUser's request: "${userPrompt}"`;
        let parts: any[];

        if (backgroundImageDataUrl) {
            const imagePart = dataUrlToPart(backgroundImageDataUrl);
            const textPart = { text: prompt };
            parts = [imagePart, textPart];
        } else if (existingLogoDataUrl) {
            const imagePart = dataUrlToPart(existingLogoDataUrl);
            const textPart = { text: prompt };
            parts = [imagePart, textPart];
        } else {
            const textPart = { text: prompt };
            parts = [textPart];
        }

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
        console.log(`Starting generative maskless edit...`);
        const prompt = userPrompt;

        const originalImagePart = dataUrlToPart(originalImage);
        const textPart = { text: prompt };

        const response = await generateWithFallback(ai, {
            contents: { parts: [originalImagePart, textPart] },
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
        console.log(`Starting intelligent image composition...`);

        const originalImagePart = dataUrlToPart(originalImage);
        const secondImagePart = dataUrlToPart(secondImage);
        const textPart = { text: userPrompt };

        const response = await generateWithFallback(ai, {
            contents: { parts: [originalImagePart, secondImagePart, textPart] },
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
        console.log(`Enhancing prompt: "${userPrompt}"`);

        const parts: any[] = [];
        let systemInstruction: string;

        if (image) {
            parts.push(dataUrlToPart(image));
            systemInstruction = `You are a prompt engineering expert. Analyze the provided image and the user's brief instruction. Expand it into a detailed prompt for high-quality image generation. Respond ONLY with the enhanced prompt.`;
        } else {
            systemInstruction = `You are a prompt engineering expert. Expand the user's brief idea into a detailed prompt for high-quality image generation. Respond ONLY with the enhanced prompt.`;
        }
        
        parts.push({ text: userPrompt });

        // Using Gemini 2.5 Flash for text tasks to match user preference and ensuring compatibility
        const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash-preview', 
            contents: { parts: parts },
            config: { systemInstruction: systemInstruction },
        }));

        const enhanced = response.text?.trim();
        if (!enhanced) {
            throw new Error("The AI could not enhance the prompt.");
        }
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
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error("User not authenticated.");

    const filePath = `${userId}/${imageFile.name}`;
    const { error } = await supabase.storage
        .from('gallery-images')
        .upload(filePath, imageFile);

    if (error) {
        console.error('Error uploading to Supabase Storage:', error);
        throw new Error(error.message);
    }
};

export const getImagesFromGallery = async (userId: string): Promise<SupabaseStoredImage[]> => {
    const { data: fileList, error: listError } = await supabase.storage
        .from('gallery-images')
        .list(userId, {
            limit: 100,
            offset: 0,
            sortBy: { column: 'created_at', order: 'desc' },
        });

    if (listError) {
        console.error('Error listing files from Supabase:', listError);
        throw new Error(listError.message);
    }
    if (!fileList) return [];

    const images: SupabaseStoredImage[] = fileList.map(file => {
         const { data: { publicUrl } } = supabase.storage
            .from('gallery-images')
            .getPublicUrl(`${userId}/${file.name}`);
        
        return {
            url: publicUrl,
            name: file.name,
            timestamp: file.created_at ? new Date(file.created_at).getTime() : 0,
        };
    });
    return images;
};

export const deleteImageFromGallery = async (imageName: string, userId: string): Promise<void> => {
    const filePath = `${userId}/${imageName}`;
    const { error } = await supabase.storage
        .from('gallery-images')
        .remove([filePath]);

    if (error) {
        console.error('Error deleting file from Supabase:', error);
        throw new Error(error.message);
    }
};

export const deleteGeneratedImage = async (action: { id: string, details: { imageUrl: string } }): Promise<void> => {
    if (!action.id || !action.details.imageUrl) {
        throw new Error("Action ID or Image URL is missing for deletion.");
    }
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
        console.error("Error during Supabase file deletion phase:", e);
        throw new Error(`Failed to delete image from cloud storage.`);
    }

    try {
        if (!database) throw new Error("Firebase is not configured.");
        const actionRef = ref(database, `actions/${actionId}`);
        await remove(actionRef);
    } catch(e) {
        console.error("Failed to remove log entry:", e);
        throw new Error(`Image deleted, but failed to remove log.`);
    }
};