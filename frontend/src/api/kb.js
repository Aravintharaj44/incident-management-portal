import client from "./client";

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

export const kbApi = {
    list: (params) => client.get("/kba", { params: cleanParams(params) }),

    get: (id) => client.get(`/kba/${id}`),

    create: (payload) => client.post("/kba", payload),

    update: (id, payload) => client.patch(`/kba/${id}`, payload),

    remove: (id) => client.delete(`/kba/${id}`),

    feedback: (id, value) => client.post(`/kba/${id}/feedback`, { value }),

    suggest: (params) =>
        client.get("/kba/suggestions", { params: cleanParams(params) }),

    /** Link a KB article to an incident. */
    linkIncident: (kbArticleId, incidentId) =>
        client.post(`/incidents/${incidentId}/kb-articles`, { kbArticleId }),

    /** Link a KB article to a problem. */
    linkProblem: (kbArticleId, problemId) =>
        client.patch(`/problems/${problemId}/kb-article`, { kbArticleId }),
};
