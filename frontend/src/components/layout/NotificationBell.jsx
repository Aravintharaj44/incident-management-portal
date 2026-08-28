import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { App, Badge, Button, Dropdown, Empty, Spin, Typography } from "antd";
import { BellOutlined, CheckOutlined } from "@ant-design/icons";
import { notificationApi } from "../../api";
import { fromNow } from "../../utils/format";

const { Text } = Typography;

/** How often the unread badge re-checks the server. */
const POLL_INTERVAL_MS = 60000;

/**
 * Header bell for in-app notifications (FR-09).
 *
 * V1 polls on a timer: it is simple, needs no extra infrastructure, and one
 * lightweight count request a minute is well within budget. Swapping to
 * websockets is a V2 concern, and only this component would change.
 */
const NotificationBell = () => {
    const navigate = useNavigate();
    const { message } = App.useApp();

    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);

    const refreshCount = useCallback(async () => {
        try {
            const response = await notificationApi.unreadCount();
            setUnreadCount(response.data.unreadCount);
        } catch {
            // A failed poll is not worth interrupting the user over - the next
            // tick will pick it up.
        }
    }, []);

    useEffect(() => {
        // The state updates here happen after an await, so this is not the
        // synchronous cascade the rule guards against - it cannot see past
        // the async boundary.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        refreshCount();

        const timer = setInterval(refreshCount, POLL_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [refreshCount]);

    // The list itself is only fetched when the dropdown is actually opened.
    const loadNotifications = useCallback(async () => {
        setLoading(true);

        try {
            const response = await notificationApi.list({ limit: 10 });
            setNotifications(response.data.notifications);
            setUnreadCount(response.data.unreadCount);
        } catch (error) {
            message.error(error.message);
        } finally {
            setLoading(false);
        }
    }, [message]);

    const handleOpenChange = (nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) loadNotifications();
    };

    const handleClick = async (notification) => {
        setOpen(false);

        if (!notification.isRead) {
            try {
                await notificationApi.markAsRead(notification._id);
                setUnreadCount((count) => Math.max(0, count - 1));
            } catch {
                // Navigation still matters more than the read flag.
            }
        }

        if (notification.incident) {
            navigate(`/incidents/${notification.incident._id}`);
        }
    };

    const handleMarkAll = async (event) => {
        event.stopPropagation();

        try {
            await notificationApi.markAllAsRead();
            setNotifications((items) => items.map((item) => ({ ...item, isRead: true })));
            setUnreadCount(0);
            message.success("All notifications marked as read");
        } catch (error) {
            message.error(error.message);
        }
    };

    /**
     * Rendered as plain markup rather than antd's <List>, which is deprecated
     * in v6 and slated for removal - and which gave no clean way to apply the
     * unread accent anyway.
     */
    const renderRow = (item) => (
        <div
            key={item._id}
            role="button"
            tabIndex={0}
            onClick={() => handleClick(item)}
            onKeyDown={(event) => {
                if (event.key === "Enter") handleClick(item);
            }}
            style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                padding: "10px 16px",
                cursor: "pointer",
                borderBottom: "1px solid #f5f5f5",
                lineHeight: 1.4,
                // Unread rows get a tint and a left accent so they are
                // scannable at a glance.
                background: item.isRead ? "transparent" : "#f0f7ff",
                borderLeft: item.isRead ? "3px solid transparent" : "3px solid #1677ff",
            }}
        >
            <Text strong={!item.isRead} style={{ fontSize: 13 }}>
                {item.title}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                {item.body}
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
                {fromNow(item.createdAt)}
            </Text>
        </div>
    );

    const panel = (
        <div
            style={{
                width: 340,
                background: "#fff",
                borderRadius: 8,
                boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
                overflow: "hidden",
            }}
        >
            <div
                style={{
                    padding: "10px 16px",
                    borderBottom: "1px solid #f0f0f0",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <Text strong>Notifications</Text>
                {unreadCount > 0 && (
                    <Button
                        type="link"
                        size="small"
                        icon={<CheckOutlined />}
                        onClick={handleMarkAll}
                    >
                        Mark all read
                    </Button>
                )}
            </div>

            <div style={{ maxHeight: 380, overflowY: "auto" }}>
                {loading ? (
                    <div style={{ padding: 32, textAlign: "center" }}>
                        <Spin />
                    </div>
                ) : notifications.length === 0 ? (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="You are all caught up"
                        style={{ padding: 24 }}
                    />
                ) : (
                    notifications.map(renderRow)
                )}
            </div>
        </div>
    );

    return (
        <Dropdown
            open={open}
            onOpenChange={handleOpenChange}
            trigger={["click"]}
            placement="bottomRight"
            popupRender={() => panel}
        >
            <Badge count={unreadCount} size="small" offset={[-2, 2]}>
                <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} />
            </Badge>
        </Dropdown>
    );
};

export default NotificationBell;
