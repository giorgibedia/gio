
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import * as firebaseAuth from 'firebase/auth';
import { auth, database } from './services/firebase';
import { ref, set, update, serverTimestamp, get, remove } from 'firebase/database';
// FIX: Import functions needed for account data management
import { getImagesFromGallery, deleteImageFromGallery } from './services/geminiService';


interface AuthContextType {
    user: firebaseAuth.User | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    signUpWithEmail: (email: string, password: string) => Promise<void>;
    signInWithEmail: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    // FIX: Add method signatures to the context type
    updateDisplayName: (name: string) => Promise<void>;
    deleteAccountAndData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<firebaseAuth.User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!auth) {
            setLoading(false);
            return;
        }
        const unsubscribe = firebaseAuth.onAuthStateChanged(auth, async (currentUser) => {
            // We now keep the currentUser even if anonymous, so AnalyticsService can use the UID.
            // The UI components (Header, App) will check 'user.isAnonymous' to decide what to show.
            setUser(currentUser);

            // Only sync user data to RTDB if we have a user
            if (currentUser && database) {
                const userRef = ref(database, `users/${currentUser.uid}`);
                try {
                    const snapshot = await get(userRef);
                    
                    // Basic data
                    const userData: { [key: string]: any } = {
                        lastSeen: serverTimestamp(),
                        // Identify anonymous users in the DB
                        isAnonymous: currentUser.isAnonymous,
                        email: currentUser.email || 'N/A',
                        name: currentUser.displayName || (currentUser.isAnonymous ? 'Guest' : currentUser.email) || 'Unnamed User',
                    };

                    if (snapshot.exists()) {
                        await update(userRef, userData);
                    } else {
                        userData['firstSeen'] = serverTimestamp();
                        await set(userRef, userData);
                    }
                } catch (error) {
                    // This might fail for anonymous users if DB rules are strict, which is expected/okay.
                    // console.error("Failed to update user data in RTDB:", error);
                }
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const signInWithGoogle = async () => {
        if (!auth) throw new Error("Firebase Auth not initialized.");
        
        // Explicitly set persistence to LOCAL to ensure user stays logged in
        await firebaseAuth.setPersistence(auth, firebaseAuth.browserLocalPersistence);
        
        const provider = new firebaseAuth.GoogleAuthProvider();
        await firebaseAuth.signInWithPopup(auth, provider);
    };

    const signUpWithEmail = async (email: string, password: string) => {
        if (!auth) throw new Error("Firebase Auth not initialized.");
        // Persistence defaults to local for standard email auth, but setting explicitly is safe
        await firebaseAuth.setPersistence(auth, firebaseAuth.browserLocalPersistence);
        await firebaseAuth.createUserWithEmailAndPassword(auth, email, password);
    };

    const signInWithEmail = async (email: string, password: string) => {
        if (!auth) throw new Error("Firebase Auth not initialized.");
        await firebaseAuth.setPersistence(auth, firebaseAuth.browserLocalPersistence);
        await firebaseAuth.signInWithEmailAndPassword(auth, email, password);
    };

    const logout = async () => {
        if (!auth) throw new Error("Firebase Auth not initialized.");
        await firebaseAuth.signOut(auth);
    };

    // FIX: Implement the method to update a user's display name.
    const updateDisplayName = async (name: string) => {
        if (!auth?.currentUser) throw new Error("Not authenticated.");
        
        await firebaseAuth.updateProfile(auth.currentUser, { displayName: name });
        
        if (database) {
            const userRef = ref(database, `users/${auth.currentUser.uid}`);
            await update(userRef, { name });
        }
        
        // Create a new user object to force re-render in consumers
        setUser(auth.currentUser ? { ...auth.currentUser } : null);
    };

    // FIX: Implement the method to delete a user's account and all their associated data.
    const deleteAccountAndData = async () => {
        if (!auth?.currentUser || !database) {
            throw new Error("Not authenticated or Firebase not configured.");
        }
        const userToDelete = auth.currentUser;
        const userId = userToDelete.uid;

        try {
            // 1. Delete Supabase data (gallery images)
            const images = await getImagesFromGallery(userId);
            if (images.length > 0) {
                const deletePromises = images.map(image => deleteImageFromGallery(image.name, userId));
                await Promise.all(deletePromises);
            }

            // 2. Delete RTDB data (user profile info)
            const userRef = ref(database, `users/${userId}`);
            await remove(userRef);

            // 3. Delete Auth user
            await firebaseAuth.deleteUser(userToDelete);
            
        } catch (error) {
            console.error("Error during account deletion process:", error);
            if (error instanceof Error) {
                 // Re-throw a more user-friendly error
                 throw new Error(`Failed to delete account. ${error.message}`);
            }
            throw new Error("An unknown error occurred during account deletion.");
        }
    };


    const value = { user, loading, signInWithGoogle, signUpWithEmail, signInWithEmail, logout, updateDisplayName, deleteAccountAndData };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
