
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useState } from 'react';
import { SparkleIcon, CheckCircleIcon, ShieldExclamationIcon } from './icons';
import { verifyGeminiAccess } from '../services/geminiService';

const ModelSelector: React.FC = () => {
    const [status, setStatus] = useState<'checking' | 'verified' | 'denied'>('checking');

    useEffect(() => {
        let mounted = true;
        verifyGeminiAccess().then((isAllowed) => {
            if (mounted) setStatus(isAllowed ? 'verified' : 'denied');
        });
        return () => { mounted = false; };
    }, []);

    const getStatusContent = () => {
        switch (status) {
            case 'checking':
                return (
                    <div className="flex items-center gap-2 text-[var(--color-primary-300)] animate-pulse">
                        <SparkleIcon className="w-4 h-4" />
                        <span className="text-xs font-semibold">Connecting to Gemini 3 Pro...</span>
                    </div>
                );
            case 'verified':
                return (
                    <div className="flex items-center gap-2 text-green-400">
                        <CheckCircleIcon className="w-4 h-4" />
                        <span className="text-xs font-bold tracking-wide">Gemini 3 Pro Active</span>
                    </div>
                );
            case 'denied':
                return (
                    <div className="flex items-center gap-2 text-red-400" title="The API Key may not have access to this model">
                        <ShieldExclamationIcon className="w-4 h-4" />
                        <span className="text-xs font-bold">Access Denied (Check Key)</span>
                    </div>
                );
        }
    };

    return (
        <div className={`flex items-center justify-center gap-2 p-2 rounded-lg border w-full shadow-inner shadow-black/20 transition-colors duration-500 ${
            status === 'verified' ? 'bg-gradient-to-r from-gray-800 to-green-900/20 border-green-500/30' : 
            status === 'denied' ? 'bg-gradient-to-r from-gray-800 to-red-900/20 border-red-500/30' : 
            'bg-gray-800/80 border-gray-700/50'
        }`}>
            {getStatusContent()}
        </div>
    );
};

export default ModelSelector;
