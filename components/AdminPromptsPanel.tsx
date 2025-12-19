/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { CommandLineIcon, ChevronDownIcon } from './icons';

const initialPrompts: Record<string, { title: string; description: string; content: string }> = {
    retouch: {
        title: "Retouch (Masked Edit)",
        description: "Used for editing a user-defined masked area.",
        content: `As a world-leading expert in photorealistic digital manipulation, your task is to execute the following user request: "{userPrompt}". Apply this edit *exclusively* to the white areas of the provided mask. The black areas are to be considered immutable. Your final output must be an 8K, hyper-realistic photograph. The edit must be so seamless that it's impossible to tell it was manipulated. This requires perfect integration of lighting, shadows, color temperature, texture, grain, and depth of field from the source image. Pay extreme attention to edge blending to avoid any halos or artifacts. Do not alter the unmasked areas. Output only the final, edited image.`
    },
    magicEdit: {
        title: "Magic AI (Maskless Edit)",
        description: "Used for editing an image without a user-provided mask.",
        content: `You are an intelligent photo manipulation AI. First, analyze the image and the user's prompt to understand the subject and the desired change: "{userPrompt}". Then, execute this change with absolute photorealism. The modification must be perfectly integrated, matching the original photo's lighting, shadows, color, grain, and lens characteristics. The final result should be a stunning, high-resolution photograph that appears completely real and unedited. Output only the final photograph.`
    },
    composeImages: {
        title: "Magic AI (Image Composition)",
        description: "Used for blending two images together based on a prompt.",
        content: `As a master of photocomposition, your task is to execute the user's directive: "{userPrompt}". This requires extracting the subject from the second image and seamlessly integrating it into the primary image. To achieve a flawless, ultra-realistic result, you must perfectly match: perspective, scale, lighting direction, color temperature, depth of field, and film grain. Create realistic contact shadows where the new subject meets surfaces in the primary image. Perform subtle edge blending and color spill correction to make the composite undetectable. Only output the final, composed photograph.`
    },
    generateImage: {
        title: "Magic AI (Text to Image)",
        description: "Used for creating a new image from only a text prompt.",
        content: `Create an ultra-realistic, cinematic photograph of: {userPrompt}. The image should be captured on a professional DSLR with a 50mm f/1.8 lens. The lighting should be soft and dramatic, creating a moody atmosphere. The composition should be well-balanced, drawing the viewer's eye to the subject. Pay extreme attention to detail, with tack-sharp focus, intricate textures, and physically accurate materials. 8K UHD resolution. Award-winning photography.`
    },
    background: {
        title: "Background Change",
        description: "Used for replacing the background of an image.",
        content: `You are a high-end VFX compositor. Your task is to perfectly isolate the foreground subject and replace the background according to the user's request: "{userPrompt}". The new background must be hyper-realistic and optically correct, matching the original photo's lens perspective and depth of field. Critically, you must relight the foreground subject to match the new background's lighting environment, including key light, fill light, and ambient light. Create physically accurate contact shadows and ensure color spill from the new background is realistically cast onto the subject's edges. The edge masking must be flawless, especially with fine details like hair. The subject itself must not be altered. Output a single, seamless, high-resolution photograph.`
    },
    assistant: {
        title: "AI Assistant (System Instruction)",
        description: "The core personality and knowledge base for the chatbot.",
        content: `You are a friendly and helpful AI assistant for PixAI, a powerful AI photo editor. Your goal is to guide users on how to use the application's features. Do not answer questions that are not related to using this photo editor. Keep your answers concise and easy to understand.

Here's a summary of the application's features, organized by tabs:

- **Retouch Tab:** To edit a specific part of an image, the user must first select the 'brush' tool and paint over the area they want to change. This creates a mask. Then, they should type a description of the change they want into the text box (e.g., 'make the shirt red', 'add a hat') and click 'Generate'.

- **Magic AI Tab:** This is a powerful, mask-free editing tool.
  1. **If no image is loaded:** The user can type a description of anything they can imagine, and the AI will create a brand new image from scratch.
  2. **If an image is loaded:** The user can describe any change they want (e.g., 'make the sky a dramatic sunset', 'add a smiling dog on the grass'), and the AI will automatically understand and apply the edit to the correct part of the photo without needing a mask.

- **Background Tab:** The user has two options:
  1. **Remove Background:** Instantly make the background transparent.
  2. **Change Background:** Type a description of a new background (e.g., 'a busy city street at night', 'a magical forest') and click 'Change'.

- **Logo Maker Tab:** The user can type a description to create a brand new logo or to refine an existing one.

When a user asks how to do something, explain the steps clearly based on the information above. For example, if they ask "How do I add a hat?", you should tell them to go to the 'Retouch' tab, paint over the person's head with the brush, and then type 'a baseball cap' in the prompt box.`
    }
};

// In a real app, this would be an API call
const savePrompt = (promptKey: string, content: string): Promise<void> => {
    console.log(`Saving prompt "${promptKey}"...`);
    // Simulate network delay
    return new Promise(resolve => setTimeout(() => {
        console.log(`Prompt "${promptKey}" saved.`);
        resolve();
    }, 500));
};

const AdminPromptsPanel: React.FC = () => {
    const [prompts, setPrompts] = useState(initialPrompts);
    const [saveStatus, setSaveStatus] = useState<Record<string, 'saving' | 'saved' | null>>({});
    const [openPromptKey, setOpenPromptKey] = useState<string | null>(null);

    const handleContentChange = (key: string, value: string) => {
        // Fix: The original state update was incorrect. It did not preserve the existing
        // properties (`title`, `description`) of the prompt when the content changed.
        // This new implementation correctly spreads the existing prompt object before
        // overwriting the content, ensuring no data is lost.
        setPrompts(prev => {
            const currentPrompt = prev[key];
            if (!currentPrompt) return prev; // Should not happen, but safe guard
            return {
                ...prev,
                [key]: {
                    ...currentPrompt,
                    content: value,
                },
            };
        });
        if (saveStatus[key] === 'saved') {
            setSaveStatus(prev => ({ ...prev, [key]: null }));
        }
    };

    const handleSave = async (key: string) => {
        setSaveStatus(prev => ({ ...prev, [key]: 'saving' }));
        try {
            // Fix: Add a guard to ensure the prompt object exists before accessing its content property.
            // This prevents potential runtime errors.
            const promptToSave = prompts[key];
            if (promptToSave) {
                await savePrompt(key, promptToSave.content);
                setSaveStatus(prev => ({ ...prev, [key]: 'saved' }));
                setTimeout(() => {
                    setSaveStatus(prev => ({ ...prev, [key]: null }));
                }, 2000); // Hide "Saved!" after 2 seconds
            }
        } catch (error) {
            console.error("Failed to save prompt", error);
            setSaveStatus(prev => ({ ...prev, [key]: null }));
            // In a real app, show an error message
        }
    };
    
    const togglePrompt = (key: string) => {
        setOpenPromptKey(openPromptKey === key ? null : key);
    };

    return (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 h-full animate-fade-in flex flex-col">
            <div className="p-4 md:p-6 border-b border-gray-700">
                <h2 className="text-lg font-semibold text-gray-200">Prompt Management</h2>
                <p className="text-sm text-gray-400 mt-1">
                    View and edit the internal prompts used by the AI for different features. Changes are not saved in this demo.
                </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                {/* FIX: Changed to Object.keys to ensure correct type inference for the prompt object when iterating. */}
                {Object.keys(prompts).map((key) => {
                    const prompt = prompts[key as keyof typeof prompts];
                    return (
                        <div key={key} className="bg-gray-900/50 rounded-lg border border-gray-700/80 overflow-hidden">
                            <button 
                                onClick={() => togglePrompt(key)}
                                className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
                                aria-expanded={openPromptKey === key}
                            >
                                <div className="flex items-center gap-3">
                                    <CommandLineIcon className="w-5 h-5 text-[var(--color-primary-300)] flex-shrink-0" />
                                    <div>
                                        <h3 className="font-semibold text-white">{prompt.title}</h3>
                                        <p className="text-xs text-gray-400">{prompt.description}</p>
                                    </div>
                                </div>
                                <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${openPromptKey === key ? 'rotate-180' : ''}`} />
                            </button>
                            {openPromptKey === key && (
                                <div className="p-4 border-t border-gray-700/80 bg-black/20 animate-fade-in">
                                    <textarea
                                        value={prompt.content}
                                        onChange={e => handleContentChange(key, e.target.value)}
                                        className="w-full h-64 bg-gray-900 border border-gray-600 rounded-md p-3 text-sm font-mono text-gray-300 focus:ring-2 focus:ring-[var(--color-primary-500)] focus:outline-none transition"
                                        spellCheck="false"
                                    />
                                    <div className="mt-3 flex items-center justify-end">
                                        <button
                                            onClick={() => handleSave(key)}
                                            disabled={saveStatus[key] === 'saving'}
                                            className={`px-4 py-2 rounded-md text-sm font-semibold transition-all duration-200 w-24 text-center ${
                                                saveStatus[key] === 'saved'
                                                    ? 'bg-green-500 text-white'
                                                    : 'bg-[var(--color-primary-600)] hover:bg-[var(--color-primary-500)] text-white disabled:bg-[var(--color-primary-800)] disabled:cursor-wait'
                                            }`}
                                        >
                                            {saveStatus[key] === 'saving' ? '...' : saveStatus[key] === 'saved' ? 'Saved!' : 'Save'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default AdminPromptsPanel;