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

/* ---------------------------------------------------------------------------
 * V4 - Problem Management (FR4-01..06). Mirrors backend PROBLEM_STATUS.
 * ------------------------------------------------------------------------- */

export const PROBLEM_STATUS = {
    NEW: "new",
    INVESTIGATING: "investigating",
    KNOWN_ERROR: "known_error",
    RESOLVED: "resolved",
};

export const PROBLEM_STATUS_LABELS = {
    [PROBLEM_STATUS.NEW]: "New",
    [PROBLEM_STATUS.INVESTIGATING]: "Investigating",
    [PROBLEM_STATUS.KNOWN_ERROR]: "Known Error",
    [PROBLEM_STATUS.RESOLVED]: "Resolved",
};

export const PROBLEM_STATUS_COLORS = {
    [PROBLEM_STATUS.NEW]: "blue",
    [PROBLEM_STATUS.INVESTIGATING]: "gold",
    [PROBLEM_STATUS.KNOWN_ERROR]: "purple",
    [PROBLEM_STATUS.RESOLVED]: "green",
};

/** Order for filters/dropdowns. */
export const PROBLEM_STATUS_ORDER = [
    PROBLEM_STATUS.NEW,
    PROBLEM_STATUS.INVESTIGATING,
    PROBLEM_STATUS.KNOWN_ERROR,
    PROBLEM_STATUS.RESOLVED,
];

export const PROBLEM_STATUS_OPTIONS = asOptions(PROBLEM_STATUS_LABELS, PROBLEM_STATUS_ORDER);

/** Mirrors PROBLEM_STATUS_TRANSITIONS on the server, to grey out impossible moves. */
export const PROBLEM_STATUS_TRANSITIONS = {
    [PROBLEM_STATUS.NEW]: [
        PROBLEM_STATUS.INVESTIGATING,
        PROBLEM_STATUS.KNOWN_ERROR,
        PROBLEM_STATUS.RESOLVED,
    ],
    [PROBLEM_STATUS.INVESTIGATING]: [
        PROBLEM_STATUS.KNOWN_ERROR,
        PROBLEM_STATUS.RESOLVED,
        PROBLEM_STATUS.NEW,
    ],
    [PROBLEM_STATUS.KNOWN_ERROR]: [PROBLEM_STATUS.RESOLVED, PROBLEM_STATUS.INVESTIGATING],
    [PROBLEM_STATUS.RESOLVED]: [PROBLEM_STATUS.INVESTIGATING, PROBLEM_STATUS.KNOWN_ERROR],
};

export const PROBLEM_STATUS_TERMINAL = [PROBLEM_STATUS.RESOLVED];

/* ---------------------------------------------------------------------------
 * V4 - RCA Action Items (FR4-07..10). Mirrors backend ACTION_ITEM_STATUS.
 * ------------------------------------------------------------------------- */

export const ACTION_ITEM_STATUS = {
    OPEN: "open",
    IN_PROGRESS: "in_progress",
    DONE: "done",
    OVERDUE: "overdue",
};

export const ACTION_ITEM_STATUS_LABELS = {
    [ACTION_ITEM_STATUS.OPEN]: "Open",
    [ACTION_ITEM_STATUS.IN_PROGRESS]: "In Progress",
    [ACTION_ITEM_STATUS.DONE]: "Done",
    [ACTION_ITEM_STATUS.OVERDUE]: "Overdue",
};

export const ACTION_ITEM_STATUS_COLORS = {
    [ACTION_ITEM_STATUS.OPEN]: "blue",
    [ACTION_ITEM_STATUS.IN_PROGRESS]: "gold",
    [ACTION_ITEM_STATUS.DONE]: "green",
    [ACTION_ITEM_STATUS.OVERDUE]: "red",
};

/** Order for filters/dropdowns. */
export const ACTION_ITEM_STATUS_ORDER = [
    ACTION_ITEM_STATUS.OPEN,
    ACTION_ITEM_STATUS.IN_PROGRESS,
    ACTION_ITEM_STATUS.DONE,
    ACTION_ITEM_STATUS.OVERDUE,
];

export const ACTION_ITEM_STATUS_OPTIONS = asOptions(
    ACTION_ITEM_STATUS_LABELS,
    ACTION_ITEM_STATUS_ORDER
);

/** Mirrors ACTION_ITEM_STATUS_TRANSITIONS on the server. */
export const ACTION_ITEM_STATUS_TRANSITIONS = {
    [ACTION_ITEM_STATUS.OPEN]: [
        ACTION_ITEM_STATUS.IN_PROGRESS,
        ACTION_ITEM_STATUS.DONE,
    ],
    [ACTION_ITEM_STATUS.IN_PROGRESS]: [
        ACTION_ITEM_STATUS.OPEN,
        ACTION_ITEM_STATUS.DONE,
    ],
    [ACTION_ITEM_STATUS.DONE]: [
        ACTION_ITEM_STATUS.OPEN,
        ACTION_ITEM_STATUS.IN_PROGRESS,
    ],
    [ACTION_ITEM_STATUS.OVERDUE]: [
        ACTION_ITEM_STATUS.IN_PROGRESS,
        ACTION_ITEM_STATUS.OPEN,
        ACTION_ITEM_STATUS.DONE,
    ],
};

/* ---------------------------------------------------------------------------
 * V4 - Knowledge Base (FR4-11..15). Mirrors backend KBA_STATUS.
 * ------------------------------------------------------------------------- */

export const KBA_STATUS = {
    DRAFT: "draft",
    PUBLISHED: "published",
    ARCHIVED: "archived",
};

export const KBA_STATUS_LABELS = {
    [KBA_STATUS.DRAFT]: "Draft",
    [KBA_STATUS.PUBLISHED]: "Published",
    [KBA_STATUS.ARCHIVED]: "Archived",
};

export const KBA_STATUS_COLORS = {
    [KBA_STATUS.DRAFT]: "orange",
    [KBA_STATUS.PUBLISHED]: "green",
    [KBA_STATUS.ARCHIVED]: "default",
};

export const KBA_STATUS_ORDER = [
    KBA_STATUS.DRAFT,
    KBA_STATUS.PUBLISHED,
    KBA_STATUS.ARCHIVED,
];

export const KBA_STATUS_OPTIONS = asOptions(KBA_STATUS_LABELS, KBA_STATUS_ORDER);
