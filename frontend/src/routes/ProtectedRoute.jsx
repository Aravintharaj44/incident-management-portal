import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Spin } from "antd";
import { useAuth } from "../hooks/useAuth";

/**
 * Gate for every authenticated screen.
 *
 * While the boot-time session check is running we show a spinner rather than
 * redirecting, otherwise a refresh would bounce a signed-in user to the login
 * page for a moment before restoring them.
 */
const ProtectedRoute = () => {
    const { isAuthenticated, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return (
            <div
                style={{
                    minHeight: "100vh",
                    display: "grid",
                    placeItems: "center",
                }}
            >
                <Spin size="large" description="Loading your session..." fullscreen />
            </div>
        );
    }

    if (!isAuthenticated) {
        // Remember where they were headed so login can send them back.
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
