const Notification = require("../models/Notification");
const User = require("../models/User");
const logger = require("../utils/logger");
const emailService = require("./emailService");
const { NOTIFICATION_TYPES, STATUS_LABELS } = require("../constants");
const { idOf } = require("./permissionService");
const PostResolutionSurvey = require("../models/PostResolutionSurvey");
const {
    createPostResolutionSurvey,
} = require("./surveyService");
/**
 * Fan-out for FR-09: writes the in-app notification row and fires the matching
 * email.
 *
 * Both halves are best-effort - a failure here is logged but never propagated,
 * because notifying about an action must not be able to undo the action.
 */

/** Removes duplicates and the actor themselves (nobody notifies themselves). */
const resolveRecipients = (candidates, actorId) => {
    const seen = new Set();
    const recipients = [];

    for (const candidate of candidates) {
        if (!candidate) continue;

        const id = idOf(candidate);
        if (!id || id === idOf(actorId) || seen.has(id)) continue;

        seen.add(id);
        recipients.push(candidate);
    }

    return recipients;
};

/** Loads full user documents for ids that came through unpopulated. */
const hydrate = async (recipients) => {
    const needsLoad = recipients.filter((r) => !r.email);
    const loaded = needsLoad.length
        ? await User.find({ _id: { $in: needsLoad.map(idOf) }, isActive: true }).lean()
        : [];

    const byId = new Map(loaded.map((user) => [idOf(user._id), user]));

    return recipients
        .map((r) => (r.email ? r : byId.get(idOf(r))))
        .filter((r) => r && r.email && r.isActive !== false);
};

const createInApp = async (recipients, payload) => {
    if (!recipients.length) return [];

    return Notification.insertMany(
        recipients.map((recipient) => ({ ...payload, recipient: idOf(recipient) }))
    );
};

const notifyIncidentCreated = async ({ incident, reporter, recipients }) => {
    try {
        const targets = await hydrate(resolveRecipients(recipients, reporter));
        if (!targets.length) return;

        await createInApp(targets, {
            type: NOTIFICATION_TYPES.INCIDENT_CREATED,
            title: `New incident ${incident.incidentNumber}`,
            body: incident.title,
            incident: incident._id,
        });

        await Promise.all(
            targets.map((to) =>
                emailService.sendIncidentCreated({ to: to.email, incident, reporter })
            )
        );
    } catch (error) {
        logger.error("notifyIncidentCreated failed", error.message);
    }
};

const notifyIncidentAssigned = async ({ incident, assignee, assignedBy }) => {
    try {
        const targets = await hydrate(resolveRecipients([assignee], assignedBy));
        if (!targets.length) return;

        await createInApp(targets, {
            type: NOTIFICATION_TYPES.INCIDENT_ASSIGNED,
            title: `${incident.incidentNumber} assigned to you`,
            body: incident.title,
            incident: incident._id,
        });

        await Promise.all(
            targets.map((to) =>
                emailService.sendIncidentAssigned({ to: to.email, incident, assignedBy })
            )
        );
    } catch (error) {
        logger.error("notifyIncidentAssigned failed", error.message);
    }
};

const notifyStatusChanged = async ({ incident, oldStatus, newStatus, changedBy }) => {
    try {
        // The reporter and the current owner both care about a status change.
        const targets = await hydrate(
            resolveRecipients([incident.reportedBy, incident.assignedTo], changedBy)
        );
        if (!targets.length) return;

        await createInApp(targets, {
            type: NOTIFICATION_TYPES.STATUS_CHANGED,
            title: `${incident.incidentNumber} is now ${STATUS_LABELS[newStatus]}`,
            body: incident.title,
            incident: incident._id,
        });

        await Promise.all(
            targets.map((to) =>
                emailService.sendStatusChanged({
                    to: to.email,
                    incident,
                    oldStatus,
                    newStatus,
                    changedBy,
                })
            )
        );
    } catch (error) {
        logger.error("notifyStatusChanged failed", error.message);
    }
};

const notifyCommentAdded = async ({ incident, comment, author, staffOnly = false }) => {
    try {
        // An internal note must not be emailed to the reporter.
        const candidates = staffOnly
            ? [incident.assignedTo]
            : [incident.reportedBy, incident.assignedTo];

        const targets = await hydrate(resolveRecipients(candidates, author));
        if (!targets.length) return;

        await createInApp(targets, {
            type: NOTIFICATION_TYPES.COMMENT_ADDED,
            title: `New comment on ${incident.incidentNumber}`,
            body: comment.message.slice(0, 140),
            incident: incident._id,
        });

        await Promise.all(
            targets.map((to) =>
                emailService.sendCommentAdded({
                    to: to.email,
                    incident,
                    author,
                    message: comment.message,
                })
            )
        );
    } catch (error) {
        logger.error("notifyCommentAdded failed", error.message);
    }
};

/* --------------------------------------------------------------------------
 * V4 - RCA Action Item notifications (FR4-08).
 *
 * Each notifications about an action item is addressed to its owner. The owner
 * is never notified about an action they performed themselves (mirrors
 * resolveRecipients excluding the actor).
 * ------------------------------------------------------------------------ */

/** Assigned to me (create or owner reassignment). */
const notifyActionItemAssigned = async ({ actionItem, owner, assignedBy }) => {
    try {
        const targets = await hydrate(resolveRecipients([owner], assignedBy));
        if (!targets.length) return;

        await createInApp(targets, {
            type: NOTIFICATION_TYPES.ACTION_ITEM_ASSIGNED,
            title: "Action item assigned to you",
            body: actionItem.description.slice(0, 140),
            incident: actionItem.rca?.incident || null,
        });

        await Promise.all(
            targets.map((to) =>
                emailService.sendActionItemAssigned({ to: to.email, actionItem, owner, assignedBy })
            )
        );
    } catch (error) {
        logger.error("notifyActionItemAssigned failed", error.message);
    }
};

/** Approaching due date, fired by the scheduled process. */
const notifyActionItemDueSoon = async ({ actionItem, owner }) => {
    try {
        const targets = await hydrate(resolveRecipients([owner], null));
        if (!targets.length) return false;

        await createInApp(targets, {
            type: NOTIFICATION_TYPES.ACTION_ITEM_DUE_SOON,
            title: "Action item due soon",
            body: actionItem.description.slice(0, 140),
            incident: actionItem.rca?.incident || null,
        });

        await Promise.all(
            targets.map((to) =>
                emailService.sendActionItemDueSoon({ to: to.email, actionItem })
            )
        );
        return true;
    } catch (error) {
        logger.error("notifyActionItemDueSoon failed", error.message);
        return false;
    }
};

/** Due date passed and the item is unresolved. */
const notifyActionItemOverdue = async ({ actionItem, owner }) => {
    try {
        const targets = await hydrate(resolveRecipients([owner], null));
        if (!targets.length) return false;

        await createInApp(targets, {
            type: NOTIFICATION_TYPES.ACTION_ITEM_OVERDUE,
            title: "Action item is overdue",
            body: actionItem.description.slice(0, 140),
            incident: actionItem.rca?.incident || null,
        });

        await Promise.all(
            targets.map((to) =>
                emailService.sendActionItemOverdue({ to: to.email, actionItem })
            )
        );
        return true;
    } catch (error) {
        logger.error("notifyActionItemOverdue failed", error.message);
        return false;
    }
};

const notifyPostResolutionSurvey = async ({ incident }) => {
    try {
        const reporter = incident.reportedBy;

        if (!reporter) {
            logger.warn(
                `Cannot send survey for ${incident.incidentNumber}: reporter not found`
            );
            return;
        }

        const targets = await hydrate([reporter]);

        if (!targets.length) {
            logger.warn(
                `Cannot send survey for ${incident.incidentNumber}: reporter email not found`
            );
            return;
        }

        const survey = await createPostResolutionSurvey(incident);

        if (!survey) return;

        await Promise.all(
            targets.map((to) =>
                emailService.sendPostResolutionSurvey({
                    to: to.email,
                    incident,
                    token: survey.token,
                })
            )
        );

        logger.info(
            `Post-resolution survey sent for ${incident.incidentNumber}`
        );
    } catch (error) {
        logger.error(
            `notifyPostResolutionSurvey failed: ${error.message}`
        );
    }
};

module.exports = {
    notifyIncidentCreated,
    notifyIncidentAssigned,
    notifyStatusChanged,
    notifyCommentAdded,
    notifyActionItemAssigned,
    notifyActionItemDueSoon,
    notifyActionItemOverdue,
    notifyPostResolutionSurvey
};
