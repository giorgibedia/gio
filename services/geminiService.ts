
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";
import { logAction, logError, getUserId } from './analyticsService';
import { supabase } from './supabaseClient';
import { auth, database } from './firebase';
import { ref, remove } from 'firebase/database';

// Configuration for Intelligent Model Fallback (Google Internal Fallback)
// UPGRADED TO GEMINI 3 PRO for highest quality
const PRIMARY_IMAGE_MODEL = 'gemini-3-pro-image-preview'; 
const FALLBACK_IMAGE_MODEL = 'gemini-2.5-flash-image';

// OpenRouter Configuration
// LIST OF KEYS provided by user. The app will rotate through these if one is exhausted.
const OPENROUTER_API_KEYS = [
    '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', // Key 1 (Primary)
    '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'  // Key 2 (Backup)
];

// Using the specific model ID requested by user for OpenRouter
const OPENROUTER_MODEL = 'google/gemini-2.5-flash-image';

export type ModelProvider = 'google' | 'openrouter';

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
    // 1. Try to get key from Environment Variables (Secure & Recommended for Vercel/Local)
    let apiKey = process.env.API_KEY;

    // 2. Fallback: If no Env Var found (e.g. mobile build, or user hasn't set up Vercel envs),
    // use the provided production key.
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
 * Executes a generation request with a fallback mechanism and retry logic.
 * This is specific to Google's internal model fallback (e.g. Pro -> Flash).
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
        // If Gemini 3 Pro is not available (404/Not Found) or permission denied, fall back to Flash 2.5
        if (errString.includes('403') || errString.includes('PERMISSION_DENIED') || errString.includes('404') || errString.includes('NOT_FOUND')) {
            console.warn(`Primary model failed. Auto-switching to ${FALLBACK_IMAGE_MODEL}.`);
            return await retryOperation(() => ai.models.generateContent({
                ...params,
                model: FALLBACK_IMAGE_MODEL
            }));
        }
        throw error;
    }
};

/**
 * Executes a single request to OpenRouter with a specific key.
 */
const executeOpenRouterRequest = async (
    apiKey: string,
    prompt: string, 
    images: string[]
): Promise<string> => {
    const content: any[] = [{ type: "text", text: prompt }];
    
    // Add images to content
    images.forEach(img => {
        content.push({
            type: "image_url",
            image_url: { url: img }
        });
    });

    const siteUrl = "https://pixai.app";
    const siteTitle = "PixAI";

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey.trim()}`,
            "Content-Type": "application/json",
            "HTTP-Referer": siteUrl, 
            "X-Title": siteTitle
        },
        body: JSON.stringify({
            model: OPENROUTER_MODEL,
            messages: [
                {
                    role: "user",
                    content: content
                }
            ],
            temperature: 0.7,
            max_tokens: 1000,
            stream: false
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        let errMsg = `OpenRouter Error (${response.status}): ${response.statusText}`;
        
        try {
            const errData = JSON.parse(errText);
            if (errData.error?.message) {
                errMsg = errData.error.message;
            } else if (errData.error) {
                errMsg = JSON.stringify(errData.error);
            }
        } catch (e) {
            errMsg += ` - Details: ${errText.substring(0, 100)}`;
        }
        
        // Return errors that should trigger a key switch as specific messages
        if (response.status === 402 || errMsg.toLowerCase().includes('credits') || errMsg.toLowerCase().includes('balance') || errMsg.toLowerCase().includes('quota')) {
            throw new Error("QUOTA_EXHAUSTED");
        }
        if (response.status === 429) {
            throw new Error("RATE_LIMITED"); 
        }
        
        throw new Error(errMsg);
    }

    const data = await response.json();
    console.log("OpenRouter Response Full Data:", data); 

    const choice = data.choices?.[0];
    let resultText = "";

    // 1. Check for structured images array (common in some OpenRouter google integrations)
    if (choice?.message?.images?.length > 0) {
        const image = choice.message.images[0];
        // Check for nested image_url object
        if (image.image_url?.url) return image.image_url.url;
        // Check for direct url property
        if (image.url) return image.url;
    }

    // 2. Check for multimodal content array
    if (choice?.message?.content) {
        if (typeof choice.message.content === 'string') {
            resultText = choice.message.content;
        } else if (Array.isArray(choice.message.content)) {
            resultText = choice.message.content
                .map((part: any) => {
                        if (part.text) return part.text;
                        if (part.image_url?.url) return `![](${part.image_url.url})`;
                        return '';
                })
                .join('\n');
        }
    }

    if (!resultText) {
        // If usage indicates an image was generated but we can't find it, that's an error.
        if (data.usage?.completion_tokens > 0 || data.usage?.native_tokens_completion_images > 0) {
             console.error("OpenRouter Empty Content Response (but tokens used):", JSON.stringify(data, null, 2));
             throw new Error("The model generated an image but OpenRouter did not return the image data in the response text.");
        }
        throw new Error("OpenRouter returned no content.");
    }
    
    // 3. Markdown image match: ![alt](url)
    const markdownImageMatch = resultText.match(/!\[.*?\]\((.*?)\)/);
    if (markdownImageMatch && markdownImageMatch[1]) {
        return markdownImageMatch[1];
    }

    // 4. More permissive URL matching to catch signed URLs or URLs with params
    const urlMatch = resultText.match(/(https?:\/\/[^\s<>"')]+)/);
    if (urlMatch) {
            const url = urlMatch[0];
            const hasImageExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].some(ext => url.toLowerCase().includes(ext));
            const isStorageUrl = url.includes('storage.googleapis.com') || url.includes('amazonaws.com') || url.includes('usercontent') || url.includes('fal.media');
            
            if (hasImageExt || isStorageUrl || resultText.length < 500) {
                return url;
            }
    }
    
    // Fallback: If result is short and doesn't look like image data, throw
    if (resultText.length < 200 && !resultText.startsWith('data:')) {
            console.warn("OpenRouter Text Response (Not Image):", resultText);
            throw new Error("The OpenRouter model returned text instead of an image.");
    }
    
    return resultText;
}

/**
 * OpenRouter API Call wrapper with Key Rotation
 */
const callOpenRouter = async (
    prompt: string, 
    images: string[] = [] // Base64 data URLs
): Promise<string> => {
    if (!OPENROUTER_API_KEYS || OPENROUTER_API_KEYS.length === 0) {
        throw new Error("OpenRouter API Key is not configured.");
    }

    let lastError: any;

    // Loop through available keys
    for (let i = 0; i < OPENROUTER_API_KEYS.length; i++) {
        const currentKey = OPENROUTER_API_KEYS[i];
        
        try {
            if (i > 0) console.log(`Switching to OpenRouter Key #${i + 1}...`);
            return await executeOpenRouterRequest(currentKey, prompt, images);
        } catch (error: any) {
            lastError = error;
            const errMsg = error.message || error.toString();
            
            // Check if error is related to quota or limits
            const isQuotaError = errMsg.includes("QUOTA_EXHAUSTED") || 
                                 errMsg.includes("RATE_LIMITED") || 
                                 errMsg.toLowerCase().includes("credits") ||
                                 errMsg.includes("402") ||
                                 errMsg.includes("429");

            if (isQuotaError) {
                console.warn(`OpenRouter Key #${i + 1} exhausted or limited. Trying next key...`);
                // Continue to next iteration (next key)
                continue;
            } else {
                // If it's a different error (e.g. model refused, parsing error), throw immediately
                // don't waste other keys on a bad request.
                console.error(`OpenRouter Call Failed (Key #${i+1}):`, error);
                throw error;
            }
        }
    }

    // If we run out of keys
    console.error("All OpenRouter keys exhausted.");
    throw new Error("All OpenRouter API keys are exhausted. Please try again later or update keys.");
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
                        // For URLs (OpenRouter), fetch blob first
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


export const generateEditedImage = async (
    originalImage: string,
    userPrompt: string,
    maskImage: File,
    provider: ModelProvider = 'google'
): Promise<string> => {
    return timedApiCall('retouch', { prompt: userPrompt, provider }, async () => {
        
        if (provider === 'openrouter') {
             // For OpenRouter, we simulate masking by sending original + mask + instructions
             const maskDataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.readAsDataURL(maskImage);
             });
             
             const prompt = `Edit the first image based on the user request: "${userPrompt}". 
             Use the second image as a mask (white areas are editable, black areas must remain unchanged). 
             Return the final edited image. Please provide the response as a markdown image link.`;
             
             return await callOpenRouter(prompt, [originalImage, maskDataUrl]);
        }
        
        // Google Logic
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
    provider: ModelProvider = 'google'
): Promise<string> => {
    return timedApiCall('background', { prompt: alterationPrompt, provider }, async () => {

        if (provider === 'openrouter') {
            const prompt = `Remove the background of this image and replace it with: "${alterationPrompt}". 
            Keep the main subject exactly as is. Return the final image as a markdown image link.`;
            return await callOpenRouter(prompt, [originalImage]);
        }

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
    provider: ModelProvider = 'google'
): Promise<string> => {
    return timedApiCall('generateImage', { prompt, provider }, async () => {

        if (provider === 'openrouter') {
            const finalPrompt = `Generate a photorealistic image of: ${prompt}. Return the image as a markdown image link.`;
            return await callOpenRouter(finalPrompt, []);
        }

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
    provider: ModelProvider = 'google'
): Promise<string> => {
    return timedApiCall('generateLogo', { prompt: userPrompt, provider }, async () => {

        if (provider === 'openrouter') {
             const images = [];
             if (backgroundImageDataUrl) images.push(backgroundImageDataUrl);
             else if (existingLogoDataUrl) images.push(existingLogoDataUrl);
             
             let prompt = `Create a logo: "${userPrompt}". Return the image as a markdown image link.`;
             if (images.length > 0) prompt = `Using the provided image as context/background, create/modify a logo: "${userPrompt}". Return the final image as a markdown image link.`;
             
             return await callOpenRouter(prompt, images);
        }

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
    provider: ModelProvider = 'google'
): Promise<string> => {
    return timedApiCall('magicEdit', { prompt: userPrompt, provider }, async () => {

        if (provider === 'openrouter') {
            const prompt = `Edit this image: "${userPrompt}". Make it photorealistic. Return the final image as a markdown image link.`;
            return await callOpenRouter(prompt, [originalImage]);
        }

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
    provider: ModelProvider = 'google'
): Promise<string> => {
    return timedApiCall('composeImages', { prompt: userPrompt, provider }, async () => {

        if (provider === 'openrouter') {
            const prompt = `Compose these two images together based on this instruction: "${userPrompt}". Return the final composed image as a markdown image link.`;
            return await callOpenRouter(prompt, [originalImage, secondImage]);
        }

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
    provider: ModelProvider = 'google'
): Promise<string> => {
    return timedApiCall('enhancePrompt', { prompt: userPrompt, hasImage: !!image, provider }, async () => {
        // We use Google for prompt enhancement even if OpenRouter is selected for generation,
        // because prompt enhancement is a pure text task where Gemini 3 Pro excels.
        const ai = getAiClient();
        const parts: any[] = [{ text: userPrompt }];
        let systemInstruction = `You are a prompt engineering expert. Expand the user's brief idea into a detailed prompt for high-quality image generation. Respond ONLY with the enhanced prompt.`;

        if (image) {
            parts.unshift(dataUrlToPart(image));
            systemInstruction = `You are a prompt engineering expert. Analyze the provided image and the user's brief instruction. Expand it into a detailed prompt for high-quality image generation. Respond ONLY with the enhanced prompt.`;
        }
        
        // Upgrade to Gemini 3 Pro for prompt enhancement logic
        const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-3-pro-preview', 
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
