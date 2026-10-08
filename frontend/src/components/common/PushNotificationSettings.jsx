import { useCallback, useEffect, useState } from "react";
import { Alert, App, Button, Space, Tag, Typography } from "antd";
import { BellOutlined, BellFilled } from "@ant-design/icons";
import {
    PUSH_STATUS,
    disablePush,
    enablePush,
    getPushStatus,
} from "../../services/pushNotifications";

const { Text, Paragraph } = Typography;

const STATUS_META = {
    [PUSH_STATUS.ENABLED]: { label: "Enabled", color: "success" },
    [PUSH_STATUS.DISABLED]: { label: "Disabled", color: "default" },
    [PUSH_STATUS.DENIED]: { label: "Permission denied", color: "error" },
    [PUSH_STATUS.UNSUPPORTED]: { label: "Not supported", color: "default" },
    [PUSH_STATUS.NOT_CONFIGURED]: { label: "Not configured", color: "warning" },
    [PUSH_STATUS.ERROR]: { label: "Error", color: "error" },
};

/**
 * "Desktop push notifications" card for the profile page.
 *
 * Permission is only requested from the explicit Enable click - never on page
 * load - and the state text explains why permission is needed and what to do
 * when it was denied.
 */
const PushNotificationSettings = () => {
    const { message } = App.useApp();
    const [status, setStatus] = useState(null);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(
        () => getPushStatus().then(setStatus).catch(() => {}),
        []
    );

    useEffect(() => {
        let active = true;
        getPushStatus()
            .then((next) => {
                if (active) setStatus(next);
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, []);

    const handleEnable = async () => {
        setBusy(true);
        try {
            const result = await enablePush();

            if (result.ok) {
                message.success("Desktop notifications enabled");
            } else if (result.code === PUSH_STATUS.DENIED) {
                message.error(
                    "Notification permission was denied. Allow notifications for this site in your browser settings and try again."
                );
            } else if (result.code === PUSH_STATUS.NOT_CONFIGURED) {
                message.error("Push notifications are not configured on this deployment.");
            } else {
                message.error("Could not enable desktop notifications. Please try again.");
            }
        } finally {
            setBusy(false);
            await refresh();
        }
    };

    const handleDisable = async () => {
        setBusy(true);
        try {
            await disablePush();
            message.success("Desktop notifications disabled");
        } finally {
            setBusy(false);
            await refresh();
        }
    };

    const meta = status ? STATUS_META[status.status] : null;

    return (
        <>
            <Space
                style={{ width: "100%", justifyContent: "space-between", flexWrap: "wrap" }}
            >
                <Space>
                    <Text>Desktop push notifications</Text>
                    {meta ? <Tag color={meta.color}>{meta.label}</Tag> : null}
                </Space>

                {status?.status === PUSH_STATUS.ENABLED ? (
                    <Button
                        icon={<BellOutlined />}
                        loading={busy}
                        onClick={handleDisable}
                    >
                        Disable notifications
                    </Button>
                ) : (
                    <Button
                        type="primary"
                        icon={<BellFilled />}
                        loading={busy}
                        disabled={
                            !status ||
                            status.status === PUSH_STATUS.UNSUPPORTED ||
                            status.status === PUSH_STATUS.NOT_CONFIGURED
                        }
                        onClick={handleEnable}
                    >
                        Enable notifications
                    </Button>
                )}
            </Space>

            <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
                Get a browser notification for incident updates (assignment, status
                changes, comments, escalations) even when the portal tab is not
                active. Your browser will ask for permission when you enable this.
            </Paragraph>

            {status && status.status === PUSH_STATUS.DENIED ? (
                <Alert
                    style={{ marginTop: 12 }}
                    type="warning"
                    showIcon
                    message="Notifications are blocked for this site"
                    description="Open your browser's site settings for this portal, allow notifications, then reload the page."
                />
            ) : null}

            {status && status.status === PUSH_STATUS.UNSUPPORTED ? (
                <Alert
                    style={{ marginTop: 12 }}
                    type="info"
                    showIcon
                    message="Push notifications are not available in this browser"
                    description="Use a recent version of Chrome, Edge or Firefox over HTTPS to receive desktop notifications."
                />
            ) : null}

            {status && status.status === PUSH_STATUS.NOT_CONFIGURED ? (
                <Alert
                    style={{ marginTop: 12 }}
                    type="info"
                    showIcon
                    message="Push notifications are not configured"
                    description="This deployment does not have Firebase Cloud Messaging configured. All other portal features work as usual."
                />
            ) : null}
        </>
    );
};

export default PushNotificationSettings;
