/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useRef } from 'react';
import { useTranslations, Language } from '../useTranslations';
import { useAuth } from '../AuthContext';
import { SparkleIcon, ChevronDownIcon, UserCircleIcon, ArrowRightOnRectangleIcon, PhotoAlbumIcon, ChevronLeftIcon, Cog6ToothIcon } from './icons';

interface HeaderProps {
    onHomeClick: () => void;
    onAboutClick: () => void;
    onGalleryClick: () => void;
    onSettingsClick: () => void;
    onLoginClick: () => void;
    isEditing?: boolean;
}

const LanguageSelector: React.FC = () => {
    const { language, setLanguage } = useTranslations();
    const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
    const langMenuRef = useRef<HTMLDivElement>(null);

    const languages: { code: Language, name: string, shortName: string }[] = [
        { code: 'en', name: 'English', shortName: 'EN' },
        { code: 'ka', name: 'ქართული', shortName: 'KA' },
    ];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
                setIsLangMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const changeLanguage = (langCode: Language) => {
        setLanguage(langCode);
        setIsLangMenuOpen(false);
    };

    const currentLang = languages.find(l => l.code === language);

    return (
        <div className="relative" ref={langMenuRef}>
            <button 
                onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
                className="flex items-center gap-1 px-3 py-2 text-sm font-semibold rounded-md transition-colors bg-white/10 text-gray-200 hover:bg-white/20"
            >
                <span>{currentLang?.shortName}</span>
                <ChevronDownIcon className={`w-4 h-4 transition-transform duration-200 ${isLangMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {isLangMenuOpen && (
                 <div className="absolute top-full right-0 mt-2 w-36 bg-gray-800 border border-gray-700 rounded-md shadow-lg py-1 animate-scale-in" style={{ transformOrigin: 'top right' }}>
                    {languages.map(({ code, name }) => (
                        <button 
                            key={code}
                            onClick={() => changeLanguage(code)}
                            className={`w-full text-left px-4 py-2 text-sm transition-colors ${language === code ? 'bg-[var(--color-primary-500)] text-white' : 'text-gray-300 hover:bg-white/10'}`}
                        >
                            {name}
                        </button>
                    ))}
                 </div>
            )}
        </div>
    );
};

const Header: React.FC<HeaderProps> = ({ onHomeClick, onAboutClick, onGalleryClick, onSettingsClick, onLoginClick, isEditing }) => {
  const { t } = useTranslations();
  const { user, logout } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = () => {
    logout();
    setIsUserMenuOpen(false);
  };

  // Treat anonymous users as not logged in for UI purposes
  const isGuest = !user || user.isAnonymous;

  return (
    <header className="w-full py-4 px-4 sm:px-8 border-b border-gray-700 bg-gray-800/30 backdrop-blur-sm sticky top-0 z-50">
      <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
                onClick={onHomeClick} 
                className="flex items-center gap-1 text-base font-semibold text-gray-300 hover:text-white transition-colors"
            >
                {isEditing && <ChevronLeftIcon className="w-4 h-4" />}
                <span>{t('home')}</span>
            </button>
            <button 
                onClick={onAboutClick} 
                className="text-base font-semibold text-gray-300 hover:text-white transition-colors"
            >
                {t('about')}
            </button>
          </div>
          
          <div className="flex items-center justify-center gap-3 absolute left-1/2 -translate-x-1/2">
              <SparkleIcon className="w-6 h-6 text-[var(--color-primary-400)]" />
              <h1 className="text-xl font-bold tracking-tight text-gray-100 hidden sm:inline">
                PixAI
              </h1>
              <span className="ml-1 text-xs font-mono bg-[var(--color-primary-500)]/30 text-[var(--color-primary-300)] px-2 py-0.5 rounded-full tracking-wider hidden sm:inline">Stable</span>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSelector />
            <div className="relative" ref={userMenuRef}>
                {isGuest ? (
                    <button 
                        onClick={onLoginClick}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-md transition-colors bg-white/10 text-gray-200 hover:bg-white/20"
                    >
                        <UserCircleIcon className="w-5 h-5" />
                        <span className="hidden sm:inline">{t('loginSignUp')}</span>
                    </button>
                ) : (
                    <>
                        <button 
                            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                            className="flex items-center gap-2 pl-2 pr-3 py-1 text-sm font-semibold rounded-full transition-colors bg-white/10 text-gray-200 hover:bg-white/20"
                        >
                            <img src={user.photoURL || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${user.uid}`} alt="User" className="w-7 h-7 rounded-full bg-gray-600" />
                            <span className="hidden sm:inline max-w-[120px] truncate">{user.displayName || user.email}</span>
                            <ChevronDownIcon className={`w-4 h-4 transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isUserMenuOpen && (
                            <div className="absolute top-full right-0 mt-2 w-56 bg-gray-800 border border-gray-700 rounded-md shadow-lg py-1 animate-scale-in" style={{ transformOrigin: 'top right' }}>
                                <div className='px-4 py-2 border-b border-gray-700'>
                                    <p className='text-sm font-bold text-white truncate'>{user.displayName || 'User'}</p>
                                    <p className='text-xs text-gray-400 truncate'>{user.email}</p>
                                </div>
                                <div className="py-1">
                                    <button 
                                        onClick={() => { onGalleryClick(); setIsUserMenuOpen(false); }}
                                        className="w-full flex items-center gap-2 text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/10 transition-colors"
                                    >
                                        <PhotoAlbumIcon className="w-5 h-5" />
                                        <span>{t('myGallery')}</span>
                                    </button>
                                     <button 
                                        onClick={() => { onSettingsClick(); setIsUserMenuOpen(false); }}
                                        className="w-full flex items-center gap-2 text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/10 transition-colors"
                                    >
                                        <Cog6ToothIcon className="w-5 h-5" />
                                        <span>{t('profileSettings')}</span>
                                    </button>
                                </div>
                                <div className="border-t border-gray-700 my-1" />
                                <button 
                                    onClick={handleLogout}
                                    className="w-full flex items-center gap-3 text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/20 transition-colors"
                                >
                                    <ArrowRightOnRectangleIcon className="w-5 h-5" />
                                    <span>{t('logout')}</span>
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
          </div>
      </div>
    </header>
  );
};

export default React.memo(Header);