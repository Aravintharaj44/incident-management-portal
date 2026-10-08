/* Firebase Cloud Messaging web push service worker.
 *
 * Handles background push: displays the notification and navigates to the
 * incident on click. Deliberately uses only the public Web Push payload -
 * no Firebase configuration, service-account material or secrets live here.
 *
 * Foreground/background routing:
 * - If a visible app window exists, the payload is forwarded to it via
 *   postMessage and NO system notification is shown (the app displays its own
 *   in-app notification instead - no duplicate).
 * - Otherwise the notification is shown here. The `push` handler always calls
 *   showNotification(); per the Push API spec the browser then does NOT also
 *   auto-display the payload notification, so there is never a duplicate.
 */

const DEFAULT_ICON = "/favicon.svg";

const buildTargetUrl = (data) => {
    if (!data) return null;
    if (data.url) return data.url;
    if (data.incidentId) return `${self.location.origin}/incidents/${data.incidentId}`;
    return null;
};

self.addEventListener("push", (event) => {
    if (!event.data) return;

    let payload = {};
    try {
        payload = event.data.json() || {};
    } catch (error) {
        payload = {
            notification: { title: "Incident Management Portal", body: event.data.text() },
        };
    }

    const notification = payload.notification || {};
    const data = payload.data || {};
    const title = notification.title || "Incident Management Portal";
    const targetUrl = buildTargetUrl(data);

    event.waitUntil(
        (async () => {
            const windowClients = await self.clients.matchAll({
                type: "window",
                includeUncontrolled: true,
            });

            const visibleClient = windowClients.find(
                (client) => client.visibilityState === "visible" || client.focused
            );

            if (visibleClient) {
                // App is open and visible - hand the message to the page so it
                // can show its in-app notification instead of a system popup.
                visibleClient.postMessage({ type: "FCM_PUSH_FOREGROUND", payload });
                return;
            }

            await self.registration.showNotification(title, {
                body: notification.body || "",
                icon: notification.icon || DEFAULT_ICON,
                data: { ...data, url: targetUrl || self.location.origin },
            });
        })()
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    const data = event.notification.data || {};
    const target = data.url || self.location.origin;

    event.waitUntil(
        (async () => {
            const clients = await self.clients.matchAll({
                type: "window",
                includeUncontrolled: true,
            });

            for (const client of clients) {
                if (client.url.startsWith(self.location.origin) && "focus" in client) {
                    await client.focus();
                    try {
                        await client.navigate(target);
                    } catch (error) {
                        // Cross-origin or restricted client - the openWindow
                        // fallback below keeps the click useful.
                    }
                    return;
                }
            }

            await self.clients.openWindow(target);
        })()
    );
});
