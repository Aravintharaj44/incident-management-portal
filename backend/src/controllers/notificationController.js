const Notification = require("../models/Notification");
const PushToken = require("../models/PushToken");
const firebaseAdminService = require("../services/firebaseAdminService");
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

/* --------------------------------------------------------------------------
 * Web push (FCM) device tokens.
 *
 * The owner always comes from req.user - userId is never accepted from the
 * client, so nobody can register or read another user's tokens.
 * ------------------------------------------------------------------------ */

/** POST /api/v1/notifications/push/register - { token, platform } */
const registerPushToken = asyncHandler(async (req, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const platform = req.body?.platform || "web";

    if (!token) throw ApiError.badRequest("token is required");
    if (platform !== "web") {
        throw ApiError.badRequest("platform must be 'web'");
    }

    // Upsert keyed on the globally unique token. If the same browser token is
    // presented by a different (authenticated) user it is transferred to them -
    // an FCM token always follows the device it was issued to. Ownership can
    // only ever move to the caller identified by their own JWT.
    const pushToken = await PushToken.findOneAndUpdate(
        { token },
        {
            $set: {
                userId: req.user._id,
                platform,
                userAgent: (req.get("user-agent") || "").slice(0, 300),
                isActive: true,
                lastSeenAt: new Date(),
            },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return successResponse(res, 200, "Push token registered", {
        pushToken: {
            id: pushToken._id,
            platform: pushToken.platform,
            isActive: pushToken.isActive,
            lastSeenAt: pushToken.lastSeenAt,
        },
    });
});

/** DELETE /api/v1/notifications/push/register - { token } (caller's only) */
const unregisterPushToken = asyncHandler(async (req, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    if (!token) throw ApiError.badRequest("token is required");

    // The userId filter means a user can only ever remove their own token.
    const removed = await PushToken.findOneAndDelete({ token, userId: req.user._id });
    if (!removed) throw ApiError.notFound("Push token not found");

    return successResponse(res, 200, "Push token removed");
});

/** GET /api/v1/notifications/push/register - caller's active devices. */
const listPushTokens = asyncHandler(async (req, res) => {
    const tokens = await PushToken.find({ userId: req.user._id, isActive: true })
        .select("platform userAgent lastSeenAt createdAt")
        .sort({ lastSeenAt: -1 })
        .lean();

    return successResponse(res, 200, "Push tokens retrieved", {
        tokens,
        // Lets the UI distinguish "disabled" from "not configured".
        configured: firebaseAdminService.isConfigured(),
    });
});

module.exports = {
    listNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    registerPushToken,
    unregisterPushToken,
    listPushTokens,
};
