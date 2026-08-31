const { ROLES, STATUS, STATUS_TRANSITIONS } = require("../constants");
const ApiError = require("../utils/ApiError");

/**
 * All incident-level authorization rules, in one file.
 *
 * Section 8 of the BRD in code form. Controllers ask questions here rather
 * than scattering `if (role === "admin")` checks around, which keeps the rules
 * consistent and reviewable.
 *
 *   Admin  - everything.
 *   Agent  - sees the whole queue; may act on incidents assigned to them or
 *            still unassigned (picking work up), and may hand work to another
 *            agent.
 *   User   - only the incidents they raised.
 */

const idOf = (value) => {
    if (!value) return null;
    // Handles a populated document, a raw ObjectId, and a plain string alike.
    return String(value._id ?? value);
};

const isAdmin = (user) => user.role === ROLES.ADMIN;
const isAgent = (user) => user.role === ROLES.AGENT;
const isReporterOf = (user, incident) => idOf(incident.reportedBy) === idOf(user._id);
const isAssigneeOf = (user, incident) => idOf(incident.assignedTo) === idOf(user._id);

/**
 * Mongo filter limiting a list query to what this user is allowed to see.
 * Applied before any user-supplied filters, so it cannot be widened by a
 * crafted query string.
 */
const visibilityFilter = (user) => {
    if (isAdmin(user) || isAgent(user)) return {};
    return { reportedBy: user._id };
};

const canView = (user, incident) => {
    if (isAdmin(user) || isAgent(user)) return true;
    return isReporterOf(user, incident);
};

/** Editing the title/description/category of an existing incident. */
const canEditDetails = (user, incident) => {
    if (isAdmin(user)) return true;
    if (isAgent(user)) return isAssigneeOf(user, incident) || !incident.assignedTo;
    // A reporter may correct their own report only while nobody has started on it.
    return isReporterOf(user, incident) && incident.status === STATUS.NEW;
};

const canChangeStatus = (user, incident) => {
    if (isAdmin(user)) return true;
    if (isAgent(user)) return isAssigneeOf(user, incident) || !incident.assignedTo;
    return false;
};

const canAssign = (user, incident) => {
    if (isAdmin(user)) return true;
    // "Agent can reassign within team" (FR-05) - only for work they hold or
    // that is sitting unassigned in the queue.
    if (isAgent(user)) return isAssigneeOf(user, incident) || !incident.assignedTo;
    return false;
};

const canDelete = (user) => isAdmin(user);

/**
 * Only an Admin decides which department an incident belongs to. Support
 * Agents work inside the department already assigned by an Admin.
 */
const canChangeDepartment = (user) => isAdmin(user);

/** Linking affects two records, so it is deliberately limited to support staff. */
const canManageLinks = (user) => isAdmin(user) || isAgent(user);

const canComment = (user, incident) => canView(user, incident);

/** Only staff may write, or read, internal notes. */
const canUseInternalNotes = (user) => isAdmin(user) || isAgent(user);

const canUploadAttachment = (user, incident) => canView(user, incident);

const canDeleteAttachment = (user, incident, attachment) => {
    if (isAdmin(user)) return true;
    if (idOf(attachment.uploadedBy) === idOf(user._id)) return true;
    return isAgent(user) && isAssigneeOf(user, incident);
};

/** Throws unless `status` is a legal next step from `currentStatus` (FR-06). */
const assertValidTransition = (currentStatus, nextStatus) => {
    if (currentStatus === nextStatus) {
        throw ApiError.badRequest(`Incident is already '${nextStatus}'`);
    }

    const allowed = STATUS_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(nextStatus)) {
        throw ApiError.badRequest(
            `Cannot move an incident from '${currentStatus}' to '${nextStatus}'. ` +
                `Allowed next steps: ${allowed.join(", ") || "none"}`
        );
    }
};

module.exports = {
    idOf,
    isAdmin,
    isAgent,
    isReporterOf,
    isAssigneeOf,
    visibilityFilter,
    canView,
    canEditDetails,
    canChangeStatus,
    canAssign,
    canChangeDepartment,
    canDelete,
    canManageLinks,
    canComment,
    canUseInternalNotes,
    canUploadAttachment,
    canDeleteAttachment,
    assertValidTransition,
};
