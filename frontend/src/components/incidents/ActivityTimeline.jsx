import { Empty, Timeline, Tooltip, Typography } from "antd";
import {
    BookOutlined,
    DisconnectOutlined,
    EditOutlined,
    FileAddOutlined,
    FileExcelOutlined,
    LinkOutlined,
    MessageOutlined,
    PlusCircleOutlined,
    RedoOutlined,
    SwapOutlined,
    UserSwitchOutlined,
} from "@ant-design/icons";
import { formatDateTime, fromNow } from "../../utils/format";

const { Text } = Typography;

const ACTION_META = {
    created: { icon: <PlusCircleOutlined />, color: "blue", label: "raised this incident" },
    status_changed: { icon: <SwapOutlined />, color: "gold", label: "changed the status" },
    priority_changed: { icon: <SwapOutlined />, color: "orange", label: "changed the priority" },
    category_changed: { icon: <SwapOutlined />, color: "purple", label: "changed the category" },
    assigned: { icon: <UserSwitchOutlined />, color: "green", label: "assigned this incident" },
    reassigned: { icon: <UserSwitchOutlined />, color: "green", label: "reassigned this incident" },
    unassigned: { icon: <UserSwitchOutlined />, color: "grey", label: "returned it to the queue" },
    department_changed: { icon: <SwapOutlined />, color: "cyan", label: "changed the department" },
    updated: { icon: <EditOutlined />, color: "blue", label: "updated the details" },
    commented: { icon: <MessageOutlined />, color: "grey", label: "commented" },
    attachment_added: { icon: <FileAddOutlined />, color: "cyan", label: "added an attachment" },
    attachment_removed: { icon: <FileExcelOutlined />, color: "red", label: "removed an attachment" },
    reopened: { icon: <RedoOutlined />, color: "red", label: "reopened this incident" },
    linked: { icon: <LinkOutlined />, color: "blue", label: "linked this incident" },
    unlinked: { icon: <DisconnectOutlined />, color: "grey", label: "removed an incident link" },
    // V4 - Problem Management (FR4)
    problem_created: { icon: <PlusCircleOutlined />, color: "blue", label: "created this problem" },
    problem_updated: { icon: <EditOutlined />, color: "blue", label: "updated the problem" },
    problem_status_changed: { icon: <SwapOutlined />, color: "gold", label: "changed the problem status" },
    problem_owner_changed: { icon: <UserSwitchOutlined />, color: "green", label: "changed the problem owner" },
    incident_problem_linked: { icon: <LinkOutlined />, color: "purple", label: "linked this to a problem" },
    incident_problem_unlinked: { icon: <DisconnectOutlined />, color: "grey", label: "removed this from a problem" },
    // V4 - Knowledge Base (FR4-11..15)
    kb_article_created: { icon: <PlusCircleOutlined />, color: "blue", label: "created a KB article" },
    kb_article_updated: { icon: <EditOutlined />, color: "blue", label: "updated a KB article" },
    kb_article_published: { icon: <BookOutlined />, color: "green", label: "published a KB article" },
    kb_article_linked: { icon: <LinkOutlined />, color: "purple", label: "linked a KB article" },
    kb_article_unlinked: { icon: <DisconnectOutlined />, color: "grey", label: "unlinked a KB article" },
    kb_article_feedback: { icon: <BookOutlined />, color: "cyan", label: "rated a KB article" },
    // V4 - Incident KB linking (FR4-14)
    incident_kb_article_linked: { icon: <LinkOutlined />, color: "purple", label: "linked a KB article" },
    incident_kb_article_unlinked: { icon: <DisconnectOutlined />, color: "grey", label: "unlinked a KB article" },
};

const ActivityTimeline = ({ activity = [] }) => {
    if (!activity.length) {
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No activity recorded yet" />;
    }

    const items = activity.map((entry) => {
        const meta = ACTION_META[entry.action] || { icon: <EditOutlined />, color: "grey", label: entry.action };
        return {
            key: entry._id,
            icon: meta.icon,
            color: meta.color,
            content: (
                <div>
                    <Text><Text strong>{entry.performedBy?.name || "Someone"}</Text> {meta.label}
                        {entry.oldValue && entry.newValue && <>{" from "}<Text code>{entry.oldValue}</Text>{" to "}<Text code>{entry.newValue}</Text></>}
                    </Text>
                    {entry.note && <div style={{ marginTop: 4 }}><Text type="secondary" style={{ fontSize: 12 }}>{entry.note}</Text></div>}
                    <Tooltip title={formatDateTime(entry.createdAt)}><Text type="secondary" style={{ fontSize: 11 }}>{fromNow(entry.createdAt)}</Text></Tooltip>
                </div>
            ),
        };
    });

    return <Timeline items={items} style={{ marginTop: 8 }} />;
};

export default ActivityTimeline;