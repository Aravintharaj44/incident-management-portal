/**
 * UI-side mirrors of the backend enums.
 *
 * The values themselves must match backend/src/constants/index.js exactly -
 * these add only the presentation concerns (colour, icon, ordering) that the
 * API has no opinion about.
 */

export const ROLES = {
    ADMIN: "admin",
    AGENT: "support_agent",
    USER: "user",
};

export const ROLE_LABELS = {
    [ROLES.ADMIN]: "Admin",
    [ROLES.AGENT]: "Support Agent",
    [ROLES.USER]: "End User",
};

export const ROLE_COLORS = {
    [ROLES.ADMIN]: "purple",
    [ROLES.AGENT]: "blue",
    [ROLES.USER]: "default",
};

export const STATUS = {
    NEW: "new",
    IN_PROGRESS: "in_progress",
    ON_HOLD: "on_hold",
    RESOLVED: "resolved",
    CLOSED: "closed",
};

export const STATUS_LABELS = {
    [STATUS.NEW]: "New",
    [STATUS.IN_PROGRESS]: "In Progress",
    [STATUS.ON_HOLD]: "On Hold",
    [STATUS.RESOLVED]: "Resolved",
    [STATUS.CLOSED]: "Closed",
};

export const STATUS_COLORS = {
    [STATUS.NEW]: "blue",
    [STATUS.IN_PROGRESS]: "gold",
    [STATUS.ON_HOLD]: "orange",
    [STATUS.RESOLVED]: "green",
    [STATUS.CLOSED]: "default",
};

/** Hex values for the charts, which cannot use antd's named tag colours. */
export const STATUS_HEX = {
    [STATUS.NEW]: "#1677ff",
    [STATUS.IN_PROGRESS]: "#faad14",
    [STATUS.ON_HOLD]: "#fa8c16",
    [STATUS.RESOLVED]: "#52c41a",
    [STATUS.CLOSED]: "#8c8c8c",
};

/** Mirrors STATUS_TRANSITIONS on the server, to grey out impossible actions. */
export const STATUS_TRANSITIONS = {
    [STATUS.NEW]: [STATUS.IN_PROGRESS, STATUS.ON_HOLD, STATUS.RESOLVED, STATUS.CLOSED],
    [STATUS.IN_PROGRESS]: [STATUS.ON_HOLD, STATUS.RESOLVED, STATUS.CLOSED],
    [STATUS.ON_HOLD]: [STATUS.IN_PROGRESS, STATUS.RESOLVED, STATUS.CLOSED],
    [STATUS.RESOLVED]: [STATUS.CLOSED, STATUS.IN_PROGRESS],
    [STATUS.CLOSED]: [STATUS.IN_PROGRESS],
};

export const TERMINAL_STATUSES = [STATUS.RESOLVED, STATUS.CLOSED];

export const PRIORITY = {
    LOW: "low",
    MEDIUM: "medium",
    HIGH: "high",
    CRITICAL: "critical",
};

export const PRIORITY_LABELS = {
    [PRIORITY.LOW]: "Low",
    [PRIORITY.MEDIUM]: "Medium",
    [PRIORITY.HIGH]: "High",
    [PRIORITY.CRITICAL]: "Critical",
};

export const PRIORITY_COLORS = {
    [PRIORITY.LOW]: "default",
    [PRIORITY.MEDIUM]: "blue",
    [PRIORITY.HIGH]: "orange",
    [PRIORITY.CRITICAL]: "red",
};

export const PRIORITY_HEX = {
    [PRIORITY.LOW]: "#8c8c8c",
    [PRIORITY.MEDIUM]: "#1677ff",
    [PRIORITY.HIGH]: "#fa8c16",
    [PRIORITY.CRITICAL]: "#ff4d4f",
};

/** Severity order, used wherever a priority list is rendered. */
export const PRIORITY_ORDER = [
    PRIORITY.CRITICAL,
    PRIORITY.HIGH,
    PRIORITY.MEDIUM,
    PRIORITY.LOW,
];

export const SLA_LABELS = {
    met: "Met",
    breached: "Breached",
    at_risk: "At risk",
    on_track: "On track",
    none: "-",
};

export const SLA_COLORS = {
    met: "green",
    breached: "red",
    at_risk: "orange",
    on_track: "blue",
    none: "default",
};

/** Options ready to drop into an antd <Select />. */
export const asOptions = (labels, order) =>
    (order || Object.keys(labels)).map((value) => ({ value, label: labels[value] }));

export const STATUS_OPTIONS = asOptions(STATUS_LABELS);
export const PRIORITY_OPTIONS = asOptions(PRIORITY_LABELS, PRIORITY_ORDER);
export const ROLE_OPTIONS = asOptions(ROLE_LABELS);
