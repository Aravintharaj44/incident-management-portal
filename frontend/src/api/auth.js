import client from "./client";

/** Auth endpoints (FR-01). */
export const authApi = {
    register: (payload) => client.post("/auth/register", payload),

    login: (payload) => client.post("/auth/login", payload),

    getMe: () => client.get("/auth/me"),

    updateProfile: (payload) => client.patch("/auth/me", payload),

    changePassword: (payload) => client.patch("/auth/me/password", payload),
};
