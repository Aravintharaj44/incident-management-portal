const ActivityLog = require("../models/ActivityLog");
const logger = require("../utils/logger");

/**
 * Writes one audit entry (FR-07 / NFR Auditability).
 *
 * Logging must never break the operation it is describing, so failures are
 * swallowed and reported rather than thrown - an incident update that
 * succeeded should not be rolled back because the audit write hiccuped.
 */
const record = async ({
    incident,
    action,
    performedBy,
    field = null,
    oldValue = null,
    newValue = null,
    note = null,
}) => {
    try {
        return await ActivityLog.create({
            incident,
            action,
            performedBy,
            field,
            oldValue: oldValue === null ? null : String(oldValue),
            newValue: newValue === null ? null : String(newValue),
            note,
        });
    } catch (error) {
        logger.error("Failed to write activity log", error.message);
        return null;
    }
};

/** Writes several entries at once, preserving their order. */
const recordMany = async (entries) => {
    const results = [];
    for (const entry of entries) {
        // Sequential so the timeline reads in the order the changes were made.
        results.push(await record(entry));
    }
    return results;
};

const listForIncident = (incidentId, { limit = 200 } = {}) =>
    ActivityLog.find({ incident: incidentId })
        .populate("performedBy", "name email role")
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

module.exports = { record, recordMany, listForIncident };
