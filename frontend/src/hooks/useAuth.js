import { useContext } from "react";
import { AuthContext } from "../context/authContextObject";

/**
 * Access to the signed-in user.
 * Throws when used outside the provider, which turns a silent `undefined`
 * bug into an obvious error at the point of misuse.
 */
export const useAuth = () => {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error("useAuth must be used inside an <AuthProvider>");
    }

    return context;
};
