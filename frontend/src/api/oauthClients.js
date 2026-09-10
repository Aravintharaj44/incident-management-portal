import client from "./client";

/** FR5-10 - OAuth client management (admin-only). */
export const oauthClientsApi = {
    list: (params) => client.get("/oauth/clients", { params }),

    get: (id) => client.get(`/oauth/clients/${id}`),

    create: (payload) => client.post("/oauth/clients", payload),

    update: (id, payload) => client.patch(`/oauth/clients/${id}`, payload),

    revoke: (id) => client.post(`/oauth/clients/${id}/revoke`),
};
