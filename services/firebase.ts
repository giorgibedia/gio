
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import * as firebaseApp from "firebase/app";
import * as firebaseAuth from "firebase/auth";
import { getDatabase } from "firebase/database";
import type { Database } from "firebase/database";

// Configuration for Firebase project: pixai-app-f7405
const firebaseConfig = {
  apiKey: "AIzaSyAOXp0jHSLG-BQV6W7QJ4BnsDmWQVRlRwI",
  authDomain: "pixai-app-f7405.firebaseapp.com",
  databaseURL: "https://pixai-app-f7405-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "pixai-app-f7405",
  storageBucket: "pixai-app-f7405.firebasestorage.app",
  messagingSenderId: "928412691662",
  appId: "1:928412691662:web:cb222365597f6d1848349f",
  measurementId: "G-NJ466ZETWZ"
};

let app: firebaseApp.FirebaseApp | undefined;
let database: Database | undefined;
let auth: firebaseAuth.Auth | undefined;

// შემოწმება, არის თუ არა კონფიგურაცია ვალიდური
export const isFirebaseConfigured = !!firebaseConfig.apiKey;

if (isFirebaseConfigured) {
    try {
        app = firebaseApp.initializeApp(firebaseConfig);
        database = getDatabase(app);
        auth = firebaseAuth.getAuth(app);
    } catch (e) {
        console.error("Firebase initialization error:", e);
    }
} else {
    console.warn("Firebase is not configured yet.");
}

export { database, auth };
