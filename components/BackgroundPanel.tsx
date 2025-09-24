/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { useTranslations } from '../useTranslations';

interface BackgroundPanelProps {
  onApplyBackgroundChange: (prompt: string) => void;
  isLoading: boolean;
}

const BackgroundPanel: React.FC<BackgroundPanelProps> = ({ onApplyBackgroundChange, isLoading }) => {
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
                disabled={isLoading}
                className="w-full bg-gradient-to-br from-indigo-600 to-purple-500 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:shadow-indigo-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-indigo-800 disabled:to-purple-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
            >
                {t('removeBackground')}
            </button>
        </div>

        <div className="w-full md:w-px h-px md:h-24 bg-gray-600"></div>

        <div className="w-full md:w-2/3 flex flex-col items-center text-center">
            <h4 className="text-lg font-medium text-gray-300">{t('changeWithAI')}</h4>
            <p className="text-sm text-gray-400 mb-2">{t('changeWithAIDescription')}</p>
            <form onSubmit={(e) => { e.preventDefault(); handleChange(); }} className="w-full flex items-center gap-2">
                <input
                    type="text"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder={t('placeholderBackground')}
                    className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-4 focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60 text-base"
                    disabled={isLoading}
                />
                <button
                    type="submit"
                    className="bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-5 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                    disabled={isLoading || !customPrompt.trim()}
                >
                    {t('change')}
                </button>
            </form>
        </div>
      </div>
    </div>
  );
};

export default BackgroundPanel;