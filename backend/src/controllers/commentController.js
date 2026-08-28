const Comment = require("../models/Comment");
const Incident = require("../models/Incident");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");
const { successResponse } = require("../utils/apiResponse");
const activityService = require("../services/activityService");
const notificationService = require("../services/notificationService");
const permissions = require("../services/permissionService");
const { ACTIVITY_ACTIONS } = require("../constants");

/** Loads the incident and checks the caller may see it at all. */
const loadViewableIncident = async (incidentId, user) => {
    const incident = await Incident.findById(incidentId).populate([
        { path: "reportedBy", select: "name email isActive" },
        { path: "assignedTo", select: "name email isActive" },
    ]);

    if (!incident) throw ApiError.notFound("Incident not found");

    if (!permissions.canView(user, incident)) {
        throw ApiError.forbidden("You do not have access to this incident");
    }

    return incident;
};

/**
 * GET /api/v1/incidents/:incidentId/comments  (FR-07)
 * Oldest first, so the thread reads top to bottom.
 */
const listComments = asyncHandler(async (req, res) => {
    const incident = await loadViewableIncident(req.params.incidentId, req.user);

    const filter = { incident: incident._id };

    // The reporter never sees internal staff notes.
    if (!permissions.canUseInternalNotes(req.user)) filter.isInternal = false;

    const comments = await Comment.find(filter)
        .populate("author", "name email role")
        .sort({ createdAt: 1 })
        .lean();

    return successResponse(res, 200, "Comments retrieved", { comments });
});

/** POST /api/v1/incidents/:incidentId/comments */
const addComment = asyncHandler(async (req, res) => {
    const { message, isInternal } = req.body;

    const incident = await loadViewableIncident(req.params.incidentId, req.user);

    if (!permissions.canComment(req.user, incident)) {
        throw ApiError.forbidden("You cannot comment on this incident");
    }

    // Only staff may mark a comment internal - an End User asking for one is
    // silently downgraded to a normal, visible comment.
    const internal = Boolean(isInternal) && permissions.canUseInternalNotes(req.user);

    const comment = await Comment.create({
        incident: incident._id,
        author: req.user._id,
        message,
        isInternal: internal,
    });

    // Denormalised counter so the list screen does not need a join per row.
    await Incident.updateOne({ _id: incident._id }, { $inc: { commentCount: 1 } });

    await activityService.record({
        incident: incident._id,
        action: ACTIVITY_ACTIONS.COMMENTED,
        performedBy: req.user._id,
        note: internal ? "Added an internal note" : "Added a comment",
    });

    logger.event("comment_added", {
        incidentId: incident.id,
        commentId: comment.id,
        internal,
        by: req.user.id,
    });

    notificationService.notifyCommentAdded({
        incident,
        comment,
        author: req.user,
        staffOnly: internal,
    });

    const populated = await Comment.findById(comment._id)
        .populate("author", "name email role")
        .lean();

    return successResponse(res, 201, "Comment added", { comment: populated });
});

/**
 * PATCH /api/v1/comments/:id
 * A short edit window keeps the thread trustworthy as an audit record.
 */
const EDIT_WINDOW_MINUTES = 15;

const updateComment = asyncHandler(async (req, res) => {
    const comment = await Comment.findById(req.params.id);
    if (!comment) throw ApiError.notFound("Comment not found");

    if (String(comment.author) !== String(req.user._id)) {
        throw ApiError.forbidden("You can only edit your own comments");
    }

    const ageMinutes = (Date.now() - comment.createdAt.getTime()) / 60000;

    if (ageMinutes > EDIT_WINDOW_MINUTES) {
        throw ApiError.badRequest(
            `Comments can only be edited within ${EDIT_WINDOW_MINUTES} minutes of posting`
        );
    }

    comment.message = req.body.message;
    await comment.save();

    const populated = await Comment.findById(comment._id)
        .populate("author", "name email role")
        .lean();

    return successResponse(res, 200, "Comment updated", { comment: populated });
});

/** DELETE /api/v1/comments/:id - the author or an admin. */
const deleteComment = asyncHandler(async (req, res) => {
    const comment = await Comment.findById(req.params.id);
    if (!comment) throw ApiError.notFound("Comment not found");

    const isAuthor = String(comment.author) === String(req.user._id);

    if (!isAuthor && !permissions.isAdmin(req.user)) {
        throw ApiError.forbidden("You can only delete your own comments");
    }

    await comment.deleteOne();
    await Incident.updateOne({ _id: comment.incident }, { $inc: { commentCount: -1 } });

    logger.event("comment_deleted", { commentId: req.params.id, by: req.user.id });

    return successResponse(res, 200, "Comment deleted");
});

module.exports = { listComments, addComment, updateComment, deleteComment };
