import React, { useState, useEffect } from 'react';
import { database } from '../services/firebase';
import { ref, get, set } from 'firebase/database';
import Spinner from './Spinner';

const AdminApiKeysPanel: React.FC = () => {
    const [geminiKey, setGeminiKey] = useState('');
    const [kieKey, setKieKey] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [showGemini, setShowGemini] = useState(false);
    const [showKie, setShowKie] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const fetchKeys = async () => {
            if (!database) {
                setIsLoading(false);
                return;
            }
            try {
                const settingsRef = ref(database, 'settings');
                const snapshot = await get(settingsRef);
                if (snapshot.exists() && isMounted) {
                    const data = snapshot.val();
                    setGeminiKey(data.gemini_api_key || '');
                    setKieKey(data.kie_api_key || '');
                }
            } catch (err) {
                console.error("Error fetching admin API keys:", err);
                if (isMounted) {
                    setErrorMessage("Failed to fetch API keys from Firebase.");
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        fetchKeys();
        return () => {
            isMounted = false;
        };
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!database) {
            setErrorMessage("Firebase is not connected.");
            return;
        }

        setIsSaving(true);
        setSuccessMessage(null);
        setErrorMessage(null);

        try {
            const settingsRef = ref(database, 'settings');
            await set(settingsRef, {
                gemini_api_key: geminiKey.trim(),
                kie_api_key: kieKey.trim()
            });
            setSuccessMessage("API keys updated successfully for all users!");
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err: any) {
            console.error("Error saving API keys:", err);
            setErrorMessage(err?.message || "Failed to save API keys to database.");
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Spinner />
            </div>
        );
    }

    return (
        <div className="bg-gray-800/40 border border-gray-700/60 p-6 md:p-8 rounded-2xl max-w-2xl mx-auto space-y-6 animate-fade-in">
            <div>
                <h2 className="text-2xl font-bold text-white mb-2">System-wide API Keys Configuration</h2>
                <p className="text-sm text-gray-400">
                    Set default API keys used by all users of this application. Local overrides are disabled, so these keys control the core server-side and client-side processing.
                </p>
            </div>

            {successMessage && (
                <div className="bg-green-500/10 border border-green-500/30 text-green-400 p-4 rounded-xl text-sm font-semibold animate-scale-in">
                    ✓ {successMessage}
                </div>
            )}

            {errorMessage && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl text-sm font-semibold animate-scale-in">
                    ✗ {errorMessage}
                </div>
            )}

            <form onSubmit={handleSave} className="space-y-6">
                {/* Gemini Model API Key */}
                <div className="space-y-2">
                    <label className="block text-sm font-bold text-gray-300">
                        Default Gemini API Key
                    </label>
                    <div className="relative">
                        <input
                            type={showGemini ? "text" : "password"}
                            value={geminiKey}
                            onChange={(e) => setGeminiKey(e.target.value)}
                            placeholder="AIzaSy..."
                            className="w-full bg-gray-900 border border-gray-650 text-gray-100 placeholder-gray-500 rounded-xl p-3.5 pr-12 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-transparent transition text-sm font-mono"
                        />
                        <button
                            type="button"
                            onClick={() => setShowGemini(!showGemini)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                        >
                            {showGemini ? "Hide" : "Show"}
                        </button>
                    </div>
                    <p className="text-xs text-gray-400">
                        Used for AI-assisted prompt enhancement.
                    </p>
                </div>

                {/* Kie.ai API Key */}
                <div className="space-y-2">
                    <label className="block text-sm font-bold text-gray-300">
                        Default Kie.ai API Key
                    </label>
                    <div className="relative">
                        <input
                            type={showKie ? "text" : "password"}
                            value={kieKey}
                            onChange={(e) => setKieKey(e.target.value)}
                            placeholder="8add62..."
                            className="w-full bg-gray-900 border border-gray-650 text-gray-100 placeholder-gray-500 rounded-xl p-3.5 pr-12 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-transparent transition text-sm font-mono"
                        />
                        <button
                            type="button"
                            onClick={() => setShowKie(!showKie)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                        >
                            {showKie ? "Hide" : "Show"}
                        </button>
                    </div>
                    <p className="text-xs text-gray-400">
                        Used as the primary engine for high-fidelity image generation and editing.
                    </p>
                </div>

                <div className="pt-2">
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="w-full bg-[var(--color-primary-600)] hover:bg-[var(--color-primary-500)] text-white font-bold py-3 px-6 rounded-xl transition duration-200 shadow-lg hover:shadow-primary-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isSaving ? <Spinner /> : "Save Database API Keys"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default AdminApiKeysPanel;
