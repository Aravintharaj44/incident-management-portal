import client from "./client";

/** In-app notifications behind the header bell (FR-09). */
export const notificationApi = {
    list: (params) => client.get("/notifications", { params }),

    unreadCount: () => client.get("/notifications/unread-count"),

    markAsRead: (id) => client.patch(`/notifications/${id}/read`),

    markAllAsRead: () => client.patch("/notifications/read-all"),

    remove: (id) => client.delete(`/notifications/${id}`),
};
