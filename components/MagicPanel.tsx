/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useTranslations } from '../useTranslations';
import { SparkleIcon, UploadIcon, XMarkIcon } from './icons';

interface MagicPanelProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onGenerate: (aspectRatio: string, imageSize: string) => void;
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
  const [aspectRatio, setAspectRatio] = useState<string>('1:1');
  const [imageSize, setImageSize] = useState<string>('1K');
  
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

  // Aspect ratio presets for Vertex AI Image generation
  const aspectRatios = [
    { value: '1:1', label: '1:1', desc: 'Square', aspectClass: 'w-4 h-4' },
    { value: '16:9', label: '16:9', desc: 'Wide', aspectClass: 'w-6 h-3.5' },
    { value: '9:16', label: '9:16', desc: 'Tall', aspectClass: 'w-3.5 h-6' },
    { value: '4:3', label: '4:3', desc: 'Standard', aspectClass: 'w-5 h-4' },
    { value: '3:4', label: '3:4', desc: 'Portrait', aspectClass: 'w-4 h-5' },
  ];

  const sizeOptions = [
    { value: '512px', label: '512px', desc: 'Fast Draft' },
    { value: '1K', label: 'High Def (1K)', desc: 'Recommended' },
    { value: '2K', label: 'Ultra (2K)', desc: 'Super Crisp' },
  ];
  
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

        {/* Conditionally render Aspect Ratio and Image Size options only for clean text-to-image generations */}
        {!hasImage && (
          <div className="flex flex-col gap-3 py-1 border-t border-b border-gray-700/40 my-1">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Aspect Ratio</span>
              <div className="grid grid-cols-5 gap-1.5">
                {aspectRatios.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setAspectRatio(item.value)}
                    disabled={isLoading || isEnhancing}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all duration-200 ${
                      aspectRatio === item.value
                        ? 'bg-[var(--color-primary-600)]/20 border-[var(--color-primary-500)] text-white'
                        : 'bg-gray-850 border-gray-700 text-gray-400 hover:bg-gray-700/50 hover:text-gray-300'
                    }`}
                  >
                    <div className="h-6 flex items-center justify-center">
                      <div className={`border-2 ${
                        aspectRatio === item.value ? 'border-[var(--color-primary-400)] bg-[var(--color-primary-500)]/35' : 'border-gray-500 bg-transparent'
                      } rounded ${item.aspectClass}`} />
                    </div>
                    <span className="text-[10px] font-bold mt-1">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Output Resolution</span>
              <div className="grid grid-cols-3 gap-2">
                {sizeOptions.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setImageSize(item.value)}
                    disabled={isLoading || isEnhancing}
                    className={`flex flex-col p-2.5 rounded-lg border text-left transition-all duration-200 ${
                      imageSize === item.value
                        ? 'bg-[var(--color-primary-600)]/20 border-[var(--color-primary-500)] text-white'
                        : 'bg-gray-850 border-gray-700 text-gray-400 hover:bg-gray-700/50 hover:text-gray-300'
                    }`}
                  >
                    <span className="text-[11px] font-bold">{item.label}</span>
                    <span className="text-[9px] mt-0.5 text-gray-400/80 leading-none">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
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
          onClick={() => onGenerate(aspectRatio, imageSize)}
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
