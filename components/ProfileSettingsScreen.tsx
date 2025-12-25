
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { useTranslations } from '../useTranslations';
// FIX: Import the newly added PaintBrushIcon.
import { UserCircleIcon, PaintBrushIcon, ShieldExclamationIcon, ChevronLeftIcon, CheckCircleIcon, WrenchScrewdriverIcon } from './icons';
import { setDebugApiKey, getDebugApiKey, clearDebugApiKey } from '../services/geminiService';

interface ProfileSettingsScreenProps {
    onClose: () => void;
}

const ProfileSettingsScreen: React.FC<ProfileSettingsScreenProps> = ({ onClose }) => {
    // FIX: These methods are now available from the updated AuthContext.
    const { user, updateDisplayName, deleteAccountAndData } = useAuth();
    const { t } = useTranslations();

    const [displayName, setDisplayName] = useState(user?.displayName || '');
    const [nameSaveStatus, setNameSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
    
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');

    const [activeTheme, setActiveTheme] = useState('blue');
    // NOTE: Profile settings now defaults to showing/editing the GOOGLE key by default
    // For more advanced provider switching, the main UI ModelSelector is preferred.
    const [customKey, setCustomKey] = useState(getDebugApiKey('google'));

    useEffect(() => {
        const savedTheme = localStorage.getItem('appTheme') || 'blue';
        setActiveTheme(savedTheme);
    }, []);
    
    const themes = [
        { name: 'blue', color: '#3b82f6' },
        { name: 'purple', color: '#a855f7' },
        { name: 'green', color: '#22c55e' },
        { name: 'pink', color: '#ec4899' },
        { name: 'orange', color: '#f97316' },
        { name: 'teal', color: '#2dd4bf' },
        { name: 'grayscale', color: '#6b7280' },
    ];
    
    const handleThemeChange = (themeName: string) => {
        localStorage.setItem('appTheme', themeName);
        document.documentElement.setAttribute('data-theme', themeName);
        setActiveTheme(themeName);
    };

    const handleNameUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setNameSaveStatus('saving');
        try {
            await updateDisplayName(displayName);
            setNameSaveStatus('saved');
            setTimeout(() => setNameSaveStatus('idle'), 2000);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to update name.";
            setError(message);
            setNameSaveStatus('error');
        }
    };
    
    const handleDeleteAccount = async () => {
        if (deleteConfirmText !== 'DELETE') return;
        try {
            await deleteAccountAndData();
            // User will be logged out, and onAuthStateChanged will handle the rest.
            // No need to call onClose here as the app state will change.
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to delete account.";
            setError(message);
            setIsDeleteModalOpen(false);
        }
    };
    
    const renderNameButtonContent = () => {
        switch (nameSaveStatus) {
            case 'saving': return '...';
            case 'saved': return <CheckCircleIcon className="w-5 h-5"/>;
            default: return t('save' as any);
        }
    };
    
    return (
        <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 animate-fade-in">
            <button onClick={onClose} className="flex items-center gap-2 text-sm font-semibold text-gray-300 hover:text-white mb-6">
                <ChevronLeftIcon className="w-5 h-5" />
                <span>{t('goBack')}</span>
            </button>
            <h1 className="text-4xl font-extrabold text-gray-100 mb-8">{t('profileSettings' as any)}</h1>
            
            {error && <p className="text-center text-red-400 bg-red-500/10 p-3 rounded-lg mb-6">{error}</p>}
            
            <div className="space-y-8">
                {/* Appearance Section */}
                <section className="bg-gray-800/50 border border-gray-700 p-6 rounded-2xl">
                    <div className="flex items-center gap-3 mb-4">
                        <PaintBrushIcon className="w-6 h-6 text-gray-400" />
                        <h2 className="text-xl font-bold text-white">{t('appearance' as any)}</h2>
                    </div>
                    <p className="text-sm text-gray-400 mb-4">{t('themeColor' as any)}</p>
                    <div className="flex flex-wrap gap-3">
                        {themes.map(theme => (
                            <button
                                key={theme.name}
                                onClick={() => handleThemeChange(theme.name)}
                                className={`w-10 h-10 rounded-full transition-all duration-200 border-2 ${activeTheme === theme.name ? 'border-white scale-110' : 'border-transparent hover:scale-110'}`}
                                style={{ backgroundColor: theme.color }}
                                aria-label={`Select ${theme.name} theme`}
                            />
                        ))}
                    </div>
                </section>
                
                {/* Account Section */}
                <section className="bg-gray-800/50 border border-gray-700 p-6 rounded-2xl">
                     <div className="flex items-center gap-3 mb-4">
                        <UserCircleIcon className="w-6 h-6 text-gray-400" />
                        <h2 className="text-xl font-bold text-white">{t('account' as any)}</h2>
                    </div>
                    <form onSubmit={handleNameUpdate} className="space-y-4">
                        <div>
                            <label htmlFor="displayName" className="block text-sm font-medium text-gray-400 mb-1">{t('displayName' as any)}</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    id="displayName"
                                    value={displayName}
                                    onChange={e => setDisplayName(e.target.value)}
                                    className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-[var(--color-primary-500)] focus:outline-none transition w-full"
                                />
                                 <button
                                    type="submit"
                                    disabled={nameSaveStatus === 'saving' || displayName === user?.displayName}
                                    className="w-24 text-center bg-[var(--color-primary-600)] hover:bg-[var(--color-primary-700)] text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 ease-in-out disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {renderNameButtonContent()}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">{t('email')}</label>
                            <p className="text-gray-300 bg-gray-700/50 p-3 rounded-lg">{user?.email}</p>
                        </div>
                    </form>
                </section>

                {/* API Key Override Section */}
                <section className="bg-gray-800/50 border border-yellow-500/30 p-6 rounded-2xl">
                    <div className="flex items-center gap-3 mb-4">
                        <WrenchScrewdriverIcon className="w-6 h-6 text-yellow-400" />
                        <h2 className="text-xl font-bold text-gray-200">Google API Key Override</h2>
                    </div>
                    <p className="text-sm text-gray-400 mb-4">
                        Override the default Google API key here. For Together AI, use the selector on the main screen.
                    </p>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={customKey}
                            onChange={(e) => setCustomKey(e.target.value)}
                            placeholder="Paste Google API Key here (AIzaSy...)"
                            className="flex-grow bg-gray-900 border border-gray-600 text-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-yellow-500 transition w-full"
                        />
                        <button
                            onClick={() => setDebugApiKey(customKey, 'google')}
                            className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded-lg transition-colors whitespace-nowrap"
                        >
                            Set Key
                        </button>
                        {getDebugApiKey('google') && (
                             <button
                                onClick={() => { clearDebugApiKey('google'); setCustomKey(''); }}
                                className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </section>
                
                 {/* Danger Zone */}
                <section className="bg-red-900/20 border border-red-500/30 p-6 rounded-2xl">
                     <div className="flex items-center gap-3 mb-2">
                        <ShieldExclamationIcon className="w-6 h-6 text-red-400" />
                        <h2 className="text-xl font-bold text-red-300">{t('dangerZone' as any)}</h2>
                    </div>
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-semibold text-gray-200">{t('deleteAccount' as any)}</h3>
                            <p className="text-sm text-gray-400">{t('deleteAccountWarning' as any)}</p>
                        </div>
                        <button 
                            onClick={() => setIsDeleteModalOpen(true)}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                        >
                            {t('delete' as any)}
                        </button>
                    </div>
                </section>
            </div>
            
            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-gray-800 border border-red-500/50 w-full max-w-md rounded-2xl p-6 text-center animate-scale-in">
                        <ShieldExclamationIcon className="w-12 h-12 text-red-400 mx-auto mb-4"/>
                        <h2 className="text-xl font-bold text-white mb-2">{t('deleteConfirmTitle' as any)}</h2>
                        <p className="text-gray-400 text-sm mb-4">{t('deleteConfirmWarning' as any)}</p>
                        <p className="text-gray-400 text-sm mb-4">{t('deleteConfirmInstruction' as any)}</p>
                        
                        <input
                            type="text"
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 text-gray-200 rounded-lg p-3 text-center font-mono focus:ring-2 focus:ring-red-500 focus:outline-none transition"
                        />
                        
                        <div className="flex gap-4 mt-6">
                            <button onClick={() => setIsDeleteModalOpen(false)} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
                                {t('cancel' as any)}
                            </button>
                            <button
                                onClick={handleDeleteAccount}
                                disabled={deleteConfirmText !== 'DELETE'}
                                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {t('deleteAccount' as any)}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProfileSettingsScreen;
