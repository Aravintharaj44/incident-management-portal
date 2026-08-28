import axios from "axios";

/**
 * The single axios instance every API module uses.
 *
 * Having one place for the base URL, the auth header and error normalisation
 * means no screen ever has to think about tokens or response envelopes.
 */

const BASE_URL = import.meta.env.SVRVER_API_URL || "http://localhost:5000/api/v1";

export const TOKEN_KEY = "imp_token";

export const getStoredToken = () => localStorage.getItem(TOKEN_KEY);
export const setStoredToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearStoredToken = () => localStorage.removeItem(TOKEN_KEY);

const client = axios.create({
    baseURL: BASE_URL,
    timeout: 20000,
    headers: { "Content-Type": "application/json" },
});

/** Attaches the bearer token, read fresh so a re-login is picked up at once. */
client.interceptors.request.use((config) => {
    const token = getStoredToken();

    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
});

/**
 * Callback registered by AuthContext, so an expired token can bounce the user
 * to the login screen without this module importing React.
 */
let onUnauthorized = null;
export const setUnauthorizedHandler = (handler) => {
    onUnauthorized = handler;
};

client.interceptors.response.use(
    // Unwrap the { success, message, data } envelope: callers get `data`.
    (response) => response.data,

    (error) => {
        // The request never reached the server (server down, DNS, CORS).
        if (!error.response) {
            return Promise.reject({
                status: 0,
                message:
                    error.code === "ECONNABORTED"
                        ? "The server took too long to respond. Please try again."
                        : "Cannot reach the server. Check that the API is running.",
                errors: null,
            });
        }

        const { status, data } = error.response;

        // 401 means the session is gone - clear it and let the app react.
        // 403 is a permission problem for a still-valid session, so the user
        // stays signed in and simply sees the refusal.
        if (status === 401) {
            clearStoredToken();
            if (onUnauthorized) onUnauthorized();
        }

        return Promise.reject({
            status,
            message: data?.message || "Something went wrong. Please try again.",
            errors: data?.errors || null,
        });
    }
);

export default client;
