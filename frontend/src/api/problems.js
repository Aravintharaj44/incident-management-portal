import client from "./client";

/** V4 - Problem Management (FR4-01..06). All staff-only on the server. */
const cleanParams = (params = {}) =>
    Object.entries(params).reduce((acc, [key, value]) => {
        if (value === undefined || value === null || value === "") return acc;
        if (Array.isArray(value)) {
            if (!value.length) return acc;
            acc[key] = value.join(",");
            return acc;
        }
        acc[key] = value;
        return acc;
    }, {});

export const problemApi = {
    list: (params) => client.get("/problems", { params: cleanParams(params) }),

    get: (id) => client.get(`/problems/${id}`),

    create: (payload) => client.post("/problems", payload),

    update: (id, payload) => client.patch(`/problems/${id}`, payload),

    updateStatus: (id, status) => client.patch(`/problems/${id}/status`, { status }),

    updateOwner: (id, ownerId) => client.patch(`/problems/${id}/owner`, { ownerId }),

    linkIncident: (id, incidentId) => client.post(`/problems/${id}/incidents`, { incidentId }),

    unlinkIncident: (id, incidentId) => client.delete(`/problems/${id}/incidents/${incidentId}`),

    remove: (id) => client.delete(`/problems/${id}`),

    /** FR4-02: auto-suggestion reusing the V3 correlation logic. */
    suggestFromIncident: (incidentId) =>
        client.get(`/problems/suggestions/incidents/${incidentId}`),

    getRca: (id) => client.get(`/problems/${id}/rca`),

    saveRca: (id, payload) => client.put(`/problems/${id}/rca`, payload),

    submitRca: (id) => client.post(`/problems/${id}/rca/submit`),

    reviewRca: (id, payload) => client.patch(`/problems/${id}/rca/review`, payload),

    /** FR4-14: link/unlink a KB article. */
    linkKb: (id, kbArticleId) => client.patch(`/problems/${id}/kb-article`, { kbArticleId }),

    unlinkKb: (id) => client.delete(`/problems/${id}/kb-article`),
};

export const knownErrorApi = {
    list: (params) => client.get("/known-errors", { params: cleanParams(params) }),

    get: (id) => client.get(`/known-errors/${id}`),
};
