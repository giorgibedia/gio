/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { createContext, useState, useCallback, ReactNode } from 'react';
import { translations } from './translations';

type Language = 'en' | 'ka';
type TranslationKey = keyof typeof translations.en;

interface LanguageContextType {
    language: Language;
    setLanguage: (language: Language) => void;
    t: (key: TranslationKey, ...args: any[]) => string;
}

export const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

interface LanguageProviderProps {
    children: ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
    const [language, setLanguage] = useState<Language>('en');

    const t = useCallback((key: TranslationKey, ...args: any[]): string => {
        const string = translations[language][key] || translations['en'][key];
        // Simple argument replacement, e.g., t('key', 'value') replaces {0} with 'value'
        if (args.length > 0) {
            return string.replace(/\{(\d+)\}/g, (match, number) => {
                return typeof args[number] !== 'undefined' ? args[number] : match;
            });
        }
        return string;
    }, [language]);

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};
