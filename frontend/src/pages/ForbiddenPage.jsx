import { Button, Result, Space } from "antd";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ROLE_LABELS } from "../utils/constants";

/**
 * Shown when a role guard blocks a route (FR-02).
 * Names the user's actual role, so "why can't I see this?" answers itself.
 */
const ForbiddenPage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    return (
        <Result
            status="403"
            title="Not available to your role"
            subTitle={`You are signed in as ${ROLE_LABELS[user?.role] || "a user"}, which does not have access to this screen.`}
            extra={
                <Space>
                    <Button type="primary" onClick={() => navigate("/dashboard")}>
                        Back to dashboard
                    </Button>
                    <Button onClick={() => navigate("/incidents")}>View incidents</Button>
                </Space>
            }
        />
    );
};

export default ForbiddenPage;
