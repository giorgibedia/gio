/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import { XMarkIcon, GoogleIcon } from './icons';
import Spinner from './Spinner';
import { useTranslations } from '../useTranslations';

interface AuthScreenProps {
  onClose: () => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onClose }) => {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const { t } = useTranslations();

  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleAuthError = (err: unknown) => {
    let message = 'An unknown error occurred.';
    // Check if the error object has a 'code' property, typical for Firebase errors
    if (typeof err === 'object' && err !== null && 'code' in err) {
        const errorCode = (err as { code: string }).code;
        switch (errorCode) {
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                message = 'Invalid email or password.';
                break;
            case 'auth/email-already-in-use':
                message = 'This email is already registered.';
                break;
            case 'auth/weak-password':
                message = 'Password should be at least 6 characters.';
                break;
            case 'auth/invalid-email':
                message = 'Please enter a valid email address.';
                break;
            default:
                message = 'An authentication error occurred. Please try again.';
                console.error('Firebase Auth Error:', errorCode);
        }
    } else if (err instanceof Error) {
        message = err.message;
    }
    setError(message);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (mode === 'signUp') {
        if (password !== confirmPassword) {
            setError(t('errorPasswordsDontMatch'));
            setIsLoading(false);
            return;
        }
        try {
            await signUpWithEmail(email, password);
            // With Firebase, user is automatically signed in, so we can close the modal.
            onClose();
        } catch (err) {
            handleAuthError(err);
        }
    } else { // signIn
        try {
            await signInWithEmail(email, password);
            onClose();
        } catch (err) {
            handleAuthError(err);
        }
    }

    setIsLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      // The onAuthStateChange listener will handle closing the modal upon successful login.
    } catch (err) {
      handleAuthError(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="relative bg-gray-800/80 border border-gray-700 w-full max-w-md rounded-2xl flex flex-col items-center p-8 shadow-2xl animate-scale-in">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors">
          <XMarkIcon className="w-6 h-6" />
        </button>

        <h2 className="text-3xl font-bold text-center text-gray-100 mb-2">{t('authWelcome')}</h2>
        <p className="text-gray-400 text-center mb-6">{t('authPrompt')}</p>

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4 mt-6">
            <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder={t('email')} 
                required
                className="w-full bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-[var(--color-primary-500)] focus:outline-none transition" />
            <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder={t('password')} 
                required
                className="w-full bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-[var(--color-primary-500)] focus:outline-none transition" />
            {mode === 'signUp' && (
                <input 
                    type="password" 
                    value={confirmPassword} 
                    onChange={(e) => setConfirmPassword(e.target.value)} 
                    placeholder={t('confirmPassword')}
                    required
                    className="w-full bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-[var(--color-primary-500)] focus:outline-none transition" />
            )}
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center bg-[var(--color-primary-600)] hover:bg-[var(--color-primary-700)] text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 ease-in-out disabled:opacity-60 disabled:cursor-wait"
            >
              {isLoading ? <Spinner /> : (mode === 'signIn' ? t('signIn') : t('signUp'))}
            </button>
        </form>

        <div className="flex items-center w-full my-6">
            <div className="flex-grow h-px bg-gray-600"></div>
            <span className="flex-shrink mx-4 text-gray-400 text-sm">{t('orContinueWith')}</span>
            <div className="flex-grow h-px bg-gray-600"></div>
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-semibold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg hover:shadow-xl hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:opacity-60 disabled:cursor-wait"
        >
          <GoogleIcon className="w-6 h-6" />
          {t('signIn')} with Google
        </button>
        
        <p className="text-sm text-gray-400 mt-6">
            {mode === 'signIn' ? t('noAccount') : t('hasAccount')}{' '}
            <button onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')} className="font-bold text-[var(--color-primary-400)] hover:underline">
                {mode === 'signIn' ? t('signUp') : t('signIn')}
            </button>
        </p>

      </div>
    </div>
  );
};

export default AuthScreen;