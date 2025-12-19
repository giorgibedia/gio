/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { useTranslations } from '../useTranslations';
import { SparkleIcon, UploadIcon, XMarkIcon } from './icons';

interface MagicPanelProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onGenerate: () => void;
  isLoading: boolean;
  hasImage: boolean;
  secondImage: string | null;
  onSecondImageChange: (image: string | null) => void;
  currentImage: string | null;
  isEnhancing: boolean;
  onEnhance: (prompt: string, image?: string | null) => Promise<string>;
}

const MagicPanel: React.FC<MagicPanelProps> = ({
  prompt,
  onPromptChange,
  onGenerate,
  isLoading,
  hasImage,
  secondImage,
  onSecondImageChange,
  currentImage,
  isEnhancing,
  onEnhance,
}) => {
  const { t } = useTranslations();
  
  const handleSecondImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        onSecondImageChange(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    // Reset the input value to allow uploading the same file again
    e.target.value = '';
  };
  
  const instructionText = hasImage ? t('magicEditPrompt') : t('magicGeneratePrompt');
  const placeholderText = hasImage ? t('placeholderMagicEdit') : t('placeholderMagicGenerate');
  
  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex flex-col gap-4 animate-fade-in backdrop-blur-sm">
      <div className="flex flex-col items-center text-center">
          <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[var(--color-primary-600)] to-[var(--color-primary-500)] rounded-full mb-4 shadow-lg shadow-[var(--shadow-primary-light)]">
              <SparkleIcon className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-xl font-semibold text-gray-200">{t('magic')}</h3>
      </div>
      
      <div className='text-center text-sm rounded-lg p-3 bg-gray-700/80 text-gray-400'>
        <p>{instructionText}</p>
      </div>
      
      <div className="flex flex-col gap-4">
        {hasImage && (
            <>
                {secondImage ? (
                    <div className="relative group animate-fade-in">
                        <img src={secondImage} alt="Second" className="w-full rounded-lg object-contain max-h-32 border border-gray-600" />
                        <button
                            onClick={() => onSecondImageChange(null)}
                            disabled={isLoading || isEnhancing}
                            className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80 transition-colors"
                            aria-label="Remove second image"
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>
                ) : (
                    <label htmlFor="second-image-upload" className="relative flex items-center justify-center w-full py-3 text-sm font-semibold text-gray-300 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors border border-dashed border-gray-500 hover:border-gray-400">
                        <UploadIcon className="w-5 h-5 mr-2 text-gray-400" />
                        {t('uploadSecondImage')}
                    </label>
                )}
                <input id="second-image-upload" type="file" className="hidden" accept="image/*" onChange={handleSecondImageUpload} disabled={isLoading || isEnhancing} />
            </>
        )}

        <div className="relative w-full">
            <textarea
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder={placeholderText}
              className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-4 focus:ring-2 focus:ring-[var(--color-primary-500)] focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60 text-base min-h-[120px]"
              disabled={isLoading || isEnhancing}
              rows={4}
            />
            <button
                onClick={async () => {
                    const newPrompt = await onEnhance(prompt, currentImage);
                    onPromptChange(newPrompt);
                }}
                disabled={isLoading || isEnhancing || !prompt.trim()}
                className="absolute bottom-3 right-3 p-2 rounded-full bg-[var(--color-primary-600)]/80 text-white hover:bg-[var(--color-primary-500)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--color-primary-800)]"
                title={t('enhancePrompt')}
            >
                <SparkleIcon className="w-5 h-5" />
            </button>
        </div>
        <button
          onClick={onGenerate}
          className="w-full bg-gradient-to-br from-[var(--color-primary-600)] to-[var(--color-primary-500)] text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-[var(--shadow-primary-light)] hover:shadow-xl hover:shadow-[var(--shadow-primary)] hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-[var(--color-primary-800)] disabled:to-[var(--color-primary-700)] disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
          disabled={isLoading || isEnhancing || !prompt.trim()}
        >
          {t('generate')}
        </button>
      </div>
    </div>
  );
};

export default React.memo(MagicPanel);