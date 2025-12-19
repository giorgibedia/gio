/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { useTranslations } from '../useTranslations';
import { SparkleIcon, PhotoIcon, SwatchIcon, ArrowsPointingOutIcon, ViewfinderCircleIcon, SunIcon, ChevronDownIcon, ShieldCheckIcon, FaceSmileIcon } from './icons';

interface AdjustmentPanelProps {
  onApplyAutoEnhance: () => void;
  onApplyRestore: () => void;
  onApplyColorize: () => void;
  onApplyUpscale: () => void;
  onApplyDeblur: () => void;
  onApplyLightingCorrection: () => void;
  onApplyWatermarkRemoval: () => void;
  onApplyBeautify: (prompt: string) => void;
  isLoading: boolean;
}

const AdjustmentPanel: React.FC<AdjustmentPanelProps> = ({ 
    onApplyAutoEnhance, 
    onApplyRestore, 
    onApplyColorize,
    onApplyUpscale,
    onApplyDeblur,
    onApplyLightingCorrection,
    onApplyWatermarkRemoval,
    onApplyBeautify,
    isLoading 
}) => {
  const { t } = useTranslations();
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [beautifyPrompt, setBeautifyPrompt] = useState('');

  const handleBeautifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (beautifyPrompt.trim()) {
        onApplyBeautify(beautifyPrompt);
    }
  };

  // FIX: Stored translation keys in the array instead of translated strings
  // to prevent double-translation issues. The `t()` function is now only called
  // in the render method, ensuring the correct language is always displayed.
  const adjustmentTools = [
    { 
        key: 'enhance', 
        icon: <SparkleIcon className="w-6 h-6 text-cyan-300" />, 
        title: 'autoEnhance', 
        description: 'autoEnhanceDescription', 
        onApply: onApplyAutoEnhance, 
        buttonText: 'autoEnhance',
        gradient: 'bg-gradient-to-br from-blue-500 to-cyan-400',
        shadow: 'shadow-cyan-500/30',
        disabledGradient: 'disabled:from-blue-800 disabled:to-cyan-700',
    },
    { 
        key: 'beautify', 
        icon: <FaceSmileIcon className="w-6 h-6 text-pink-300" />, 
        title: 'beautify', 
        description: 'beautifyDescription', 
        onApply: () => onApplyBeautify(beautifyPrompt), // This will be handled by the custom form
        buttonText: 'generate', // For the custom form button
        gradient: 'bg-gradient-to-br from-pink-600 to-rose-500',
        shadow: 'shadow-rose-500/20',
        disabledGradient: 'disabled:from-pink-800 disabled:to-rose-700',
    },
    { 
        key: 'restore', 
        icon: <PhotoIcon className="w-6 h-6 text-emerald-300" />, 
        title: 'aiRestore', 
        description: 'aiRestoreDescription', 
        onApply: onApplyRestore,
        buttonText: 'aiRestore',
        gradient: 'bg-gradient-to-br from-green-500 to-emerald-400',
        shadow: 'shadow-emerald-500/30',
        disabledGradient: 'disabled:from-green-800 disabled:to-emerald-700',
    },
    { 
        key: 'colorize', 
        icon: <SwatchIcon className="w-6 h-6 text-indigo-300" />, 
        title: 'colorize', 
        description: 'colorizeDescription', 
        onApply: onApplyColorize,
        buttonText: 'colorize',
        gradient: 'bg-gradient-to-br from-purple-500 to-indigo-400',
        shadow: 'shadow-indigo-500/30',
        disabledGradient: 'disabled:from-purple-800 disabled:to-indigo-700',
    },
    { 
        key: 'upscale', 
        icon: <ArrowsPointingOutIcon className="w-6 h-6 text-amber-300" />, 
        title: 'upscale', 
        description: 'upscaleDescription', 
        onApply: onApplyUpscale,
        buttonText: 'upscale',
        gradient: 'bg-gradient-to-br from-orange-500 to-amber-400',
        shadow: 'shadow-amber-500/30',
        disabledGradient: 'disabled:from-orange-800 disabled:to-amber-700',
    },
    { 
        key: 'deblur', 
        icon: <ViewfinderCircleIcon className="w-6 h-6 text-rose-300" />, 
        title: 'deblur', 
        description: 'deblurDescription', 
        onApply: onApplyDeblur,
        buttonText: 'deblur',
        gradient: 'bg-gradient-to-br from-pink-500 to-rose-400',
        shadow: 'shadow-rose-500/30',
        disabledGradient: 'disabled:from-pink-800 disabled:to-rose-700',
    },
    { 
        key: 'lighting', 
        icon: <SunIcon className="w-6 h-6 text-yellow-300" />, 
        title: 'lighting', 
        description: 'lightingDescription', 
        onApply: onApplyLightingCorrection,
        buttonText: 'lighting',
        gradient: 'bg-gradient-to-br from-yellow-500 to-lime-400',
        shadow: 'shadow-lime-500/30',
        disabledGradient: 'disabled:from-yellow-800 disabled:to-lime-700',
    },
    { 
        key: 'watermark', 
        icon: <ShieldCheckIcon className="w-6 h-6 text-teal-300" />, 
        title: 'removeWatermark', 
        description: 'removeWatermarkDescription', 
        onApply: onApplyWatermarkRemoval,
        buttonText: 'removeWatermark',
        gradient: 'bg-gradient-to-br from-teal-500 to-cyan-400',
        shadow: 'shadow-cyan-500/30',
        disabledGradient: 'disabled:from-teal-800 disabled:to-cyan-700',
    },
  ];

  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 animate-fade-in backdrop-blur-sm">
        <div className="flex flex-col gap-3">
            {adjustmentTools.map(tool => (
                <div key={tool.key} className="bg-white/5 rounded-lg border border-white/10 overflow-hidden transition-all duration-300">
                    <button 
                        onClick={() => setOpenItem(openItem === tool.key ? null : tool.key)}
                        className="w-full flex items-center justify-between p-4 text-left transition-colors hover:bg-white/5"
                        aria-expanded={openItem === tool.key}
                    >
                        <div className="flex items-center gap-4">
                            {tool.icon}
                            <h3 className="text-lg font-semibold text-gray-100">{t(tool.title as any)}</h3>
                        </div>
                        <ChevronDownIcon className={`w-6 h-6 text-gray-400 transition-transform duration-300 ${openItem === tool.key ? 'rotate-180' : ''}`} />
                    </button>
                    {openItem === tool.key && (
                        <div className="p-4 pt-0 animate-fade-in">
                            <p className="text-sm text-gray-400 mb-4">{t(tool.description as any)}</p>
                            {tool.key === 'beautify' ? (
                                <form onSubmit={handleBeautifySubmit} className="w-full flex flex-col items-center gap-2">
                                    <input
                                        type="text"
                                        value={beautifyPrompt}
                                        onChange={(e) => setBeautifyPrompt(e.target.value)}
                                        placeholder={t('placeholderBeautify')}
                                        className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-pink-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60 text-base"
                                        disabled={isLoading}
                                    />
                                    <button
                                        type="submit"
                                        disabled={isLoading || !beautifyPrompt.trim()}
                                        className={`w-full max-w-xs mt-2 ${tool.gradient} text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg ${tool.shadow} hover:shadow-xl hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:transform-none disabled:shadow-none ${tool.disabledGradient} disabled:cursor-not-allowed`}
                                    >
                                        {t(tool.buttonText as any)}
                                    </button>
                                </form>
                            ) : (
                                <button
                                    onClick={tool.onApply}
                                    disabled={isLoading}
                                    className={`w-full max-w-xs mx-auto ${tool.gradient} text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg ${tool.shadow} hover:shadow-xl hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:transform-none disabled:shadow-none ${tool.disabledGradient} disabled:cursor-not-allowed`}
                                >
                                    {t(tool.buttonText as any)}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    </div>
  );
};

export default React.memo(AdjustmentPanel);