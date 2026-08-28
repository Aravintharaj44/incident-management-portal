import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/**
 * Restricts a branch of the router to particular roles (FR-02).
 *
 * This is a usability guard, not a security control - the API enforces the
 * same rules independently, so hiding a screen here never becomes the only
 * thing standing between a user and an action they may not perform.
 */
const RoleRoute = ({ allowedRoles = [] }) => {
    const { user } = useAuth();

    if (!user) return <Navigate to="/login" replace />;

    if (!allowedRoles.includes(user.role)) {
        return <Navigate to="/forbidden" replace />;
    }

    return <Outlet />;
};

export default RoleRoute;
