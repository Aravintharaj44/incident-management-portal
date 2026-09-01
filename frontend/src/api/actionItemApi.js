import client from "./client";

/**
 * RCA Action Items (FR4-07..10). One resource with an RCA reference (which
 * itself anchors to an incident or a problem), so these endpoints are shared
 * by both the incident- and problem-scoped RCA panels.
 */
export const actionItemApi = {
    list: (params = {}) => client.get("/action-items", { params }),

    get: (id) => client.get(`/action-items/${id}`),

    create: (payload) => client.post("/action-items", payload),

    update: (id, payload) => client.patch(`/action-items/${id}`, payload),

    changeStatus: (id, payload) => client.patch(`/action-items/${id}/status`, payload),

    changeOwner: (id, payload) => client.patch(`/action-items/${id}/owner`, payload),

    remove: (id) => client.delete(`/action-items/${id}`),
};

/** Staff-only dashboard widget data (FR4-09). */
export const actionItemDashboardApi = {
    summary: () => client.get("/dashboard/action-items"),
};