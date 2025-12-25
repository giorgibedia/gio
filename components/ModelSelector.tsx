
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { useTranslations } from '../useTranslations';
import { SparkleIcon, GlobeAltIcon } from './icons';

export type ModelProvider = 'google' | 'openrouter';

interface ModelSelectorProps {
    currentProvider: ModelProvider;
    onProviderChange: (provider: ModelProvider) => void;
    disabled?: boolean;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ currentProvider, onProviderChange, disabled }) => {
    const { t } = useTranslations();

    return (
        <div className="flex items-center gap-2 bg-gray-800/50 p-1 rounded-lg border border-gray-700/50">
            <button
                onClick={() => onProviderChange('google')}
                disabled={disabled}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    currentProvider === 'google'
                        ? 'bg-[var(--color-primary-500)] text-white shadow-md'
                        : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`}
                title="Google Gemini 3 Pro (Native)"
            >
                <SparkleIcon className="w-3.5 h-3.5" />
                <span>Gemini 3 Pro</span>
            </button>
            <button
                onClick={() => onProviderChange('openrouter')}
                disabled={disabled}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    currentProvider === 'openrouter'
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`}
                title="OpenRouter Gemini 2.5 Flash (Nano Banana)"
            >
                <GlobeAltIcon className="w-3.5 h-3.5" />
                <span>Gemini 2.5 Flash NB</span>
            </button>
        </div>
    );
};

export default ModelSelector;
