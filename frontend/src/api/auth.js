import client, { GOOGLE_AUTH_URL } from "./client";

/** FR5-13 - SSO entry point. Full-page navigation redirects the browser to Google. */
export const googleAuthStartUrl = GOOGLE_AUTH_URL;

/** Auth endpoints (FR-01). */
export const authApi = {
    register: (payload) => client.post("/auth/register", payload),

    login: (payload) => client.post("/auth/login", payload),

    getMe: () => client.get("/auth/me"),

    updateProfile: (payload) => client.patch("/auth/me", payload),

    changePassword: (payload) => client.patch("/auth/me/password", payload),
};
export const zohoAuthStartUrl = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:5000"}/auth/zoho`;
