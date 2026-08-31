import { Tag, Tooltip } from "antd";
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    ExclamationCircleOutlined,
    FireOutlined,
    PauseCircleOutlined,
    PlusCircleOutlined,
    SyncOutlined,
    WarningOutlined,
} from "@ant-design/icons";
import {
    PRIORITY,
    PRIORITY_COLORS,
    PRIORITY_LABELS,
    PROBLEM_STATUS_COLORS,
    PROBLEM_STATUS_LABELS,
    ROLE_COLORS,
    ROLE_LABELS,
    SLA_COLORS,
    SLA_LABELS,
    STATUS,
    STATUS_COLORS,
    STATUS_LABELS,
} from "../../utils/constants";
import { formatDateTime, formatDueBy } from "../../utils/format";

/**
 * The coloured badges used across the list, detail and dashboard screens.
 *
 * Grouped in one file so a status always looks the same everywhere - the same
 * colour, icon and wording, whichever screen it appears on.
 */

const STATUS_ICONS = {
    [STATUS.NEW]: <PlusCircleOutlined />,
    [STATUS.IN_PROGRESS]: <SyncOutlined spin />,
    [STATUS.ON_HOLD]: <PauseCircleOutlined />,
    [STATUS.RESOLVED]: <CheckCircleOutlined />,
    [STATUS.CLOSED]: <CheckCircleOutlined />,
};

export const StatusTag = ({ status, showIcon = true }) => (
    <Tag
        color={STATUS_COLORS[status]}
        icon={showIcon ? STATUS_ICONS[status] : null}
        style={{ margin: 0 }}
    >
        {STATUS_LABELS[status] || status}
    </Tag>
);

export const PriorityTag = ({ priority }) => (
    <Tag
        color={PRIORITY_COLORS[priority]}
        icon={priority === PRIORITY.CRITICAL ? <FireOutlined /> : null}
        style={{ margin: 0 }}
    >
        {PRIORITY_LABELS[priority] || priority}
    </Tag>
);

export const RoleTag = ({ role }) => (
    <Tag color={ROLE_COLORS[role]} style={{ margin: 0 }}>
        {ROLE_LABELS[role] || role}
    </Tag>
);

/** V4 Problem status badge (FR4-01). */
export const ProblemStatusTag = ({ status }) => (
    <Tag color={PROBLEM_STATUS_COLORS[status]} style={{ margin: 0 }}>
        {PROBLEM_STATUS_LABELS[status] || status}
    </Tag>
);

/**
 * SLA badge (FR-14).
 * Shows the remaining time, with the exact deadline in a tooltip.
 */
export const SlaTag = ({ incident }) => {
    if (!incident?.dueBy) return <span style={{ color: "#bfbfbf" }}>-</span>;

    const state = incident.slaState || "none";
    const overdue = incident.isOverdue;

    return (
        <Tooltip title={`Target resolution: ${formatDateTime(incident.dueBy)}`}>
            <Tag
                color={SLA_COLORS[state]}
                icon={
                    overdue ? (
                        <WarningOutlined />
                    ) : state === "at_risk" ? (
                        <ExclamationCircleOutlined />
                    ) : (
                        <ClockCircleOutlined />
                    )
                }
                style={{ margin: 0 }}
            >
                {overdue ? formatDueBy(incident.dueBy, true) : SLA_LABELS[state]}
            </Tag>
        </Tooltip>
    );
};
