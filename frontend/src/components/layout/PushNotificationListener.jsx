import { useEffect, useRef } from "react";
import { App } from "antd";
import { useNavigate } from "react-router-dom";
import { isFirebaseConfigured } from "../../services/firebase";
import {
    onForegroundPush,
    syncPushToken,
} from "../../services/pushNotifications";

/**
 * Receives foreground push messages and shows them as an in-app antd
 * notification (never a duplicate browser popup).
 *
 * Two sources feed the same handler:
 * - the service worker, which forwards payloads when a visible app window
 *   exists instead of showing a system notification;
 * - Firebase onMessage(), kept as the SDK-native path (spec §12).
 * A short dedupe window prevents a message shown twice by both paths.
 *
 * Clicking a notification navigates to the incident; if the session has
 * expired the existing ProtectedRoute flow sends the user through login and
 * back to the incident afterwards.
 */
const PushNotificationListener = () => {
    const { notification } = App.useApp();
    const navigate = useNavigate();
    const seenRef = useRef(new Map());

    useEffect(() => {
        if (!isFirebaseConfigured()) return undefined;

        // Re-register the FCM token on boot in case the browser rotated it.
        syncPushToken();

        const buildIncidentUrl = (data) => {
            if (!data) return null;
            if (data.url) return data.url;
            if (data.incidentId) return `/incidents/${data.incidentId}`;
            return null;
        };

        let cancelled = false;
        let unsubscribe = () => {};
        let swListener = null;

        const showPush = (payload) => {
            const data = payload?.data || {};
            const title = payload?.notification?.title || "Incident Management Portal";
            const body = payload?.notification?.body || "";

            // Dedupe identical messages arriving from both sources.
            const now = Date.now();
            const key =
                data.notificationId || `${data.type || ""}:${data.incidentId || ""}:${title}`;
            for (const [seenKey, expiresAt] of seenRef.current) {
                if (expiresAt <= now) seenRef.current.delete(seenKey);
            }
            if (seenRef.current.has(key)) return;
            seenRef.current.set(key, now + 5000);

            notification.info({
                message: title,
                description: body,
                duration: 8,
                onClick: () => {
                    const url = buildIncidentUrl(data);
                    if (url) navigate(url);
                },
            });
        };

        (async () => {
            unsubscribe = await onForegroundPush(showPush);
            if (cancelled) unsubscribe();
        })();

        if ("serviceWorker" in navigator) {
            swListener = (event) => {
                if (event.data?.type === "FCM_PUSH_FOREGROUND") showPush(event.data.payload);
            };
            navigator.serviceWorker.addEventListener("message", swListener);
        }

        return () => {
            cancelled = true;
            unsubscribe();
            if (swListener) navigator.serviceWorker.removeEventListener("message", swListener);
        };
    }, [notification, navigate]);

    return null;
};

export default PushNotificationListener;
