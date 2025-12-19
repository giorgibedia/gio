/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { initializeApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getDatabase, Database } from "firebase/database";

// Your web app's Firebase configuration from user prompt
const firebaseConfig = {
  apiKey: "AIzaSyAlxwqP5mywXvsBig0WwsvLgyf8ijbspyo",
  authDomain: "photo-edit-ai.firebaseapp.com",
  databaseURL: "https://photo-edit-ai-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "photo-edit-ai",
  storageBucket: "photo-edit-ai.firebasestorage.app",
  messagingSenderId: "385350236173",
  appId: "1:385350236173:web:6305f5f6c41c205a8cfd44",
  measurementId: "G-NGV0TDZF0Y"
};

let app: FirebaseApp | undefined;
let database: Database | undefined;
let auth: Auth | undefined;

export const isFirebaseConfigured = !!(firebaseConfig.apiKey && firebaseConfig.databaseURL);

if (isFirebaseConfigured) {
    try {
        app = initializeApp(firebaseConfig);
        database = getDatabase(app);
        auth = getAuth(app);
    } catch (e) {
        console.error("Firebase initialization error:", e);
    }
}

export { database, auth };