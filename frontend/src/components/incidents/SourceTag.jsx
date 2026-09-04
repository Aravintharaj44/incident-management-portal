import { Tag } from "antd";
import { ApiOutlined, MailOutlined, UserOutlined } from "@ant-design/icons";

/**
 * SourceTag
 * FR4-19 — Source Tagging. Shows where an incident came from
 * (Manual / Email / Webhook) at a glance, built the same way as the other
 * tag components in components/common/Tags.jsx (StatusTag, PriorityTag,
 * SlaTag) — an antd <Tag>, not a new design system — without touching that
 * file directly.
 *
 * `source` is the raw lowercase value stored on the incident
 * ('manual' | 'email' | 'webhook' — matches backend/src/constants
 * INTAKE_SOURCE), same convention as incident.status / incident.priority.
 *
 * Usage:
 *   <SourceTag source={incident.intakeSource} />
 */
const SOURCE_CONFIG = {
    manual: { color: "default", label: "Manual", icon: <UserOutlined /> },
    email: { color: "blue", label: "Email", icon: <MailOutlined /> },
    webhook: { color: "purple", label: "Webhook", icon: <ApiOutlined /> },
};

const SourceTag = ({ source }) => {
    const config = SOURCE_CONFIG[source] || SOURCE_CONFIG.manual;

    return (
        <Tag color={config.color} icon={config.icon}>
            {config.label}
        </Tag>
    );
};

export default SourceTag;
