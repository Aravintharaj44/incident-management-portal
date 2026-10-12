import { useEffect } from "react";
import { isFirebaseConfigured } from "../../services/firebase";
import { syncPushToken } from "../../services/pushNotifications";

/** Keeps this browser's FCM token registered with the backend after login. */
const PushNotificationListener = () => {
    useEffect(() => {
        if (isFirebaseConfigured()) syncPushToken();
    }, []);

    return null;
};

export default PushNotificationListener;
