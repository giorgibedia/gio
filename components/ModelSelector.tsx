
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useState } from 'react';
import { SparkleIcon, CheckCircleIcon, ShieldExclamationIcon, WrenchScrewdriverIcon, XMarkIcon, ArrowRightOnRectangleIcon } from './icons';
import { verifyGeminiAccess, setDebugApiKey, getDebugApiKey, clearDebugApiKey } from '../services/geminiService';

const ModelSelector: React.FC = () => {
    const [status, setStatus] = useState<'checking' | 'verified' | 'denied'>('checking');
    const [isEditing, setIsEditing] = useState(false);
    const [inputKey, setInputKey] = useState('');
    const [hasCustomKey, setHasCustomKey] = useState(false);

    useEffect(() => {
        let mounted = true;
        // Check if we already have a custom key stored
        const currentKey = getDebugApiKey();
        if (currentKey) {
            setHasCustomKey(true);
            setInputKey(currentKey);
        }

        verifyGeminiAccess().then((isAllowed) => {
            if (mounted) setStatus(isAllowed ? 'verified' : 'denied');
        });
        return () => { mounted = false; };
    }, []);

    const handleSave = () => {
        if (inputKey.trim()) {
            setDebugApiKey(inputKey); // This function reloads the page
        }
    };

    const handleClear = () => {
        clearDebugApiKey(); // This function reloads the page
    };

    if (isEditing) {
        return (
            <div className="flex flex-col gap-2 p-3 rounded-lg border bg-gray-800 border-gray-600 shadow-lg animate-scale-in relative w-full">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-gray-300 flex items-center gap-1">
                        <WrenchScrewdriverIcon className="w-3 h-3" />
                        API Key Override
                    </span>
                    <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-white">
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>
                <input 
                    type="text" 
                    value={inputKey}
                    onChange={(e) => setInputKey(e.target.value)}
                    placeholder="AIzaSy..." 
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs text-white font-mono focus:border-[var(--color-primary-500)] focus:outline-none"
                />
                <div className="flex gap-2">
                    <button 
                        onClick={handleSave}
                        className="flex-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-1.5 rounded transition-colors"
                    >
                        Save & Reload
                    </button>
                    {hasCustomKey && (
                        <button 
                            onClick={handleClear}
                            className="bg-red-600 hover:bg-red-500 text-white p-1.5 rounded transition-colors"
                            title="Clear custom key"
                        >
                            <ArrowRightOnRectangleIcon className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        );
    }

    const getStatusContent = () => {
        switch (status) {
            case 'checking':
                return (
                    <div className="flex items-center gap-2 text-[var(--color-primary-300)] animate-pulse">
                        <SparkleIcon className="w-4 h-4" />
                        <span className="text-xs font-semibold">Connecting...</span>
                    </div>
                );
            case 'verified':
                return (
                    <div className="flex items-center gap-2 text-green-400">
                        <CheckCircleIcon className="w-4 h-4" />
                        <div className="flex flex-col leading-none">
                            <span className="text-xs font-bold tracking-wide">Gemini 2.5 Active</span>
                            {hasCustomKey && <span className="text-[10px] text-green-300/70 font-mono mt-0.5">Custom Key</span>}
                        </div>
                    </div>
                );
            case 'denied':
                return (
                    <div className="flex items-center gap-2 text-red-400">
                        <ShieldExclamationIcon className="w-4 h-4" />
                        <div className="flex flex-col leading-none">
                            <span className="text-xs font-bold">Access Denied</span>
                            <span className="text-[10px] underline mt-0.5">Click to fix Key</span>
                        </div>
                    </div>
                );
        }
    };

    return (
        <button 
            onClick={() => setIsEditing(true)}
            className={`flex items-center justify-center gap-2 p-2 rounded-lg border w-full shadow-inner shadow-black/20 transition-all duration-300 cursor-pointer hover:brightness-110 active:scale-95 ${
            status === 'verified' ? 'bg-gradient-to-r from-gray-800 to-green-900/20 border-green-500/30' : 
            status === 'denied' ? 'bg-gradient-to-r from-gray-800 to-red-900/20 border-red-500/30' : 
            'bg-gray-800/80 border-gray-700/50'
        }`}>
            {getStatusContent()}
        </button>
    );
};

export default ModelSelector;
