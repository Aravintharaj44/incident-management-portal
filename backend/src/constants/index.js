/**
 * Central place for every enumerated value used across the application.
 * Keeping them here (instead of inline strings) means the API, the models and
 * the validators can never drift apart.
 */

const ROLES = {
    ADMIN: "admin",
    AGENT: "support_agent",
    USER: "user",
};

const ROLE_VALUES = Object.values(ROLES);

const STATUS = {
    NEW: "new",
    IN_PROGRESS: "in_progress",
    ON_HOLD: "on_hold",
    RESOLVED: "resolved",
    CLOSED: "closed",
};

const STATUS_VALUES = Object.values(STATUS);

/**
 * Allowed status transitions (FR-06).
 * A transition that is not listed here is rejected by the backend, so the
 * workflow cannot be bypassed by crafting a request by hand.
 */
const STATUS_TRANSITIONS = {
    [STATUS.NEW]: [STATUS.IN_PROGRESS, STATUS.ON_HOLD, STATUS.RESOLVED, STATUS.CLOSED],
    [STATUS.IN_PROGRESS]: [STATUS.ON_HOLD, STATUS.RESOLVED, STATUS.CLOSED],
    [STATUS.ON_HOLD]: [STATUS.IN_PROGRESS, STATUS.RESOLVED, STATUS.CLOSED],
    [STATUS.RESOLVED]: [STATUS.CLOSED, STATUS.IN_PROGRESS],
    [STATUS.CLOSED]: [STATUS.IN_PROGRESS],
};

/** Statuses that count as "the work is finished". */
const TERMINAL_STATUSES = [STATUS.RESOLVED, STATUS.CLOSED];

const PRIORITY = {
    LOW: "low",
    MEDIUM: "medium",
    HIGH: "high",
    CRITICAL: "critical",
};

const PRIORITY_VALUES = Object.values(PRIORITY);

/**
 * Numeric severity used for sorting and for aggregation pipelines.
 * Mirrored onto each incident as `priorityWeight`.
 */
const PRIORITY_WEIGHT = {
    [PRIORITY.LOW]: 1,
    [PRIORITY.MEDIUM]: 2,
    [PRIORITY.HIGH]: 3,
    [PRIORITY.CRITICAL]: 4,
};

/**
 * SLA targets in hours, per priority (FR-14).
 * `dueBy` on an incident is derived from these at creation time and recomputed
 * whenever the priority changes.
 */
const SLA_HOURS = {
    [PRIORITY.CRITICAL]: 4,
    [PRIORITY.HIGH]: 8,
    [PRIORITY.MEDIUM]: 24,
    [PRIORITY.LOW]: 72,
};

/** Actions written to the activity log (FR-07). */
const ACTIVITY_ACTIONS = {
    CREATED: "created",
    STATUS_CHANGED: "status_changed",
    PRIORITY_CHANGED: "priority_changed",
    CATEGORY_CHANGED: "category_changed",
    ASSIGNED: "assigned",
    UNASSIGNED: "unassigned",
    REASSIGNED: "reassigned",
    UPDATED: "updated",
    COMMENTED: "commented",
    ATTACHMENT_ADDED: "attachment_added",
    ATTACHMENT_REMOVED: "attachment_removed",
    REOPENED: "reopened",
    LINKED: "linked",
    UNLINKED: "unlinked",
};

const NOTIFICATION_TYPES = {
    INCIDENT_CREATED: "incident_created",
    INCIDENT_ASSIGNED: "incident_assigned",
    STATUS_CHANGED: "status_changed",
    COMMENT_ADDED: "comment_added",
    INCIDENT_OVERDUE: "incident_overdue",
};

/** Human-readable labels, reused by the email templates and the CSV export. */
const STATUS_LABELS = {
    [STATUS.NEW]: "New",
    [STATUS.IN_PROGRESS]: "In Progress",
    [STATUS.ON_HOLD]: "On Hold",
    [STATUS.RESOLVED]: "Resolved",
    [STATUS.CLOSED]: "Closed",
};

const PRIORITY_LABELS = {
    [PRIORITY.LOW]: "Low",
    [PRIORITY.MEDIUM]: "Medium",
    [PRIORITY.HIGH]: "High",
    [PRIORITY.CRITICAL]: "Critical",
};

const ROLE_LABELS = {
    [ROLES.ADMIN]: "Admin",
    [ROLES.AGENT]: "Support Agent",
    [ROLES.USER]: "End User",
};

module.exports = {
    ROLES,
    ROLE_VALUES,
    ROLE_LABELS,
    STATUS,
    STATUS_VALUES,
    STATUS_LABELS,
    STATUS_TRANSITIONS,
    TERMINAL_STATUSES,
    PRIORITY,
    PRIORITY_VALUES,
    PRIORITY_LABELS,
    PRIORITY_WEIGHT,
    SLA_HOURS,
    ACTIVITY_ACTIONS,
    NOTIFICATION_TYPES,
};
