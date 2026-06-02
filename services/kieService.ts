/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './supabaseClient';
import { getUserId } from './analyticsService';

// Helper to convert a data URL string to a File object for saving.
const dataURLtoFile = async (dataUrl: string, filename: string): Promise<File> => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type });
};

/**
 * Ensures an image has a public URL accessible by external APIs.
 * If the image is a base64 Data URL, it uploads it to Supabase and returns the public URL.
 */
export const getPublicUrlForImage = async (dataUrl: string): Promise<string> => {
    if (!dataUrl) return '';
    if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) {
        return dataUrl;
    }
    
    try {
        const userId = getUserId() || 'anonymous';
        const filename = `temp-input-${Date.now()}-${Math.floor(Math.random() * 1000)}.png`;
        const filePath = `${userId}/${filename}`;
        
        const imageFile = await dataURLtoFile(dataUrl, filename);
        
        console.log(`Uploading input image to Supabase path: ${filePath}`);
        const { error: uploadError } = await supabase.storage
            .from('generated-images')
            .upload(filePath, imageFile, { 
                upsert: true 
            });
            
        if (uploadError) {
            console.error("Supabase temporary upload failed for generated-images. Trying gallery-images...", uploadError);
            const { error: fallbackError } = await supabase.storage
                .from('gallery-images')
                .upload(filePath, imageFile, { 
                    upsert: true 
                });
                
            if (fallbackError) {
                throw new Error(`Upload failed. generated-images error: ${uploadError.message}. gallery-images error: ${fallbackError.message}`);
            }
            
            const { data: { publicUrl } } = supabase.storage
                .from('gallery-images')
                .getPublicUrl(filePath);
            return publicUrl;
        }
        
        const { data: { publicUrl } } = supabase.storage
            .from('generated-images')
            .getPublicUrl(filePath);
            
        return publicUrl;
    } catch (e: any) {
        console.error("Error preparing image for API:", e);
        throw new Error(`Failed to upload input image to cloud for Nano Banana 2 API: ${e.message || e}`);
    }
};

/**
 * Uploads a raw File object directly to Supabase and returns the public URL.
 */
export const getPublicUrlForFile = async (file: File): Promise<string> => {
    if (!file) return '';
    try {
        const userId = getUserId() || 'anonymous';
        const filename = `temp-file-${Date.now()}-${Math.floor(Math.random() * 1000)}-${file.name}`;
        const filePath = `${userId}/${filename}`;
        
        console.log(`Uploading file to Supabase path: ${filePath}`);
        const { error: uploadError } = await supabase.storage
            .from('generated-images')
            .upload(filePath, file, { 
                upsert: true 
            });
            
        if (uploadError) {
            console.error("Supabase temporary file upload failed on generated-images. Trying gallery-images...", uploadError);
            const { error: fallbackError } = await supabase.storage
                .from('gallery-images')
                .upload(filePath, file, { 
                    upsert: true 
                });
                
            if (fallbackError) {
                throw new Error(`Upload failed. generated-images error: ${uploadError.message}. gallery-images error: ${fallbackError.message}`);
            }
            
            const { data: { publicUrl } } = supabase.storage
                .from('gallery-images')
                .getPublicUrl(filePath);
                
            return publicUrl;
        }
        
        const { data: { publicUrl } } = supabase.storage
            .from('generated-images')
            .getPublicUrl(filePath);
            
        return publicUrl;
    } catch (e: any) {
        console.error("Error preparing file for API:", e);
        throw new Error(`Failed to upload input file to cloud for Nano Banana 2 API: ${e.message || e}`);
    }
};

/**
 * Retrieves the Kie.ai API Key from localStorage or environment variables, defaulting to the requested production key.
 */
export const getKieApiKey = (): string => {
    try {
        const savedKey = localStorage.getItem('user_kie_api_key');
        if (savedKey && savedKey.trim() !== '') {
            return savedKey.trim();
        }
    } catch (err) {
        console.warn("Could not read user_kie_api_key from localStorage:", err);
    }
    
    return '8add62a9d9af781c21b45749e9cab3d0';
};

/**
 * Triggers Nano Banana 2 Image Generation on kie.ai and polls for results.
 */
export const generateWithNanoBanana2 = async (
    prompt: string,
    imageUrls: string[],
    aspectRatio: string = "auto",
    resolution: string = "1K",
    outputFormat: string = "jpg"
): Promise<string> => {
    const apiKey = getKieApiKey();
    if (!apiKey) {
        throw new Error("Kie.ai API Key is missing. Please visit Profile Settings to configure your Kie.ai API Key.");
    }

    console.log("Submitting Nano Banana 2 generation task to Kie.ai...");
    
    const response = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: "nano-banana-2",
            input: {
                prompt: prompt,
                image_input: imageUrls,
                aspect_ratio: aspectRatio,
                resolution: resolution,
                output_format: outputFormat
            }
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        let errMsg = `Kie.ai Request failed with status ${response.status}`;
        try {
            const parsed = JSON.parse(errText);
            if (parsed.msg) errMsg = parsed.msg;
        } catch (_) {}
        throw new Error(errMsg);
    }

    const resultData = await response.json();
    if (resultData.code !== 200 || !resultData.data?.taskId) {
        throw new Error(resultData.msg || "Failed to create Kie.ai generation task.");
    }

    const taskId = resultData.data.taskId;
    console.log(`Kie.ai task ${taskId} created. Polling for completion...`);

    const maxPollAttempts = 45; // 45 * 2s = 90s max wait
    const pollIntervalMs = 2000;

    for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

        const getUrl = `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`;
        const pollResponse = await fetch(getUrl, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${apiKey}`
            }
        });

        if (!pollResponse.ok) {
            console.warn(`Polling attempt ${attempt}/${maxPollAttempts} failing with status ${pollResponse.status}`);
            continue;
        }

        const pollResult = await pollResponse.json();
        if (pollResult.code !== 200) {
            throw new Error(pollResult.msg || "Error querying Kie.ai task details.");
        }

        const data = pollResult.data;
        const state = data?.state;

        if (state === "success") {
            if (!data.resultJson) {
                throw new Error("Task succeeded but no result links exist.");
            }
            try {
                const parsedResult = JSON.parse(data.resultJson);
                const generatedUrls = parsedResult.resultUrls || [];
                if (generatedUrls.length === 0) {
                    throw new Error("No output URLs generated in final payload.");
                }
                return generatedUrls[0];
            } catch (e: any) {
                throw new Error(`Failed to parse result payload: ${e.message}`);
            }
        } else if (state === "fail") {
            throw new Error(data.failMsg || `Kie.ai generation failed (Code: ${data.failCode || 'Unknown'}).`);
        }

        console.log(`Attempt ${attempt}/${maxPollAttempts}: Status is still "${state}"`);
    }

    throw new Error("Kie.ai task timed out. The server took too long to generate your image.");
};
