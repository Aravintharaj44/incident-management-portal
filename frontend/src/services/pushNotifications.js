import client from "../api/client";
import { getToken, onMessage } from "firebase/messaging";
import { notificationApi } from "../api/notifications";
import {
    getFirebaseMessaging,
    getVapidKey,
    isFirebaseConfigured,
} from "./firebase";

/**
 * Browser push notification lifecycle.
 *
 * Permission is only ever requested from an explicit user action ("Enable
 * desktop notifications") - never on page load. Every helper is best-effort:
 * API failures surface as returned codes instead of thrown errors so the
 * settings UI (and the rest of the app) never breaks.
 */

const SW_PATH = "/firebase-messaging-sw.js";
const TOKEN_STORAGE_KEY = "imp_fcm_token";

export const PUSH_STATUS = {
    ENABLED: "enabled",
    DISABLED: "disabled",
    DENIED: "denied",
    UNSUPPORTED: "unsupported",
    NOT_CONFIGURED: "not_configured",
    ERROR: "error",
};

const isBrowserSupported = () =>
    typeof window !== "undefined" &&
    "Notification" in window &&
    "navigator" in window &&
    "serviceWorker" in navigator;

const readStoredToken = () => {
    try {
        return localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
        return null;
    }
};

const storeToken = (token) => {
    try {
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
        // Storage unavailable (private mode) - the backend copy still works.
    }
};

const clearStoredToken = () => {
    try {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
        // ignore
    }
};

/**
 * Current push state for the settings UI.
 * - supported: browser capability
 * - configured: VITE_FIREBASE_* + VAPID key present
 * - permission: Notification.permission
 * - registered: this device has a token the backend knows about
 */
export const getPushStatus = async () => {
    if (!isBrowserSupported()) {
        return { status: PUSH_STATUS.UNSUPPORTED, permission: "default", registered: false };
    }

    const permission = Notification.permission;
    const configured = isFirebaseConfigured();

    let registered = Boolean(readStoredToken());
    let serverConfigured = configured;
    if (permission === "granted") {
        try {
            const response = await notificationApi.listPushTokens();
            registered = Boolean(response.data?.tokens?.length);
            serverConfigured = response.data?.configured ?? configured;
        } catch {
            // Keep the local guess if the API is unreachable.
        }
    }

    if (!configured || !serverConfigured) {
        return { status: PUSH_STATUS.NOT_CONFIGURED, permission, registered };
    }
    if (permission === "denied") {
        return { status: PUSH_STATUS.DENIED, permission, registered };
    }
    if (permission === "granted" && registered) {
        return { status: PUSH_STATUS.ENABLED, permission, registered };
    }

    return { status: PUSH_STATUS.DISABLED, permission, registered };
};

/**
 * Full enable flow: permission -> service worker -> FCM token -> backend.
 * Only call from a user gesture so the permission prompt is meaningful.
 */
export const enablePush = async () => {
    if (!isBrowserSupported()) return { ok: false, code: PUSH_STATUS.UNSUPPORTED };
    if (!isFirebaseConfigured()) return { ok: false, code: PUSH_STATUS.NOT_CONFIGURED };

    try {
        let permission = Notification.permission;
        if (permission === "default") {
            permission = await Notification.requestPermission();
        }
        if (permission === "denied") return { ok: false, code: PUSH_STATUS.DENIED };
        if (permission !== "granted") return { ok: false, code: PUSH_STATUS.DENIED };

        const registration = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });

        const messaging = await getFirebaseMessaging();
        if (!messaging) return { ok: false, code: PUSH_STATUS.NOT_CONFIGURED };

        const token = await getTokenWithVapid(messaging, registration);
        if (!token) return { ok: false, code: PUSH_STATUS.ERROR };

        await notificationApi.registerPush(token);
        storeToken(token);

        return { ok: true, token };
    } catch (error) {
        return { ok: false, code: PUSH_STATUS.ERROR, message: error?.message };
    }
};

const getTokenWithVapid = (messaging, serviceWorkerRegistration) =>
    getToken(messaging, {
        vapidKey: getVapidKey(),
        serviceWorkerRegistration,
    });

/** Disables push for this device only; other devices stay registered. */
export const disablePush = async () => {
    const token = readStoredToken();
    clearStoredToken();

    try {
        if (token) await notificationApi.unregisterPush(token);
        await unsubscribeFromPush();
    } catch {
        // Backend/subscription cleanup is best-effort - the token is already
        // forgotten locally so the UI stays consistent.
    }

    return { ok: true };
};

/**
 * Called on logout with the JWT captured before it is cleared, so the backend
 * still recognises the caller. Never throws and never blocks logout.
 */
export const unregisterPushOnLogout = (jwt) => {
    const token = readStoredToken();
    if (!token) return;

    clearStoredToken();

    client
        .delete("/notifications/push/register", {
            data: { token },
            headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
        })
        .catch(() => {
            // Best-effort: an invalid token is cleaned up server-side anyway.
        });
};

const unsubscribeFromPush = async () => {
    try {
        const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
        if (registration?.pushManager) await registration.pushManager.unsubscribe();
    } catch {
        // ignore
    }
};

/**
 * Boot-time refresh: if permission was granted earlier, make sure the backend
 * still has the current token (tokens rotate when the browser regenerates
 * them) and re-register the service worker.
 */
export const syncPushToken = async () => {
    if (!isBrowserSupported() || !isFirebaseConfigured()) return null;
    if (Notification.permission !== "granted") return null;

    try {
        const messaging = await getFirebaseMessaging();
        if (!messaging) return null;

        const existingRegistration = await navigator.serviceWorker.getRegistration(SW_PATH);
        const registration =
            existingRegistration || (await navigator.serviceWorker.register(SW_PATH, { scope: "/" }));

        const token = await getTokenWithVapid(messaging, registration);
        if (!token) return null;

        if (token !== readStoredToken()) {
            await notificationApi.registerPush(token);
            storeToken(token);
        }
        return token;
    } catch {
        return null;
    }
};

/**
 * Foreground messages (app visible). Returns an unsubscribe function.
 * The caller decides how to display - we never auto-show a duplicate.
 */
export const onForegroundPush = async (handler) => {
    if (!isBrowserSupported() || !isFirebaseConfigured()) return () => {};
    if (Notification.permission !== "granted") return () => {};

    try {
        const messaging = await getFirebaseMessaging();
        if (!messaging) return () => {};

        return onMessage(messaging, handler);
    } catch {
        return () => {};
    }
};
