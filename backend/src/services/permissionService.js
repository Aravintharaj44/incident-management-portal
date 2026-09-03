const { ROLES, STATUS, STATUS_TRANSITIONS, PROBLEM_STATUS_TRANSITIONS } = require("../constants");
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
 * V4 - Problem Management (FR4-01/03/05). Problems and Known Errors are a
 * support-team concern: Admins and Agents can create/manage/own Problems and
 * browse the KEDB. End users never gain these capabilities.
 */
const isStaff = (user) => isAdmin(user) || isAgent(user);

const canManageProblems = (user) => isAdmin(user) || isAgent(user);

const canOwnProblem = (user) =>
    isStaff(user) && Boolean(user.isActive !== false);

/** Staff see all Problems (mirrors the incident queue rules). */
const problemVisibilityFilter = (user) => {
    if (isAdmin(user) || isAgent(user)) return {};
    // Defensive: a non-staff user should never reach a problem query.
    return { _id: { $exists: false } };
};

/** V4 - Problem status transition guard (FR4 status workflow). */
const assertProblemTransition = (currentStatus, nextStatus) => {
    if (currentStatus === nextStatus) {
        throw ApiError.badRequest(`Problem is already '${nextStatus}'`);
    }

    const allowed = PROBLEM_STATUS_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(nextStatus)) {
        throw ApiError.badRequest(
            `Cannot move a problem from '${currentStatus}' to '${nextStatus}'. ` +
                `Allowed next steps: ${allowed.join(", ") || "none"}`
        );
    }
};

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

/* --------------------------------------------------------------------------
 * V4 - RCA Action Items (FR4-07..09).
 *
 * Action items hang off an approved RCA and are a staff concern, mirroring the
 * problem-management rules: Admins and (in some cases) Support Agents may
 * manage them; an End User never gains management access.
 *
 * A Support Agent may manage an action item they own, or (as with incidents)
 * one that is still unassigned. Admins may manage every action item.
 * ------------------------------------------------------------------------ */

/** Only active Admin/Support Agent users may own an action item (FR4-07). */
const canOwnActionItem = (user) => isStaff(user) && user.isActive !== false;

/**
 * A Support Agent can manage (edit/status/owner) action items they own, or any
 * that have no owner yet. Admins manage everything.
 */
const canManageActionItem = (user, actionItem) => {
    if (isAdmin(user)) return true;
    if (!isAgent(user)) return false;
    return !actionItem.ownerId || idOf(actionItem.ownerId) === idOf(user._id);
};

/** Only an Admin may create/assign action items to arbitrary owners. */
const canAssignActionItem = (user) => isAdmin(user);

/* --------------------------------------------------------------------------
 * V4 - Knowledge Base (FR4-11..15).
 *
 * Staff (Admin + Support Agent) may create, edit, publish and manage KB
 * articles. All authenticated users may view published articles and submit
 * feedback. Only staff may see draft articles.
 * ------------------------------------------------------------------------ */

/** Staff may create KB articles. */
const canCreateKB = (user) => isAdmin(user) || isAgent(user);

/** Admin or the original author may edit a KB article. */
const canEditKB = (user, article) => {
    if (isAdmin(user)) return true;
    if (!isAgent(user)) return false;
    if (!article) return true;
    return String(article.authorID) === String(user._id);
};

/** Staff may manage (publish, delete) KB articles. */
const canManageKB = (user) => isAdmin(user) || isAgent(user);

/** Staff may view draft KB articles; end users only see published. */
const canViewKBDrafts = (user) => isAdmin(user) || isAgent(user);

/** Staff may link/unlink KB articles to incidents and problems. */
const canLinkKB = (user) => isAdmin(user) || isAgent(user);

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
    isStaff,
    canManageProblems,
    canOwnProblem,
    problemVisibilityFilter,
    assertProblemTransition,
    canOwnActionItem,
    canManageActionItem,
    canAssignActionItem,
    canCreateKB,
    canEditKB,
    canManageKB,
    canViewKBDrafts,
    canLinkKB,
};
