/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { useTranslations } from '../useTranslations';
import { SparkleIcon } from './icons';

interface BackgroundPanelProps {
  onApplyBackgroundChange: (prompt: string) => void;
  isLoading: boolean;
  currentImage: string | null;
  isEnhancing: boolean;
  onEnhance: (prompt: string, image?: string | null) => Promise<string>;
}

const BackgroundPanel: React.FC<BackgroundPanelProps> = ({ 
    onApplyBackgroundChange, 
    isLoading,
    currentImage,
    isEnhancing,
    onEnhance 
}) => {
  const { t } = useTranslations();
  const [customPrompt, setCustomPrompt] = useState('');

  const handleRemove = () => {
    onApplyBackgroundChange('Remove the background, making it transparent. The main subject should be perfectly isolated.');
  };

  const handleChange = () => {
    if (customPrompt.trim()) {
      onApplyBackgroundChange(`Change the background to: ${customPrompt}`);
    }
  };

  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-6 flex flex-col items-center gap-6 animate-fade-in backdrop-blur-sm">
      <h3 className="text-xl font-semibold text-center text-gray-200">{t('backgroundTools')}</h3>
      
      <div className="w-full flex flex-col md:flex-row items-center gap-4">
        <div className="w-full md:w-1/3 flex flex-col items-center text-center">
            <h4 className="text-lg font-medium text-gray-300">{t('oneClickRemove')}</h4>
            <p className="text-sm text-gray-400 mb-2">{t('oneClickRemoveDescription')}</p>
            <button
                onClick={handleRemove}
                disabled={isLoading || isEnhancing}
                className="w-full bg-gradient-to-br from-[var(--color-primary-700)] to-[var(--color-primary-600)] text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-[var(--shadow-primary-light)] hover:shadow-xl hover:shadow-[var(--shadow-primary)] hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-[var(--color-primary-800)] disabled:to-[var(--color-primary-700)] disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
            >
                {t('removeBackground')}
            </button>
        </div>

        <div className="w-full md:w-px h-px md:h-24 bg-gray-600"></div>

        <div className="w-full md:w-2/3 flex flex-col items-center text-center">
            <h4 className="text-lg font-medium text-gray-300">{t('changeWithAI')}</h4>
            <p className="text-sm text-gray-400 mb-2">{t('changeWithAIDescription')}</p>
            <form onSubmit={(e) => { e.preventDefault(); handleChange(); }} className="w-full flex items-center gap-2">
                <div className="relative flex-grow">
                    <input
                        type="text"
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder={t('placeholderBackground')}
                        className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-4 focus:ring-2 focus:ring-[var(--color-primary-500)] focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60 text-base"
                        disabled={isLoading || isEnhancing}
                    />
                     <button
                        type="button"
                        onClick={async () => {
                            const newPrompt = await onEnhance(customPrompt, currentImage);
                            setCustomPrompt(newPrompt);
                        }}
                        disabled={isLoading || isEnhancing || !customPrompt.trim()}
                        className="absolute top-1/2 -translate-y-1/2 right-3 p-2 rounded-full bg-[var(--color-primary-600)]/80 text-white hover:bg-[var(--color-primary-500)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--color-primary-800)]"
                        title={t('enhancePrompt')}
                    >
                        <SparkleIcon className="w-5 h-5" />
                    </button>
                </div>
                <button
                    type="submit"
                    className="bg-gradient-to-br from-[var(--color-primary-600)] to-[var(--color-primary-500)] text-white font-bold py-4 px-5 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-[var(--shadow-primary-light)] hover:shadow-xl hover:shadow-[var(--shadow-primary)] hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-[var(--color-primary-800)] disabled:to-[var(--color-primary-700)] disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                    disabled={isLoading || isEnhancing || !customPrompt.trim()}
                >
                    {t('change')}
                </button>
            </form>
        </div>
      </div>
    </div>
  );
};

export default React.memo(BackgroundPanel);