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
    DEPARTMENT_CHANGED: "department_changed",
    UPDATED: "updated",
    COMMENTED: "commented",
    ATTACHMENT_ADDED: "attachment_added",
    ATTACHMENT_REMOVED: "attachment_removed",
    REOPENED: "reopened",
    LINKED: "linked",
    UNLINKED: "unlinked",
    // V4 - Problem Management (FR4)
    PROBLEM_CREATED: "problem_created",
    PROBLEM_UPDATED: "problem_updated",
    PROBLEM_STATUS_CHANGED: "problem_status_changed",
    PROBLEM_OWNER_CHANGED: "problem_owner_changed",
    INCIDENT_PROBLEM_LINKED: "incident_problem_linked",
    INCIDENT_PROBLEM_UNLINKED: "incident_problem_unlinked",
    // V4 - RCA Action Items (FR4-07..10)
    ACTION_ITEM_CREATED: "action_item_created",
    ACTION_ITEM_UPDATED: "action_item_updated",
    ACTION_ITEM_ASSIGNED: "action_item_assigned",
    ACTION_ITEM_STATUS_CHANGED: "action_item_status_changed",
    ACTION_ITEM_COMPLETED: "action_item_completed",
    // V4 - Knowledge Base (FR4-11..15)
    KB_ARTICLE_CREATED: "kb_article_created",
    KB_ARTICLE_UPDATED: "kb_article_updated",
    KB_ARTICLE_PUBLISHED: "kb_article_published",
    KB_ARTICLE_LINKED: "kb_article_linked",
    KB_ARTICLE_UNLINKED: "kb_article_unlinked",
    KB_ARTICLE_FEEDBACK: "kb_article_feedback",
    // V4 - Incident KB linking (incident-scoped actions)
    INCIDENT_KB_LINKED: "incident_kb_article_linked",
    INCIDENT_KB_UNLINKED: "incident_kb_article_unlinked",
};

/** Problem Management statuses (FR4-01). */
const PROBLEM_STATUS = {
    NEW: "new",
    INVESTIGATING: "investigating",
    KNOWN_ERROR: "known_error",
    RESOLVED: "resolved",
};

const PROBLEM_STATUS_VALUES = Object.values(PROBLEM_STATUS);

/**
 * Allowed Problem status transitions (FR4 status workflow). The required path
 * is New -> Investigating -> Known Error -> Resolved, plus reopen support
 * consistent with the project's workflow architecture.
 */
const PROBLEM_STATUS_TRANSITIONS = {
    [PROBLEM_STATUS.NEW]: [PROBLEM_STATUS.INVESTIGATING, PROBLEM_STATUS.KNOWN_ERROR, PROBLEM_STATUS.RESOLVED],
    [PROBLEM_STATUS.INVESTIGATING]: [PROBLEM_STATUS.KNOWN_ERROR, PROBLEM_STATUS.RESOLVED, PROBLEM_STATUS.NEW],
    [PROBLEM_STATUS.KNOWN_ERROR]: [PROBLEM_STATUS.RESOLVED, PROBLEM_STATUS.INVESTIGATING],
    [PROBLEM_STATUS.RESOLVED]: [PROBLEM_STATUS.INVESTIGATING, PROBLEM_STATUS.KNOWN_ERROR],
};

const PROBLEM_STATUS_LABELS = {
    [PROBLEM_STATUS.NEW]: "New",
    [PROBLEM_STATUS.INVESTIGATING]: "Investigating",
    [PROBLEM_STATUS.KNOWN_ERROR]: "Known Error",
    [PROBLEM_STATUS.RESOLVED]: "Resolved",
};

const NOTIFICATION_TYPES = {
    INCIDENT_CREATED: "incident_created",
    INCIDENT_ASSIGNED: "incident_assigned",
    STATUS_CHANGED: "status_changed",
    COMMENT_ADDED: "comment_added",
    INCIDENT_OVERDUE: "incident_overdue",
    // V4 - Action Item notifications (FR4-08)
    ACTION_ITEM_ASSIGNED: "action_item_assigned",
    ACTION_ITEM_DUE_SOON: "action_item_due_soon",
    ACTION_ITEM_OVERDUE: "action_item_overdue",
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

const ACTION_ITEM_STATUS = {
    OPEN:"open",
    IN_PROGRESS:"in_progress",
    DONE:"done",
    OVERDUE:"overdue",
}

const ACTION_ITEM_STATUS_VALUES = Object.values(ACTION_ITEM_STATUS);

const ACTION_ITEM_STATUS_LABELS = {
    [ACTION_ITEM_STATUS.OPEN]: "Open",
    [ACTION_ITEM_STATUS.IN_PROGRESS]: "In Progress",
    [ACTION_ITEM_STATUS.DONE]: "Done",
    [ACTION_ITEM_STATUS.OVERDUE]: "Overdue",
};

/**
 * Allowed Action Item status transitions (FR4-07 workflow). Open/In Progress
 * may be completed; an item that is done never returns to overdue. Overdue can
 * be completed, reopened to In Progress/Open, or acted on. Reopening an item
 * out of Done is supported and clears completion evidence consistently.
 */
const ACTION_ITEM_STATUS_TRANSITIONS = {
    [ACTION_ITEM_STATUS.OPEN]: [ACTION_ITEM_STATUS.IN_PROGRESS, ACTION_ITEM_STATUS.DONE],
    [ACTION_ITEM_STATUS.IN_PROGRESS]: [ACTION_ITEM_STATUS.OPEN, ACTION_ITEM_STATUS.DONE],
    [ACTION_ITEM_STATUS.DONE]: [ACTION_ITEM_STATUS.OPEN, ACTION_ITEM_STATUS.IN_PROGRESS],
    [ACTION_ITEM_STATUS.OVERDUE]: [ACTION_ITEM_STATUS.IN_PROGRESS, ACTION_ITEM_STATUS.OPEN, ACTION_ITEM_STATUS.DONE],
};

const KBA_STATUS = {
    DRAFT:"draft",
    PUBLISHED:"published",
    RETIRED:"retired",
    ARCHIVED:"archived"
};

const KBA_STATUS_VALUE = Object.values(KBA_STATUS);

// module.exports = {
//     ROLES,
//     ROLE_VALUES,
//     ROLE_LABELS,
//     STATUS,
//     STATUS_VALUES,
//     STATUS_LABELS,
//     STATUS_TRANSITIONS,
//     TERMINAL_STATUSES,
//     PRIORITY,
//     PRIORITY_VALUES,
//     PRIORITY_LABELS,
//     PRIORITY_WEIGHT,
//     SLA_HOURS,
//     ACTIVITY_ACTIONS,
//     NOTIFICATION_TYPES,
// };

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
    PROBLEM_STATUS,
    PROBLEM_STATUS_VALUES,
    PROBLEM_STATUS_LABELS,
    PROBLEM_STATUS_TRANSITIONS,
    ACTION_ITEM_STATUS,
    ACTION_ITEM_STATUS_VALUES,
    ACTION_ITEM_STATUS_LABELS,
    ACTION_ITEM_STATUS_TRANSITIONS,
    KBA_STATUS,
    KBA_STATUS_VALUE
};
