/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { useTranslations } from '../useTranslations';
import { CheckCircleIcon, XMarkIcon } from './icons';

interface WelcomeScreenProps {
  onAccept: () => void;
}

const PolicyModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { t } = useTranslations();
    return (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div 
                className="w-full max-w-2xl bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl flex flex-col max-h-[80vh]"
                onClick={e => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                    <h2 className="text-xl font-bold text-gray-100">{t('policyTitle' as any)}</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>
                <div className="p-6 overflow-y-auto space-y-4">
                    <section>
                        <h3 className="text-lg font-semibold text-gray-200 mb-2">{t('policySection1Title' as any)}</h3>
                        <p className="text-gray-400 text-sm leading-relaxed">{t('policySection1Text' as any)}</p>
                    </section>
                    <section>
                        <h3 className="text-lg font-semibold text-gray-200 mb-2">{t('policySection2Title' as any)}</h3>
                        <p className="text-gray-400 text-sm leading-relaxed">{t('policySection2Text' as any)}</p>
                    </section>
                     <section>
                        <h3 className="text-lg font-semibold text-gray-200 mb-2">{t('policySection3Title' as any)}</h3>
                        <p className="text-gray-400 text-sm leading-relaxed">{t('policySection3Text' as any)}</p>
                    </section>
                </div>
                <footer className="p-4 border-t border-gray-700 flex-shrink-0 flex justify-end">
                     <button
                        onClick={onClose}
                        className="bg-[var(--color-primary-600)] hover:bg-[var(--color-primary-700)] text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                     >
                        {t('policyClose' as any)}
                    </button>
                </footer>
            </div>
        </div>
    );
};


const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onAccept }) => {
  const { t } = useTranslations();
  const [isChecked, setIsChecked] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);

  return (
    <>
      <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
        <div className="w-full max-w-lg bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl p-8 text-center flex flex-col items-center animate-scale-in">
          <CheckCircleIcon className="w-16 h-16 text-green-400 mb-4" />
          <h2 className="text-3xl font-bold text-gray-100 mb-4">{t('welcomeTitle' as any)}</h2>
          <p className="text-gray-300 mb-6 whitespace-pre-line">
            {t('welcomeText' as any)}
          </p>
          
          <div className="flex items-center gap-3 my-4 cursor-pointer" onClick={() => setIsChecked(!isChecked)}>
            <input
              id="terms-accept"
              type="checkbox"
              checked={isChecked}
              onChange={() => {}} // The parent div handles the click
              className="w-5 h-5 rounded text-[var(--color-primary-500)] bg-gray-700 border-gray-600 focus:ring-[var(--color-primary-600)] ring-offset-gray-800 cursor-pointer"
            />
            <label htmlFor="terms-accept" className="text-sm text-gray-300 cursor-pointer">
              {t('acceptTermsLabel' as any)}{' '}
              <span 
                className="text-[var(--color-primary-400)] hover:underline"
                onClick={(e) => {
                    e.stopPropagation(); // Prevent the checkbox from toggling
                    setShowPolicy(true);
                }}
              >
                {t('readPolicy' as any)}
              </span>
            </label>
          </div>

          <button
            onClick={onAccept}
            disabled={!isChecked}
            className="w-full mt-4 bg-gradient-to-br from-[var(--color-primary-600)] to-[var(--color-primary-500)] text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-[var(--shadow-primary-light)] hover:shadow-xl hover:shadow-[var(--shadow-primary)] hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-[var(--color-primary-800)] disabled:to-[var(--color-primary-700)] disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
          >
            {t('welcomeContinue' as any)}
          </button>
        </div>
      </div>
      {showPolicy && <PolicyModal onClose={() => setShowPolicy(false)} />}
    </>
  );
};

export default WelcomeScreen;