import { database } from './firebase';
import { ref, onValue } from 'firebase/database';

let cachedGeminiKey = '';
let cachedKieKey = '';

// Subscribe to default/admin API keys in Firebase Realtime Database
if (database) {
    try {
        const settingsRef = ref(database, 'settings');
        onValue(settingsRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                cachedGeminiKey = data.gemini_api_key || '';
                cachedKieKey = data.kie_api_key || '';
                console.log("Database API Keys synchronized successfully.");
            }
        }, (err) => {
            console.warn("Database API keys subscription failed:", err);
        });
    } catch (e) {
        console.error("Failed to initialize Database API keys subscription:", e);
    }
}

export const getSyncedGeminiKey = (): string => {
    return cachedGeminiKey;
};

export const getSyncedKieKey = (): string => {
    return cachedKieKey;
};
