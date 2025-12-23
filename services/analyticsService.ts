
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { database, isFirebaseConfigured, auth } from './firebase';
import { ref, push, serverTimestamp, update } from 'firebase/database';
import { isMobileApp } from './geminiService'; // Import detection logic
import * as firebaseAuth from 'firebase/auth';

// Interfaces for data structures
interface UserData {
    firstSeen: object; 
    lastSeen: object;
}

interface Action {
    userId: string;
    feature: string;
    platform: 'mobile_app' | 'web'; // Added platform field
    timestamp: object; 
    details?: {
        prompt?: string;
        duration?: number; 
    };
}

interface AppError {
    feature: string;
    message: string;
    timestamp: object; 
    userId: string;
}

// User Identification
let anonymousUserId: string | null = null;
const ANON_USER_ID_KEY = 'pixai_anon_user_id';

const getAnonymousUserId = (): string => {
    if (anonymousUserId) return anonymousUserId;
    
    let storedId = localStorage.getItem(ANON_USER_ID_KEY);
    if (!storedId) {
        storedId = `anon_${crypto.randomUUID()}`;
        localStorage.setItem(ANON_USER_ID_KEY, storedId);
    }
    anonymousUserId = storedId;
    return anonymousUserId;
};

export const getUserId = (): string => {
    // Prefer the Firebase Auth UID if available (even if anonymous), 
    // as this satisfies database security rules.
    if (auth?.currentUser) {
        return auth.currentUser.uid;
    }
    return getAnonymousUserId();
}

export const init = async () => {
    if (!isFirebaseConfigured || !database || !auth) return;

    // Fix for PERMISSION_DENIED:
    // If no user is signed in, try sign in anonymously.
    if (!auth.currentUser) {
        try {
            await firebaseAuth.signInAnonymously(auth);
        } catch (error) {
            // If anonymous auth is disabled in console, this will fail.
            // We proceed anyway, but database writes might fail if rules require auth.
            // Silently ignoring detailed logs here to avoid console spam if feature is off
        }
    }

    // Log visit.
    logAction('visit', {
        info: 'App opened / Session Start',
        userAgent: navigator.userAgent
    });
};

export const logAction = (feature: string, details?: Record<string, any>) => {
    if (!isFirebaseConfigured || !database || !auth) return;
    
    // FIX: If the user is not authenticated, do not attempt to write to the database.
    // This prevents "FIREBASE WARNING: permission_denied" console noise if Anonymous Auth is disabled.
    if (!auth.currentUser) return;
    
    // We allow logging for everyone (including anonymous).
    // The database rules must be set to ".write": "auth != null" (if using Anon Auth) or ".write": true (insecure).
    
    // Capture these locally to satisfy TypeScript in the promise callback
    const db = database; 
    const authInstance = auth;

    const currentUserId = getUserId();
    const actionsRef = ref(db, 'actions');
    
    // Detect platform using the centralized logic
    const platform = isMobileApp() ? 'mobile_app' : 'web';

    const newAction: Action = {
        userId: currentUserId,
        feature: feature,
        platform: platform,
        timestamp: serverTimestamp(),
        details: details || {},
    };
    
    push(actionsRef, newAction)
        .then(() => {
            // Only update user stats if we have a valid UID from Firebase or if we are logging anonymously
            const userRef = ref(db, `users/${currentUserId}`);
            const isAnon = !authInstance.currentUser || authInstance.currentUser.isAnonymous;
            
            const userUpdate: any = { 
                lastSeen: serverTimestamp() 
            };

            // For anonymous users, ensure they have a name so they show up in the Admin Panel
            if (isAnon) {
                userUpdate.name = 'Anonymous';
                userUpdate.isAnonymous = true;
                // We don't overwrite email, leave it undefined/null
            }

            // We use update to avoid overwriting existing data like 'firstSeen'
            update(userRef, userUpdate).catch((err) => {
                // Ignore user stat update errors for anonymous users if permission denied
            });
        
    }).catch(error => {
        // Silently fail on permission denied to keep console clean, unless strictly debugging
        if ((error as any).code !== 'PERMISSION_DENIED') {
            console.warn("Log action failed:", error);
        }
    });
};

export const logError = (feature: string, message: string) => {
    if (!isFirebaseConfigured || !database || !auth) return;

    // FIX: If the user is not authenticated, do not attempt to write to the database.
    if (!auth.currentUser) return;

    // Capture locally
    const db = database;

    const currentUserId = getUserId();
    const errorsRef = ref(db, 'errors');
    const newError: AppError = {
        userId: currentUserId,
        feature: feature,
        message: message,
        timestamp: serverTimestamp(),
    };
    push(errorsRef, newError).catch(error => {
        if ((error as any).code !== 'PERMISSION_DENIED') {
            console.warn("Log error failed:", error);
        }
    });
};

export const getAnalytics = async () => {
    if (!isFirebaseConfigured || !database) {
        const today = new Date();
        const dailyData = Array(7).fill(0).map((_, i) => {
            const date = new Date(today);
            date.setDate(today.getDate() - (6 - i));
            return { date: date.toISOString().split('T')[0], count: 0 };
        });
        return {
            isConfigured: false,
            totalUsers: 0, usersToday: 0, usersThisWeek: 0, dailyUniqueUsers: [...dailyData],
            featureBreakdown: [], userActivityLog: [], topPrompts: [],
            allErrors: [], allActions: [], estimatedCost: 0, avgSessionDuration: 0, errorTrends: [...dailyData],
        };
    }
    return {};
};
