import { Avatar, Space, Tooltip, Typography } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { avatarColor, initials } from "../../utils/format";

const { Text } = Typography;

/**
 * Avatar plus name, used wherever a person appears (assignee, reporter,
 * comment author). Falls back to a neutral "Unassigned" state so an empty
 * assignee never renders as a blank cell.
 */
const UserBadge = ({ user, size = "small", showEmail = false, fallback = "Unassigned" }) => {
    if (!user) {
        return (
            <Space size={6}>
                <Avatar size={size} icon={<UserOutlined />} />
                <Text type="secondary">{fallback}</Text>
            </Space>
        );
    }

    const content = (
        <Space size={8}>
            <Avatar
                size={size}
                style={{ backgroundColor: avatarColor(user.name), flexShrink: 0 }}
            >
                {initials(user.name)}
            </Avatar>
            <span
                style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    lineHeight: 1.3,
                    minWidth: 0,
                }}
            >
                <Text ellipsis style={{ lineHeight: 1.3 }}>
                    {user.name}
                </Text>
                {showEmail && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {user.email}
                    </Text>
                )}
            </span>
        </Space>
    );

    // Without the email on show, keep it available on hover.
    return showEmail ? content : <Tooltip title={user.email}>{content}</Tooltip>;
};

export default UserBadge;
