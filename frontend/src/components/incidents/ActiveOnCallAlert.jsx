import { useState, useEffect } from "react";
import { Card, Button, Tag, Flex, Typography, Statistic, message } from "antd";
import { AlertOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { acknowledgeOnCallIncident } from "../../api/onCallApi";

const { Text, Title } = Typography;

const ActiveOnCallAlert = ({ incident, onAcknowledgeSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [isAcked, setIsAcked] = useState(!!incident?.acknowledgedAt);

    // Sync state whenever incident prop updates from parent re-fetch
    useEffect(() => {
        setIsAcked(!!incident?.acknowledgedAt || !!incident?.isAcknowledged);
    }, [incident]);

    // Hide component if incident is missing, closed, or acknowledged
    if (
        !incident ||
        incident.status === "Closed" ||
        incident.acknowledgedAt ||
        incident.isAcknowledged ||
        isAcked
    ) {
        return null;
    }

    const ackDeadline =
        new Date(incident.lastEscalatedAt || incident.createdAt).getTime() +
        (incident.ackWindowMinutes || 15) * 60 * 1000;
    const isPastDeadline = Date.now() >= ackDeadline;

    const handleAcknowledge = async () => {
        setLoading(true);
        try {
            await acknowledgeOnCallIncident(incident._id);
            message.success("Incident acknowledged! Escalation chain paused.");
            setIsAcked(true);
            if (onAcknowledgeSuccess) onAcknowledgeSuccess();
        } catch (err) {
            message.error(err.response?.data?.message || err.message || "Failed to acknowledge incident");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card style={{ marginBottom: 16, borderColor: "#ff4d4f", backgroundColor: "#fff2f0" }}>
            <Flex vertical gap="middle" style={{ width: "100%" }}>
                <Flex align="center" justify="space-between" style={{ width: "100%" }}>
                    <Flex align="center" gap="small">
                        <AlertOutlined style={{ fontSize: 22, color: "#ff4d4f" }} />
                        <Title level={5} style={{ margin: 0, color: "#cf1322" }}>
                            CRITICAL ON-CALL ALERT: {incident.title}
                        </Title>
                    </Flex>
                    <Tag color="error">{incident.priority || "P1 - CRITICAL"}</Tag>
                </Flex>

                <Flex justify="space-between" style={{ width: "100%" }}>
                    <div>
                        <Text type="secondary" style={{ display: "block" }}>
                            Department: <b>{incident.department?.title || incident.department?.name || "Support"}</b>
                        </Text>
                        <Text type="secondary">Source: <Tag>{incident.intakeSource || incident.source || "Manual"}</Tag></Text>
                    </div>

                    <div style={{ textAlign: "right" }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>Time to Escalate Next Level:</Text>
                        {isPastDeadline ? (
                            <Text type="danger" style={{ display: "block", fontSize: 16, fontWeight: "bold" }}>
                                Escalation Overdue
                            </Text>
                        ) : (
                            <Statistic.Timer 
                                type="countdown"
                                value={ackDeadline} 
                                format="mm:ss" 
                                onFinish={() => {
                                    if (onAcknowledgeSuccess) onAcknowledgeSuccess();
                                }}
                                styles={{ content: { color: "#cf1322", fontSize: 18, fontWeight: "bold" } }}
                            />
                        )}
                    </div>
                </Flex>

                <Button 
                    type="primary" 
                    danger 
                    icon={<CheckCircleOutlined />} 
                    loading={loading} 
                    onClick={handleAcknowledge}
                    block
                    size="large"
                >
                    Acknowledge Incident
                </Button>
            </Flex>
        </Card>
    );
};

export default ActiveOnCallAlert;