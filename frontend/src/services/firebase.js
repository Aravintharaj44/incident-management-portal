import { initializeApp, getApps, getApp } from "firebase/app";
import { getMessaging, isSupported } from "firebase/messaging";

/**
 * Centralised Firebase Web SDK initialisation.
 *
 * Reads the public VITE_FIREBASE_* config (safe for the browser bundle - these
 * are NOT the Admin service-account credentials). Initialisation happens once,
 * lazily, and every helper returns null when Firebase is not configured so the
 * rest of the app keeps working without push.
 */

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

export const getVapidKey = () => import.meta.env.VITE_FIREBASE_VAPID_KEY || "";

export const isFirebaseConfigured = () =>
    Boolean(
        firebaseConfig.apiKey &&
            firebaseConfig.projectId &&
            firebaseConfig.messagingSenderId &&
            firebaseConfig.appId &&
            getVapidKey()
    );

let app = null;
let messagingPromise = null;

export const getFirebaseApp = () => {
    if (!isFirebaseConfigured()) return null;
    if (!app) app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    return app;
};

/** Resolves the Firebase Messaging instance, or null when unavailable. */
export const getFirebaseMessaging = async () => {
    if (!isFirebaseConfigured()) return null;

    if (!messagingPromise) {
        messagingPromise = (async () => {
            try {
                if (!(await isSupported())) return null;
                const firebaseApp = getFirebaseApp();
                return firebaseApp ? getMessaging(firebaseApp) : null;
            } catch {
                return null;
            }
        })();
    }

    return messagingPromise;
};
