/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { useTranslations } from '../useTranslations';
import { CubeIcon } from './icons';

interface AddProductPanelProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onGenerate: () => void;
  isLoading: boolean;
  hasMask: boolean;
}

const AddProductPanel: React.FC<AddProductPanelProps> = ({ prompt, onPromptChange, onGenerate, isLoading, hasMask }) => {
  const { t } = useTranslations();

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onPromptChange(e.target.value);
  };

  const handleGenerateClick = () => {
    onGenerate();
  };

  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-6 flex flex-col items-center gap-4 animate-fade-in backdrop-blur-sm">
        <div className="flex flex-col items-center text-center">
            <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-400 rounded-full mb-4 shadow-lg shadow-emerald-500/30">
                <CubeIcon className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-gray-200">{t('addProductTitle')}</h3>
        </div>

        <div className={`w-full text-center text-sm rounded-lg p-3 transition-colors ${hasMask ? 'bg-green-500/20 text-green-300' : 'bg-gray-700/80 text-gray-400'}`}>
            <p>{hasMask ? t('addProductInstruction2') : t('addProductInstruction1')}</p>
        </div>

        <div className="w-full flex flex-col gap-4">
            <textarea
                value={prompt}
                onChange={handlePromptChange}
                placeholder={t('placeholderProduct')}
                className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-4 focus:ring-2 focus:ring-green-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60 text-base min-h-[100px]"
                disabled={isLoading || !hasMask}
                rows={3}
            />
            <button
                onClick={handleGenerateClick}
                className="w-full bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-green-800 disabled:to-emerald-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                disabled={isLoading || !prompt.trim() || !hasMask}
            >
                {t('generate')}
            </button>
        </div>
    </div>
  );
};

export default React.memo(AddProductPanel);