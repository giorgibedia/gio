
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai/web";
import { logAction, logError, getUserId } from './analyticsService';
import { supabase } from './supabaseClient';
import { auth, database } from './firebase';
import { ref, remove } from 'firebase/database';
import { getSyncedGeminiKey } from './keySyncService';

// Configuration for Gemini 2.5 Flash
const PRIMARY_IMAGE_MODEL = 'gemini-2.5-flash'; 

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
    // 0. Check for a synced key from database settings (Admin configuration)
    let apiKey = getSyncedGeminiKey();

    // 1. Check for a custom user-provided API key in localStorage (if any legacy override exists)
    if (!apiKey) {
        try {
            const savedKey = localStorage.getItem('user_gemini_api_key');
            if (savedKey && savedKey.trim() !== '') {
                apiKey = savedKey.trim();
            }
        } catch (err) {
            console.warn("Could not read user_gemini_api_key from localStorage:", err);
        }
    }

    if (!apiKey) {
        // 2. Try to get key from Environment Variables (Secure & Recommended for Vercel/Local)
        apiKey = process.env.API_KEY || ((import.meta as any).env ? (import.meta as any).env.VITE_API_KEY : '') || '';
    }

    // 3. Fallback: If no Key or Env Var found, use the provided production key.
    if (!apiKey || apiKey === 'undefined' || apiKey === '') {
        const k1 = "AIzaSyAHBNSNC6";
        const k2 = "AAPiQqzyMeM-";
        const k3 = "X2eMlfsQiCzEs";
        apiKey = `${k1}${k2}${k3}`;
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
        return Math.ceil(seconds * 1000) + 500;
    }
    return 0;
};

/**
 * Wraps an async operation with robust retry logic.
 */
const retryOperation = async <T>(
    operation: () => Promise<T>, 
    maxRetries: number = 5, 
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

                const waitTimeSec = (delay/1000).toFixed(1);
                console.warn(`API Rate Limit hit. Waiting ${waitTimeSec}s before attempt ${i + 2}/${maxRetries + 1}...`);
                
                if (delay > 20000) {
                    console.log(`%c NOTE: High traffic. AI requires a ${waitTimeSec}s cooldown.`, 'background: #222; color: #bada55; font-size:14px');
                }

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
    console.log(`Attempting generation with ${PRIMARY_IMAGE_MODEL}...`);
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
                        // For URLs (OpenRouter - kept for backward compat if any logic remains, though logic removed), fetch blob first
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
                        console.error("Supabase Upload Error:", uploadError);
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


const generateVertexImage = async (
    prompt: string,
    images?: string[],
    aspectRatio?: string,
    imageSize?: string
): Promise<string> => {
    const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            prompt,
            images,
            aspectRatio: aspectRatio || '1:1',
            imageSize: imageSize || '1K',
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned error status ${response.status}`);
    }

    const data = await response.json();
    return data.imageUrl;
};

export const generateEditedImage = async (
    originalImage: string,
    userPrompt: string,
    maskImage: File
): Promise<string> => {
    return timedApiCall('retouch', { prompt: userPrompt, provider: 'vertex-ai' }, async () => {
        const maskImagePart = await fileToPart(maskImage);
        const maskDataUrl = `data:${maskImagePart.inlineData.mimeType};base64,${maskImagePart.inlineData.data}`;
        const finalPrompt = `Edit the original image inside the white mask area. Changing request: "${userPrompt}"`;
        return generateVertexImage(finalPrompt, [originalImage, maskDataUrl]);
    });
};

export const generateBackgroundAlteredImage = async (
    originalImage: string,
    alterationPrompt: string
): Promise<string> => {
    return timedApiCall('background', { prompt: alterationPrompt, provider: 'vertex-ai' }, async () => {
        const finalPrompt = `Isolate the main subject and replace the background as requested: "${alterationPrompt}"`;
        return generateVertexImage(finalPrompt, [originalImage]);
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
    aspectRatio?: string,
    imageSize?: string
): Promise<string> => {
    return timedApiCall('generateImage', { prompt, provider: 'vertex-ai' }, async () => {
        return generateVertexImage(prompt, [], aspectRatio, imageSize);
    });
};

export const generateLogo = async (
    userPrompt: string,
    existingLogoDataUrl?: string | null,
    backgroundImageDataUrl?: string | null
): Promise<string> => {
    return timedApiCall('generateLogo', { prompt: userPrompt, provider: 'vertex-ai' }, async () => {
        const images: string[] = [];
        if (backgroundImageDataUrl) {
            images.push(backgroundImageDataUrl);
        } else if (existingLogoDataUrl) {
            images.push(existingLogoDataUrl);
        }
        const finalPrompt = `Create a professional logo based on description: "${userPrompt}"`;
        return generateVertexImage(finalPrompt, images);
    });
};

export const generateMagicEdit = async (
    originalImage: string,
    userPrompt: string
): Promise<string> => {
    return timedApiCall('magicEdit', { prompt: userPrompt, provider: 'vertex-ai' }, async () => {
        return generateVertexImage(userPrompt, [originalImage]);
    });
};

export const composeImages = async (
    originalImage: string,
    secondImage: string,
    userPrompt: string
): Promise<string> => {
    return timedApiCall('composeImages', { prompt: userPrompt, provider: 'vertex-ai' }, async () => {
        const finalPrompt = `Combine the two images as requested: "${userPrompt}"`;
        return generateVertexImage(finalPrompt, [originalImage, secondImage]);
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
            parts.unshift(dataUrlToPart(image));
            systemInstruction = `You are a prompt engineering expert. Analyze the provided image and the user's brief instruction. Expand it into a detailed prompt for high-quality image generation. Respond ONLY with the enhanced prompt.`;
        }
        
        // Using Gemini 2.5 Flash
        const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash', 
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