const mongoose = require("mongoose");
const ActionItem = require("../models/ActionItem");
const RootCauseAnalysis = require("../models/RootCauseAnalysis");
const Incident = require("../models/Incident");
const Problem = require("../models/Problem");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { successResponse, paginatedResponse } = require("../utils/apiResponse");
const { getPagination } = require("../utils/pagination");
const activityService = require("../services/activityService");
const notificationService = require("../services/notificationService");
const permissions = require("../services/permissionService");
const {
    ROLES,
    ACTION_ITEM_STATUS,
    ACTION_ITEM_STATUS_VALUES,
    ACTION_ITEM_STATUS_LABELS,
    ACTION_ITEM_STATUS_TRANSITIONS,
    ACTIVITY_ACTIONS,
} = require("../constants");

const isValidId = (value) => mongoose.Types.ObjectId.isValid(value);

const POPULATE = [
    { path: "rcaId", select: "incident problem status rootCauseCategory" },
    { path: "ownerId", select: "name email role isActive" },
];

/**
 * Only active Admin/Support Agent users may own an action item (FR4-07). This
 * mirrors the Problem-owner rule so the two features stay consistent.
 */
const resolveEligibleOwner = async (ownerId) => {
    if (!ownerId) throw ApiError.badRequest("An owner is required");
    const user = await User.findById(ownerId);
    if (!user || user.isActive === false) {
        throw ApiError.badRequest("The selected owner is not an active user");
    }
    if (![ROLES.ADMIN, ROLES.AGENT].includes(user.role)) {
        throw ApiError.badRequest("Only an administrator or support agent can own an action item");
    }
    return user;
};

/**
 * Loads the RCA an action item references and confirms it qualifies: it must
 * exist and be in the "approved" state (the RCA workflow is the gate for
 * creating action items - FR4-07 "appropriate/Approved RCA").
 */
const loadEligibleRca = async (rcaId) => {
    if (!isValidId(rcaId)) throw ApiError.badRequest("Invalid RCA ID");
    const rca = await RootCauseAnalysis.findById(rcaId);
    if (!rca) throw ApiError.notFound("RCA not found");
    if (rca.status !== "approved") {
        throw ApiError.badRequest("Action items can only be added to an approved RCA");
    }
    return rca;
};

/** Staff-only visibility gate for the action item list. */
const requireStaff = (user) => {
    if (!permissions.isStaff(user)) {
        throw ApiError.forbidden("You do not have permission to manage action items");
    }
};

/**
 * GET /action-items
 * Staff-only list with owner/status/RCA/anchor filtering. Each entry is scoped
 * to what the caller may manage: a Support Agent sees their own plus unassigned
 * items, an Admin sees everything.
 */
const listActionItems = asyncHandler(async (req, res) => {
    requireStaff(req.user);

    const conditions = [];
    // Support Agents see items they own plus items that are still unassigned.
    if (req.user.role === ROLES.AGENT) {
        conditions.push({
            $or: [{ ownerId: req.user._id }, { ownerId: { $in: [null] } }],
        });
    }

    if (req.query.rcaId && isValidId(req.query.rcaId)) {
        conditions.push({ rcaId: req.query.rcaId });
    }

    // Incident- or problem-anchored filtering via the RCA.
    if (req.query.incidentId && isValidId(req.query.incidentId)) {
        const rca = await RootCauseAnalysis.findOne({ incident: req.query.incidentId }).select("_id").lean();
        conditions.push({ rcaId: rca ? rca._id : null });
    }
    if (req.query.problemId && isValidId(req.query.problemId)) {
        const rca = await RootCauseAnalysis.findOne({ problem: req.query.problemId }).select("_id").lean();
        conditions.push({ rcaId: rca ? rca._id : null });
    }

    if (req.query.ownerId === "me") {
        conditions.push({ ownerId: req.user._id });
    } else if (req.query.ownerId && isValidId(req.query.ownerId)) {
        conditions.push({ ownerId: req.query.ownerId });
    }

    const statuses = String(req.query.status || "")
        .split(",")
        .map((value) => value.trim())
        .filter((value) => ACTION_ITEM_STATUS_VALUES.includes(value));
    if (statuses.length) conditions.push({ status: { $in: statuses } });

    const filter = conditions.length ? { $and: conditions } : {};

    const { page, limit, skip } = getPagination(req.query, { defaultLimit: 20 });
    const sortField = req.query.sortOrder === "asc" ? 1 : -1;

    const [items, total] = await Promise.all([
        ActionItem.find(filter)
            .populate(POPULATE)
            .sort({ dueDate: sortField, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        ActionItem.countDocuments(filter),
    ]);

    return paginatedResponse(res, "Action items retrieved", items, { page, limit, total });
});

/**
 * GET /action-items/:id
 */
const getActionItem = asyncHandler(async (req, res) => {
    requireStaff(req.user);
    const actionItem = await ActionItem.findById(req.params.id).populate(POPULATE);
    if (!actionItem) throw ApiError.notFound("Action item not found");
    if (!permissions.canManageActionItem(req.user, actionItem)) {
        throw ApiError.forbidden("You do not have permission to view this action item");
    }
    return successResponse(res, 200, "Action item retrieved", { actionItem });
});

/**
 * POST /action-items  (FR4-07)
 * Creates an action item on an approved RCA. Staff only; the owner must be an
 * active Admin/Support Agent.
 */
const createActionItem = asyncHandler(async (req, res) => {
    requireStaff(req.user);

    // Creating (and assigning) an action item to an arbitrary owner is an
    // Admin-only action (FR4-07). Agents may only update items they own.
    if (!permissions.canAssignActionItem(req.user)) {
        throw ApiError.forbidden("Only an administrator can create action items");
    }

    const { rcaId, description, ownerId, dueDate } = req.body;

    const rca = await loadEligibleRca(rcaId);
    const owner = await resolveEligibleOwner(ownerId);

    if (!dueDate || Number.isNaN(Date.parse(dueDate))) {
        throw ApiError.badRequest("A valid due date is required");
    }

    const actionItem = await ActionItem.create({
        rcaId: rca._id,
        description,
        ownerId: owner._id,
        dueDate,
        status: ACTION_ITEM_STATUS.OPEN,
    });

    await activityService.record({
        incident: rca.incident || null,
        problem: rca.problem || null,
        action: ACTIVITY_ACTIONS.ACTION_ITEM_CREATED,
        performedBy: req.user._id,
        field: "description",
        newValue: description,
        note: `Action item assigned to ${owner.name}`,
    });

    notificationService.notifyActionItemAssigned({
        actionItem: { ...actionItem.toObject(), rca },
        owner,
        assignedBy: req.user,
    });

    const created = await ActionItem.findById(actionItem._id).populate(POPULATE).lean();
    return successResponse(res, 201, "Action item created", { actionItem: created });
});

/**
 * PATCH /action-items/:id  (FR4-07)
 * Edits the descriptive fields (description, due date, completionNote). Owner
 * and status have their own endpoints.
 */
const updateActionItem = asyncHandler(async (req, res) => {
    requireStaff(req.user);
    const actionItem = await ActionItem.findById(req.params.id).populate(POPULATE);
    if (!actionItem) throw ApiError.notFound("Action item not found");
    if (!permissions.canManageActionItem(req.user, actionItem)) {
        throw ApiError.forbidden("You do not have permission to edit this action item");
    }

    const { description, dueDate, completionNote } = req.body;
    const auditEntries = [];
    const anchor = await resolveAnchor(actionItem.rcaId);

    if (description !== undefined && description !== actionItem.description) {
        auditEntries.push({
            incident: anchor.incident,
            problem: anchor.problem,
            action: ACTIVITY_ACTIONS.ACTION_ITEM_UPDATED,
            performedBy: req.user._id,
            field: "description",
            oldValue: actionItem.description,
            newValue: description,
        });
        actionItem.description = description;
    }

    const wasDone = actionItem.status === ACTION_ITEM_STATUS.DONE;
    if (dueDate !== undefined && dueDate !== String(actionItem.dueDate)) {
        if (Number.isNaN(Date.parse(dueDate))) {
            throw ApiError.badRequest("A valid due date is required");
        }
        auditEntries.push({
            incident: anchor.incident,
            problem: anchor.problem,
            action: ACTIVITY_ACTIONS.ACTION_ITEM_UPDATED,
            performedBy: req.user._id,
            field: "dueDate",
            oldValue: String(actionItem.dueDate),
            newValue: String(dueDate),
        });
        actionItem.dueDate = dueDate;
    }

    if (completionNote !== undefined && completionNote !== actionItem.completionNote) {
        auditEntries.push({
            incident: anchor.incident,
            problem: anchor.problem,
            action: ACTIVITY_ACTIONS.ACTION_ITEM_UPDATED,
            performedBy: req.user._id,
            field: "completionNote",
            oldValue: actionItem.completionNote,
            newValue: completionNote,
        });
        actionItem.completionNote = completionNote;
    }

    if (!auditEntries.length) throw ApiError.badRequest("No changes were supplied");

    await actionItem.save();
    await activityService.recordMany(auditEntries);

    const updated = await ActionItem.findById(actionItem._id).populate(POPULATE).lean();
    return successResponse(res, 200, "Action item updated", { actionItem: updated });
});

/** Resolves the incident/problem anchors an RCA hangs off, for activity logs. */
const resolveAnchor = async (rca) => {
    const id = rca && typeof rca === "object" ? rca._id : rca;
    if (!isValidId(id)) return { incident: null, problem: null };
    const doc = await RootCauseAnalysis.findById(id).select("incident problem").lean();
    return doc || { incident: null, problem: null };
};

/**
 * PATCH /action-items/:id/status  (FR4-07 workflow)
 * Validated transitions; Done captures completionNote as audit evidence
 * (FR4-10). An item moving out of Done clears the completion note.
 */
const updateActionItemStatus = asyncHandler(async (req, res) => {
    requireStaff(req.user);
    const actionItem = await ActionItem.findById(req.params.id).populate(POPULATE);
    if (!actionItem) throw ApiError.notFound("Action item not found");
    if (!permissions.canManageActionItem(req.user, actionItem)) {
        throw ApiError.forbidden("You do not have permission to change this action item's status");
    }

    const { status, completionNote } = req.body;
    const oldStatus = actionItem.status;

    if (oldStatus !== status) {
        const allowed = ACTION_ITEM_STATUS_TRANSITIONS[oldStatus] || [];
        if (!allowed.includes(status)) {
            throw ApiError.badRequest(
                `Invalid transition: cannot move an action item from '${oldStatus}' to '${status}'. ` +
                    `Allowed next steps: ${allowed.join(", ") || "none"}`
            );
        }
    }

    const anchor = await resolveAnchor(actionItem.rcaId);
    const isDone = status === ACTION_ITEM_STATUS.DONE;

    actionItem.status = status;
    if (isDone && completionNote !== undefined) {
        actionItem.completionNote = completionNote;
    }
    // Closure evidence (FR4-10): stamp completion time on Done, and clear it
    // when an item is reopened. The audit history stays append-only.
    if (isDone && oldStatus !== ACTION_ITEM_STATUS.DONE) {
        actionItem.completedAt = new Date();
    }
    if (oldStatus === ACTION_ITEM_STATUS.DONE && !isDone) {
        actionItem.completedAt = null;
        actionItem.completionNote = "";
    }

    await actionItem.save();

    const action = isDone
        ? ACTIVITY_ACTIONS.ACTION_ITEM_COMPLETED
        : ACTIVITY_ACTIONS.ACTION_ITEM_STATUS_CHANGED;

    await activityService.record({
        incident: anchor.incident,
        problem: anchor.problem,
        action,
        performedBy: req.user._id,
        field: "status",
        oldValue: ACTION_ITEM_STATUS_LABELS[oldStatus],
        newValue: ACTION_ITEM_STATUS_LABELS[status],
        note: completionNote || null,
    });

    const updated = await ActionItem.findById(actionItem._id).populate(POPULATE).lean();
    const message = isDone ? "Action item marked as done" : `Action item moved to ${ACTION_ITEM_STATUS_LABELS[status]}`;
    return successResponse(res, 200, message, { actionItem: updated });
});

/**
 * PATCH /action-items/:id/owner  (FR4-07)
 * Reassigns an action item. Admin is the only role that may reassign arbitrary
 * items; a Support Agent may only move items they already own, and only to an
 * eligible active Admin/Agent owner.
 */
const updateActionItemOwner = asyncHandler(async (req, res) => {
    requireStaff(req.user);
    const actionItem = await ActionItem.findById(req.params.id).populate(POPULATE);
    if (!actionItem) throw ApiError.notFound("Action item not found");

    if (!permissions.canAssignActionItem(req.user) && !permissions.canManageActionItem(req.user, actionItem)) {
        throw ApiError.forbidden("You do not have permission to reassign this action item");
    }

    const { ownerId } = req.body;
    const newOwner = await resolveEligibleOwner(ownerId);

    if (actionItem.ownerId && String(actionItem.ownerId._id) === String(newOwner._id)) {
        throw ApiError.badRequest("This action item is already owned by that user");
    }

    const previousName = actionItem.ownerId?.name || "Unassigned";
    actionItem.ownerId = newOwner._id;
    await actionItem.save();

    const anchor = await resolveAnchor(actionItem.rcaId);
    await activityService.record({
        incident: anchor.incident,
        problem: anchor.problem,
        action: ACTIVITY_ACTIONS.ACTION_ITEM_ASSIGNED,
        performedBy: req.user._id,
        field: "ownerId",
        oldValue: previousName,
        newValue: newOwner.name,
    });

    notificationService.notifyActionItemAssigned({
        actionItem: { ...actionItem.toObject(), rca: actionItem.rcaId },
        owner: newOwner,
        assignedBy: req.user,
    });

    const updated = await ActionItem.findById(actionItem._id).populate(POPULATE).lean();
    return successResponse(res, 200, `Action item assigned to ${newOwner.name}`, { actionItem: updated });
});

/**
 * DELETE /action-items/:id  (Admin only, consistent with incident deletion
 * permissions - FR4-07).
 */
const deleteActionItem = asyncHandler(async (req, res) => {
    if (!permissions.isAdmin(req.user)) {
        throw ApiError.forbidden("Only an administrator can delete an action item");
    }

    const actionItem = await ActionItem.findById(req.params.id).populate(POPULATE);
    if (!actionItem) throw ApiError.notFound("Action item not found");

    const anchor = await resolveAnchor(actionItem.rcaId);
    await actionItem.deleteOne();

    return successResponse(res, 200, "Action item deleted", { id: req.params.id });
});

module.exports = {
    listActionItems,
    getActionItem,
    createActionItem,
    updateActionItem,
    updateActionItemStatus,
    updateActionItemOwner,
    deleteActionItem,
};
