const { SLA_HOURS, TERMINAL_STATUSES, PRIORITY_LABELS } = require("../constants");

/**
 * SLA helpers (FR-14).
 *
 * The targets themselves live in constants/index.js; this module turns them
 * into the derived values the API and the dashboard need.
 */

/** The Mongo filter that defines "overdue": past due and not yet finished. */
const overdueFilter = (now = new Date()) => ({
    dueBy: { $lt: now },
    status: { $nin: TERMINAL_STATUSES },
});

const isOverdue = (incident, now = new Date()) => {
    if (!incident || !incident.dueBy) return false;
    if (TERMINAL_STATUSES.includes(incident.status)) return false;
    return new Date(incident.dueBy).getTime() < now.getTime();
};

/**
 * Classifies an incident for the UI badge:
 *   met      - finished within target
 *   breached - target passed
 *   at_risk  - less than a quarter of the window left
 *   on_track - comfortably within target
 */
const slaState = (incident, now = new Date()) => {
    if (!incident || !incident.dueBy) return "none";

    const due = new Date(incident.dueBy).getTime();

    if (TERMINAL_STATUSES.includes(incident.status)) {
        const finishedAt = new Date(
            incident.resolvedAt || incident.closedAt || incident.updatedAt
        ).getTime();
        return finishedAt <= due ? "met" : "breached";
    }

    if (due < now.getTime()) return "breached";

    const windowMs = (SLA_HOURS[incident.priority] || 24) * 3600000;
    return due - now.getTime() < windowMs * 0.25 ? "at_risk" : "on_track";
};

/** The SLA table, shaped for the frontend reference screens. */
const slaTargets = () =>
    Object.entries(SLA_HOURS).map(([priority, hours]) => ({
        priority,
        label: PRIORITY_LABELS[priority],
        hours,
    }));

module.exports = { overdueFilter, isOverdue, slaState, slaTargets, SLA_HOURS };
