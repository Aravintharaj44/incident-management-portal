import client from "./client";

/** User administration (FR-13). Most of these are admin-only on the server. */
export const userApi = {
    list: (params) => client.get("/users", { params }),

    /** Fills the "Assign to" dropdown - available to admins and agents. */
    assignable: () => client.get("/users/assignable"),

    get: (id) => client.get(`/users/${id}`),

    create: (payload) => client.post("/users", payload),

    update: (id, payload) => client.patch(`/users/${id}`, payload),

    resetPassword: (id, newPassword) =>
        client.patch(`/users/${id}/password`, { newPassword }),

    deactivate: (id) => client.delete(`/users/${id}`),
};
