/* Firebase Cloud Messaging web push service worker.
 *
 * Handles background push: displays the notification and navigates to the
 * incident on click. Deliberately uses only the public Web Push payload -
 * no Firebase configuration, service-account material or secrets live here.
 *
 * Notifications are displayed as browser notifications whether the portal is
 * in the foreground or background. Foreground messages are not duplicated as
 * in-app toast notifications.
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
        self.registration.showNotification(title, {
            body: notification.body || "",
            icon: notification.icon || DEFAULT_ICON,
            data: { ...data, url: targetUrl || self.location.origin },
        })
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
