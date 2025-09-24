/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useContext } from 'react';
import { LanguageContext } from './LanguageContext';

export const useTranslations = () => {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useTranslations must be used within a LanguageProvider');
    }
    return context;
};
