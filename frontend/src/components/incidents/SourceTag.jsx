import { Tag } from "antd";
import { ApiOutlined, MailOutlined, UserOutlined } from "@ant-design/icons";

/**
 * SourceTag
 * FR4-19 — Source Tagging. Shows where an incident came from
 * (Manual / Email / Monitoring Webhook) at a glance.
 */
const SOURCE_CONFIG = {
    manual: { color: "default", label: "Manual", icon: <UserOutlined /> },
    email: { color: "blue", label: "Email", icon: <MailOutlined /> },
    webhook: { color: "purple", label: "Monitoring Webhook", icon: <ApiOutlined /> },
};

// Aliases mapping incoming backend variations to standard keys
const KEY_ALIASES = {
    "monitoring webhook": "webhook",
    "monitoring_webhook": "webhook",
    "monitoring": "webhook",
    "email intake": "email",
};

const SourceTag = ({ source }) => {
    // Normalize input string (handles lowercase, uppercase, and trimmed spaces)
    const rawKey = String(source || "manual").trim().toLowerCase();
    
    // Map alias or fallback to raw key
    const resolvedKey = KEY_ALIASES[rawKey] || rawKey;
    
    // Extract tag configuration or fallback to manual
    const config = SOURCE_CONFIG[resolvedKey] || SOURCE_CONFIG.manual;

    return (
        <Tag color={config.color} icon={config.icon}>
            {config.label}
        </Tag>
    );
};

export default SourceTag;