import { useCallback, useEffect, useMemo, useState } from "react";
import { authApi } from "../api";
import {
    clearStoredToken,
    getStoredToken,
    setStoredToken,
    setUnauthorizedHandler,
} from "../api/client";
import { ROLES } from "../utils/constants";
import { AuthContext } from "./authContextObject";

/**
 * Holds the signed-in user for the whole app.
 *
 * The token lives in localStorage so a refresh keeps the session, but the user
 * object is always re-fetched from /auth/me on boot rather than being trusted
 * from storage - the server decides who someone is, and a role that changed
 * since the last visit takes effect immediately.
 */

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    // `true` until the boot-time session check finishes, so the router does not
    // flash the login page at an already-signed-in user.
    const [isLoading, setIsLoading] = useState(true);

    const logout = useCallback(() => {
        clearStoredToken();
        setUser(null);
    }, []);

    // Lets the axios interceptor drop the session on a 401 from any request.
    useEffect(() => {
        setUnauthorizedHandler(() => setUser(null));
        return () => setUnauthorizedHandler(null);
    }, []);

    useEffect(() => {
        const restoreSession = async () => {
            if (!getStoredToken()) {
                setIsLoading(false);
                return;
            }

            try {
                const response = await authApi.getMe();
                setUser(response.data.user);
            } catch {
                // Expired or tampered token - start clean.
                clearStoredToken();
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        };

        restoreSession();
    }, []);

    const login = useCallback(async (credentials) => {
        const response = await authApi.login(credentials);
        const { token, user: loggedIn } = response.data;

        setStoredToken(token);
        setUser(loggedIn);

        return loggedIn;
    }, []);

    const register = useCallback(async (payload) => {
        const response = await authApi.register(payload);
        const { token, user: registered } = response.data;

        setStoredToken(token);
        setUser(registered);

        return registered;
    }, []);

    const updateProfile = useCallback(async (payload) => {
        const response = await authApi.updateProfile(payload);
        setUser(response.data.user);
        return response.data.user;
    }, []);

    const changePassword = useCallback(async (payload) => {
        const response = await authApi.changePassword(payload);
        // The server issues a fresh token so the session survives the change.
        if (response.data?.token) setStoredToken(response.data.token);
    }, []);

    const value = useMemo(
        () => ({
            user,
            isLoading,
            isAuthenticated: Boolean(user),
            isAdmin: user?.role === ROLES.ADMIN,
            isAgent: user?.role === ROLES.AGENT,
            isEndUser: user?.role === ROLES.USER,
            // Convenience for the many "staff only" bits of UI.
            isStaff: user?.role === ROLES.ADMIN || user?.role === ROLES.AGENT,
            login,
            register,
            logout,
            updateProfile,
            changePassword,
        }),
        [user, isLoading, login, register, logout, updateProfile, changePassword]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
