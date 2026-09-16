import { useState } from "react";
import { Card, Button, Tag, Flex, Typography, message } from "antd";
import { AlertOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { acknowledgeOnCallIncident } from "../../api/onCallApi";

const { Text } = Typography;

const AcknowledgePanel = ({ incident, onRefresh, user }) => {
    const [loading, setLoading] = useState(false);

    const allowedRoles = ["admin", "support_agent"];

    // Check if the current user is an admin OR the specific assigned agent
    const assignedId = incident?.assignedTo?._id || incident?.assignedTo;
    const currentUserId = user?._id || user?.id;
    const isAssignedAgentOrAdmin = user?.role === "admin" || (assignedId && currentUserId && assignedId === currentUserId);

    if (
        !user ||
        !allowedRoles.includes(user.role) ||
        !isAssignedAgentOrAdmin || // Hides panel if assigned to someone else
        !incident ||
        incident.acknowledgedAt ||
        incident.isAcknowledged
    ) {
        return null;
    }

    const handleAcknowledge = async () => {
        setLoading(true);
        try {
            await acknowledgeOnCallIncident(incident._id);
            message.success("Incident acknowledged!");
            if (onRefresh) onRefresh();
        } catch (err) {
            message.error(err.response?.data?.message || err.message || "Failed to acknowledge");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card style={{ marginBottom: 16, backgroundColor: "#fffbe6", borderColor: "#ffe58f" }}>
            <Flex justify="space-between" align="center">
                <Flex align="center" gap="small">
                    <AlertOutlined style={{ color: "#fa8c16" }} />
                    <Text strong>Escalation Level:</Text>
                    <Tag color="volcano">{incident.escalationLevel || 1}</Tag>
                    <Tag color="warning">Unacknowledged</Tag>
                </Flex>

                <Button 
                    type="primary" 
                    danger 
                    icon={<CheckCircleOutlined />} 
                    loading={loading} 
                    onClick={handleAcknowledge}
                >
                    Acknowledge Incident
                </Button>
            </Flex>
        </Card>
    );
};

export default AcknowledgePanel;