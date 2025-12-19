/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { useTranslations } from '../useTranslations';
import { SparkleIcon, UploadIcon, XMarkIcon } from './icons';

interface LogoMakerPanelProps {
  onGenerate: (prompt: string) => void;
  onReset: () => void;
  isLoading: boolean;
  backgroundImage: string | null;
  onBackgroundImageChange: (image: string | null) => void;
  contextImage: string | null;
  isEnhancing: boolean;
  onEnhance: (prompt: string, image?: string | null) => Promise<string>;
}

const LogoMakerPanel: React.FC<LogoMakerPanelProps> = ({ 
    onGenerate, 
    onReset, 
    isLoading, 
    backgroundImage, 
    onBackgroundImageChange,
    contextImage,
    isEnhancing,
    onEnhance
}) => {
  const { t } = useTranslations();
  const [prompt, setPrompt] = useState('');

  const handleGenerateClick = () => {
    if (prompt.trim()) {
        onGenerate(prompt);
    }
  };
  
  const handleResetClick = () => {
    setPrompt('');
    onReset();
  };

  const handleBackgroundImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        onBackgroundImageChange(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };


  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-6 flex flex-col items-center gap-4 animate-fade-in backdrop-blur-sm">
        <div className="flex flex-col items-center text-center">
            <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[var(--color-primary-600)] to-[var(--color-primary-500)] rounded-full mb-4 shadow-lg shadow-[var(--shadow-primary-light)]">
                <SparkleIcon className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-gray-200">{t('logoMakerTitle')}</h3>
            <p className="text-sm text-gray-400 mt-2">{t('logoMakerSubtitle')}</p>
        </div>

        <div className="w-full flex flex-col gap-4">
            {backgroundImage ? (
                <div className="relative group animate-fade-in">
                    <img src={backgroundImage} alt="Background for logo" className="w-full rounded-lg object-contain max-h-32 border border-gray-600" />
                    <button
                        onClick={() => onBackgroundImageChange(null)}
                        disabled={isLoading || isEnhancing}
                        className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80 transition-colors"
                        aria-label="Remove background image"
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>
            ) : (
                <label htmlFor="logo-bg-upload" className="relative flex items-center justify-center w-full py-3 text-sm font-semibold text-gray-300 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors border border-dashed border-gray-500 hover:border-gray-400">
                    <UploadIcon className="w-5 h-5 mr-2 text-gray-400" />
                    {t('uploadLogoBackground' as any)}
                </label>
            )}
            <input id="logo-bg-upload" type="file" className="hidden" accept="image/*" onChange={handleBackgroundImageUpload} disabled={isLoading || isEnhancing} />
            <div className="relative w-full">
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={t('placeholderLogo')}
                    className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-4 focus:ring-2 focus:ring-[var(--color-primary-500)] focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60 text-base min-h-[120px]"
                    disabled={isLoading || isEnhancing}
                    rows={4}
                />
                <button
                    type="button"
                    onClick={async () => {
                        const newPrompt = await onEnhance(prompt, contextImage);
                        setPrompt(newPrompt);
                    }}
                    disabled={isLoading || isEnhancing || !prompt.trim()}
                    className="absolute bottom-3 right-3 p-2 rounded-full bg-[var(--color-primary-600)]/80 text-white hover:bg-[var(--color-primary-500)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--color-primary-800)]"
                    title={t('enhancePrompt')}
                >
                    <SparkleIcon className="w-5 h-5" />
                </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <button
                    onClick={handleResetClick}
                    className="w-full bg-white/10 border border-white/20 text-gray-200 font-semibold py-4 px-6 rounded-lg transition-all duration-200 ease-in-out hover:bg-white/20 active:scale-95 text-base disabled:opacity-50"
                    disabled={isLoading || isEnhancing}
                >
                    {t('newLogo')}
                </button>
                <button
                    onClick={handleGenerateClick}
                    className="w-full bg-gradient-to-br from-[var(--color-primary-600)] to-[var(--color-primary-500)] text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-[var(--shadow-primary-light)] hover:shadow-xl hover:shadow-[var(--shadow-primary)] hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-[var(--color-primary-800)] disabled:to-[var(--color-primary-700)] disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                    disabled={isLoading || isEnhancing || !prompt.trim()}
                >
                    {t('generate')}
                </button>
            </div>
        </div>
    </div>
  );
};

export default React.memo(LogoMakerPanel);