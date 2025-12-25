
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";
import { logAction, logError, getUserId } from './analyticsService';
import { supabase } from './supabaseClient';
import { auth, database } from './firebase';
import { ref, remove } from 'firebase/database';

// Types
export type ApiProvider = 'google' | 'together';

// Configuration
const PRIMARY_IMAGE_MODEL = 'gemini-2.5-flash-image'; 
const TEXT_MODEL = 'gemini-3-flash-preview';

// TogetherAI Models
const TOGETHER_TEXT_MODEL = "meta-llama/Llama-3.3-70B-Instruct-Turbo";
const TOGETHER_IMAGE_MODEL = "black-forest-labs/FLUX.1-schnell"; 
const TOGETHER_INPAINT_MODEL = "black-forest-labs/FLUX.1-Fill-dev"; 

// --- HARDCODED API KEY (Default Fallback for Google) ---
const DIRECT_API_KEY = "AIzaSyC6KcojG7D2Uq_lHryo9c3v6wmuDtT9Rm0"; 

// Local Storage Keys
const API_PROVIDER_STORAGE = 'pixai_api_provider';

// --- API Management ---

export const setApiProvider = (provider: ApiProvider) => {
    localStorage.setItem(API_PROVIDER_STORAGE, provider);
};

export const getApiProvider = (): ApiProvider => {
    return (localStorage.getItem(API_PROVIDER_STORAGE) as ApiProvider) || 'google';
};

// Store keys separately based on provider
export const setDebugApiKey = (key: string, provider: ApiProvider) => {
    if (!key.trim()) return;
    localStorage.setItem(`pixai_key_${provider}`, key.trim());
    window.location.reload(); 
};

export const clearDebugApiKey = (provider: ApiProvider) => {
    localStorage.removeItem(`pixai_key_${provider}`);
    window.location.reload();
};

export const getDebugApiKey = (provider: ApiProvider) => {
    return localStorage.getItem(`pixai_key_${provider}`) || '';
};

// --- Helpers ---

export const dataURLtoFile = async (dataUrl: string, filename:string): Promise<File> => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type });
};

export const isMobileApp = (): boolean => {
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  const isAndroidWebView = /android/i.test(userAgent) && /wv/i.test(userAgent);
  const isLocalFile = window.location.protocol === 'file:';
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
  return isAndroidWebView || isLocalFile || isIOS;
};

// --- Client Initialization ---

const getApiKey = (): string => {
    const provider = getApiProvider();
    
    // 1. Check for specific provider stored key
    const storedKey = getDebugApiKey(provider);
    if (storedKey && storedKey.length > 5) return storedKey;

    // 2. Fallbacks (Only for Google)
    if (provider === 'google') {
        const envKey = process.env.API_KEY;
        if (envKey && envKey.length > 10) return envKey;
        if (DIRECT_API_KEY && DIRECT_API_KEY.length > 10) return DIRECT_API_KEY;
    }

    throw new Error(`API Key Missing for ${provider}. Please configure it in settings.`);
};

const getAiClient = (): GoogleGenAI => {
    return new GoogleGenAI({ apiKey: getApiKey() });
};

// --- TOGETHER AI IMPLEMENTATION ---

const callTogetherAI = async (endpoint: string, body: any) => {
    const apiKey = getApiKey();
    const response = await fetch(`https://api.together.xyz/v1/${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || `TogetherAI Error: ${response.statusText}`);
    }
    return await response.json();
};

const cleanBase64 = (dataUrl: string) => dataUrl.split(',')[1];

// --- Unified Verification ---

export const verifyGeminiAccess = async (): Promise<boolean> => {
    const provider = getApiProvider();
    try {
        if (provider === 'google') {
            const ai = getAiClient();
            await ai.models.generateContent({
                model: TEXT_MODEL,
                contents: { parts: [{ text: 'ping' }] },
            });
        } else if (provider === 'together') {
            // Check if we actually have a key before trying to call
            const key = getDebugApiKey('together');
            if (!key) throw new Error("No TogetherAI key saved");

            await callTogetherAI('chat/completions', {
                model: TOGETHER_TEXT_MODEL,
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 5
            });
        }
        return true;
    } catch (error: any) {
        console.error(`${provider} Access Verification Failed:`, error);
        return false;
    }
};

// --- Wrapper for Timing & Logging ---

const timedApiCall = async <T>(
    featureName: string,
    details: Record<string, any> | null,
    apiCall: () => Promise<T>
): Promise<T> => {
    const startTime = Date.now();
    const provider = getApiProvider();
    try {
        const result = await apiCall();
        const duration = (Date.now() - startTime) / 1000;
        
        const augmentedDetails = { ...details, duration, model: provider === 'google' ? PRIMARY_IMAGE_MODEL : 'together-ai', provider };
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
                    const { error: uploadError } = await supabase.storage.from('generated-images').upload(filePath, imageFile, { upsert: true });
                    if (uploadError) return;

                    const { data: { publicUrl } } = supabase.storage.from('generated-images').getPublicUrl(filePath);
                    logAction('generation', {
                        imageUrl: publicUrl,
                        prompt: details?.prompt,
                        originalFeature: featureName,
                        model: provider === 'google' ? PRIMARY_IMAGE_MODEL : 'together-ai'
                    });
                } catch (e) { console.error("Admin upload failed:", e); }
            })();
        }
        return result;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        logError(featureName, errorMessage);
        throw error;
    }
};

// --- Core Generation Functions ---

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

const fileToPart = async (file: File) => {
    const mimeType = file.type;
    const data = await blobToBase64(file);
    return { inlineData: { mimeType, data } };
};
const dataUrlToPart = (dataUrl: string) => {
    const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match) throw new Error('Invalid data URL format');
    return { inlineData: { mimeType: match[1], data: match[2] } };
};
const handleSingleApiResponse = (response: GenerateContentResponse): string => {
    if (response.promptFeedback?.blockReason) throw new Error(`Blocked: ${response.promptFeedback.blockReason}`);
    const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
    if (imagePart?.inlineData) return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
    throw new Error(`No image returned. AI said: "${response.text?.trim() || 'Unknown error'}"`);
};

// --- FEATURE IMPLEMENTATIONS ---

export const generateEditedImage = async (
    originalImage: string,
    userPrompt: string,
    maskImage: File
): Promise<string> => {
    return timedApiCall('retouch', { prompt: userPrompt }, async () => {
        if (getApiProvider() === 'together') {
            throw new Error("TogetherAI Inpainting (Masking) is not fully supported yet. Please use Google provider.");
        }

        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model: PRIMARY_IMAGE_MODEL,
            contents: { parts: [dataUrlToPart(originalImage), await fileToPart(maskImage), { text: userPrompt }] },
            config: { responseModalities: [Modality.IMAGE] },
        });
        return handleSingleApiResponse(response);
    });
};

export const generateBackgroundAlteredImage = async (
    originalImage: string,
    alterationPrompt: string
): Promise<string> => {
    return timedApiCall('background', { prompt: alterationPrompt }, async () => {
        if (getApiProvider() === 'together') {
             throw new Error("Background removal/replacement requires Google provider.");
        }

        const ai = getAiClient();
        const systemPrompt = `Isolate the main subject and replace the background. Subject must be preserved perfectly. The new background should realistically match the subject's lighting and perspective.`;
        const response = await ai.models.generateContent({
            model: PRIMARY_IMAGE_MODEL,
            contents: { parts: [dataUrlToPart(originalImage), { text: `${systemPrompt}\n\nUser's request: "${alterationPrompt}"` }] },
            config: { responseModalities: [Modality.IMAGE] },
        });
        return handleSingleApiResponse(response);
    });
};

export const getAssistantResponse = async (
    history: any[],
    newMessage: string
): Promise<string> => {
    try {
        if (getApiProvider() === 'together') {
            const messages = history.map(h => ({
                role: h.role,
                content: h.parts[0].text
            }));
            messages.push({ role: 'user', content: newMessage });

            const data = await callTogetherAI('chat/completions', {
                model: TOGETHER_TEXT_MODEL,
                messages: messages,
                max_tokens: 512,
                temperature: 0.7
            });
            return data.choices[0].message.content || "No response";
        }

        const ai = getAiClient();
        const chat = ai.chats.create({
            model: TEXT_MODEL,
            history: history,
        });
        const result = await chat.sendMessage({ message: newMessage });
        return result.text || "I'm not sure how to respond to that.";
    } catch (e) {
        console.error("Assistant error", e);
        return "Sorry, I'm having trouble connecting right now.";
    }
};

export const generateImageFromText = async (
    prompt: string
): Promise<string> => {
    return timedApiCall('generateImage', { prompt }, async () => {
        if (getApiProvider() === 'together') {
            const data = await callTogetherAI('images/generations', {
                model: TOGETHER_IMAGE_MODEL,
                prompt: prompt,
                width: 1024,
                height: 1024,
                steps: 4, 
                n: 1,
                response_format: 'b64_json'
            });
            const b64 = data.data[0].b64_json;
            return `data:image/jpeg;base64,${b64}`;
        }

        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model: PRIMARY_IMAGE_MODEL,
            contents: { parts: [{ text: prompt }] },
            config: { responseModalities: [Modality.IMAGE] },
        });
        return handleSingleApiResponse(response);
    });
};

export const generateLogo = async (
    userPrompt: string,
    existingLogoDataUrl?: string | null,
    backgroundImageDataUrl?: string | null
): Promise<string> => {
    return timedApiCall('generateLogo', { prompt: userPrompt }, async () => {
        if (getApiProvider() === 'together') {
             // For simplicity, using Flux Text-to-Image for logos too
             return generateImageFromText(`Professional logo design, vector style, minimalistic, ${userPrompt}`);
        }

        const ai = getAiClient();
        let systemPrompt = !existingLogoDataUrl && !backgroundImageDataUrl 
            ? `You are a professional logo designer AI. Create a unique, high-quality logo based on the user's description. Focus on symbolic iconography.`
            : `You are a professional logo designer AI. Modify the existing logo or place a new logo on the provided background based on the user's description.`;
        
        let parts: any[] = [{ text: `${systemPrompt}\n\nUser's request: "${userPrompt}"` }];
        if (backgroundImageDataUrl) parts.unshift(dataUrlToPart(backgroundImageDataUrl));
        else if (existingLogoDataUrl) parts.unshift(dataUrlToPart(existingLogoDataUrl));

        const response = await ai.models.generateContent({
            model: PRIMARY_IMAGE_MODEL,
            contents: { parts: parts },
            config: { responseModalities: [Modality.IMAGE] },
        });
        return handleSingleApiResponse(response);
    });
};

export const generateMagicEdit = async (
    originalImage: string,
    userPrompt: string
): Promise<string> => {
    return timedApiCall('magicEdit', { prompt: userPrompt }, async () => {
        if (getApiProvider() === 'together') {
             throw new Error("For magic editing, please switch to Google provider in settings.");
        }

        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model: PRIMARY_IMAGE_MODEL,
            contents: { parts: [dataUrlToPart(originalImage), { text: userPrompt }] },
            config: { responseModalities: [Modality.IMAGE] },
        });
        return handleSingleApiResponse(response);
    });
};

export const composeImages = async (
    originalImage: string,
    secondImage: string,
    userPrompt: string
): Promise<string> => {
    return timedApiCall('composeImages', { prompt: userPrompt }, async () => {
        if (getApiProvider() === 'together') throw new Error("Image composition requires Google provider.");

        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model: PRIMARY_IMAGE_MODEL,
            contents: { parts: [dataUrlToPart(originalImage), dataUrlToPart(secondImage), { text: userPrompt }] },
            config: { responseModalities: [Modality.IMAGE] },
        });
        return handleSingleApiResponse(response);
    });
};

export const enhancePrompt = async (
    userPrompt: string,
    image?: string | null
): Promise<string> => {
    return timedApiCall('enhancePrompt', { prompt: userPrompt, hasImage: !!image }, async () => {
        
        if (getApiProvider() === 'together') {
             const data = await callTogetherAI('chat/completions', {
                model: TOGETHER_TEXT_MODEL,
                messages: [{ 
                    role: 'system', 
                    content: 'You are a prompt engineering expert. Expand the user\'s brief idea into a detailed prompt for high-quality image generation (FLUX). Respond ONLY with the enhanced prompt.' 
                }, {
                    role: 'user',
                    content: userPrompt
                }],
                max_tokens: 200
            });
            return data.choices[0].message.content || userPrompt;
        }

        const ai = getAiClient(); 
        const parts: any[] = [{ text: userPrompt }];
        let systemInstruction = `You are a prompt engineering expert. Expand the user's brief idea into a detailed prompt for high-quality image generation. Respond ONLY with the enhanced prompt.`;

        if (image) {
            parts.unshift(dataUrlToPart(image));
            systemInstruction = `You are a prompt engineering expert. Analyze the provided image and the user's brief instruction. Expand it into a detailed prompt for high-quality image generation. Respond ONLY with the enhanced prompt.`;
        }
        
        const response = await ai.models.generateContent({
            model: TEXT_MODEL,
            contents: { parts: parts },
            config: { systemInstruction: systemInstruction },
        });

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
        const db = database;
        if (!db) throw new Error("Firebase is not configured.");
        await remove(ref(db, `actions/${actionId}`));
    } catch(e) {
        console.error("Log removal error:", e);
        throw new Error(`Image deleted, but failed to remove log.`);
    }
};
