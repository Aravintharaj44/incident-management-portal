const Notification = require("../models/Notification");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { successResponse } = require("../utils/apiResponse");

/**
 * In-app notifications (FR-09) - the header bell.
 * Every query is scoped to req.user, so one user can never read another's.
 */

/** GET /api/v1/notifications?unreadOnly=true */
const listNotifications = asyncHandler(async (req, res) => {
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 15));

    const filter = { recipient: req.user._id };
    if (req.query.unreadOnly === "true") filter.isRead = false;

    const [notifications, unreadCount] = await Promise.all([
        Notification.find(filter)
            .populate("incident", "incidentNumber title status")
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean(),
        Notification.countDocuments({ recipient: req.user._id, isRead: false }),
    ]);

    return successResponse(res, 200, "Notifications retrieved", {
        notifications,
        unreadCount,
    });
});

/** GET /api/v1/notifications/unread-count - polled by the bell badge. */
const getUnreadCount = asyncHandler(async (req, res) => {
    const unreadCount = await Notification.countDocuments({
        recipient: req.user._id,
        isRead: false,
    });

    return successResponse(res, 200, "Unread count retrieved", { unreadCount });
});

/** PATCH /api/v1/notifications/:id/read */
const markAsRead = asyncHandler(async (req, res) => {
    const notification = await Notification.findOneAndUpdate(
        // The recipient is part of the filter, so this cannot touch someone
        // else's notification even with a valid id.
        { _id: req.params.id, recipient: req.user._id },
        { isRead: true },
        { returnDocument: "after" }
    );

    if (!notification) throw ApiError.notFound("Notification not found");

    return successResponse(res, 200, "Notification marked as read", { notification });
});

/** PATCH /api/v1/notifications/read-all */
const markAllAsRead = asyncHandler(async (req, res) => {
    const result = await Notification.updateMany(
        { recipient: req.user._id, isRead: false },
        { isRead: true }
    );

    return successResponse(res, 200, "All notifications marked as read", {
        updated: result.modifiedCount,
    });
});

/** DELETE /api/v1/notifications/:id */
const deleteNotification = asyncHandler(async (req, res) => {
    const deleted = await Notification.findOneAndDelete({
        _id: req.params.id,
        recipient: req.user._id,
    });

    if (!deleted) throw ApiError.notFound("Notification not found");

    return successResponse(res, 200, "Notification removed");
});

module.exports = {
    listNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
};
