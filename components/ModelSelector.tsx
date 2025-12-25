
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useState } from 'react';
import { SparkleIcon, CheckCircleIcon, ShieldExclamationIcon, WrenchScrewdriverIcon, XMarkIcon, ArrowRightOnRectangleIcon, GlobeAltIcon } from './icons';
import { verifyGeminiAccess, setDebugApiKey, getDebugApiKey, clearDebugApiKey, setApiProvider, getApiProvider, ApiProvider } from '../services/geminiService';

const ModelSelector: React.FC = () => {
    const [status, setStatus] = useState<'checking' | 'verified' | 'denied'>('checking');
    const [isEditing, setIsEditing] = useState(false);
    const [inputKey, setInputKey] = useState('');
    const [hasCustomKey, setHasCustomKey] = useState(false);
    const [provider, setProvider] = useState<ApiProvider>('google');

    useEffect(() => {
        let mounted = true;
        
        // Initialize state from storage
        const currentProvider = getApiProvider();
        setProvider(currentProvider);
        
        // Load the key SPECIFIC to this provider
        const currentKey = getDebugApiKey(currentProvider);
        if (currentKey) {
            setHasCustomKey(true);
            setInputKey(currentKey);
        } else {
            setHasCustomKey(false);
            setInputKey('');
        }

        verifyGeminiAccess().then((isAllowed) => {
            if (mounted) setStatus(isAllowed ? 'verified' : 'denied');
        });
        return () => { mounted = false; };
    }, []);

    const handleSave = () => {
        if (inputKey.trim()) {
            setApiProvider(provider);
            setDebugApiKey(inputKey, provider); // This reloads the page
        }
    };

    const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newProvider = e.target.value as ApiProvider;
        setProvider(newProvider);
        setApiProvider(newProvider); // Save preference immediately
        
        // Load the key stored for this new provider
        const storedKey = getDebugApiKey(newProvider);
        setInputKey(storedKey || '');
        setHasCustomKey(!!storedKey);
    };

    const handleClear = () => {
        clearDebugApiKey(provider);
    };

    if (isEditing) {
        return (
            <div className="flex flex-col gap-2 p-3 rounded-lg border bg-gray-800 border-gray-600 shadow-lg animate-scale-in relative w-full">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-gray-300 flex items-center gap-1">
                        <WrenchScrewdriverIcon className="w-3 h-3" />
                        API Configuration
                    </span>
                    <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-white">
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>
                
                <div className="flex flex-col gap-2 mb-1">
                    <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Provider</label>
                    <select 
                        value={provider} 
                        onChange={handleProviderChange}
                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs text-white focus:border-[var(--color-primary-500)] focus:outline-none"
                    >
                        <option value="google">Google Gemini</option>
                        <option value="together">Together AI</option>
                    </select>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">API Key</label>
                    <input 
                        type="text" 
                        value={inputKey}
                        onChange={(e) => setInputKey(e.target.value)}
                        placeholder={provider === 'google' ? "AIzaSy..." : "tg_..."} 
                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs text-white font-mono focus:border-[var(--color-primary-500)] focus:outline-none"
                    />
                </div>

                <div className="flex gap-2 mt-1">
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
                <p className="text-[10px] text-gray-500 mt-1 text-center">
                    {provider === 'together' ? "Uses FLUX.1 & Llama 3" : "Uses Gemini 2.5 Flash"}
                </p>
            </div>
        );
    }

    const getStatusContent = () => {
        const displayProvider = provider === 'google' ? 'Gemini 2.5' : 'Together AI';
        
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
                            <span className="text-xs font-bold tracking-wide">{displayProvider} Active</span>
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
                            <span className="text-[10px] underline mt-0.5">Check Key</span>
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
