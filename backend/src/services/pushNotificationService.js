const PushToken = require("../models/PushToken");
const firebaseAdminService = require("./firebaseAdminService");
const logger = require("../utils/logger");
const { env } = require("../config/env");
const { idOf } = require("./permissionService");

/**
 * Web push fan-out over Firebase Cloud Messaging.
 *
 * Contract with every caller:
 *   - Nothing here ever throws. Push failure must never fail the incident
 *     operation that triggered it.
 *   - Tokens reported by FCM as invalid/unregistered are deactivated once and
 *     never retried.
 *   - When Firebase is not configured the whole service is a silent no-op.
 *
 * Payload shape (all `data` values are strings - FCM requires it):
 *   { notification: { title, body },
 *     data: { type, incidentId, incidentNumber, notificationId, url } }
 */

/** Canonical push event types (uppercase; sent through the FCM data payload). */
const PUSH_EVENTS = {
    INCIDENT_CREATED: "INCIDENT_CREATED",
    INCIDENT_ASSIGNED: "INCIDENT_ASSIGNED",
    STATUS_CHANGED: "STATUS_CHANGED",
    COMMENT_ADDED: "COMMENT_ADDED",
    INCIDENT_ACKNOWLEDGED: "INCIDENT_ACKNOWLEDGED",
    INCIDENT_ESCALATED: "INCIDENT_ESCALATED",
    INCIDENT_MAJOR: "INCIDENT_MAJOR",
    INCIDENT_OVERDUE: "INCIDENT_OVERDUE",
    ACTION_ITEM_ASSIGNED: "ACTION_ITEM_ASSIGNED",
    ACTION_ITEM_DUE_SOON: "ACTION_ITEM_DUE_SOON",
    ACTION_ITEM_OVERDUE: "ACTION_ITEM_OVERDUE",
};

/** FCM error codes that mean "this token is dead" - deactivate and forget. */
const INVALID_TOKEN_CODES = new Set([
    "messaging/invalid-registration-token",
    "messaging/registration-token-not-registered",
    "messaging/registration-token-not-valid",
    "messaging/invalid-argument",
]);

const BASE_URL = (env.clientUrls[0] || "").replace(/\/$/, "");

/**
 * Builds the canonical FCM payload. The incident link is derived server-side
 * from the authenticated client origin - never from anything the browser sent.
 */
const buildPayload = ({ title, body = "", type, incident = null, notificationId = null }) => {
    // `incident` may be a populated document or a bare ObjectId (action items).
    const incidentId = incident ? idOf(incident._id ?? incident) : "";
    const incidentNumber = incident?.incidentNumber || "";

    const data = { type: String(type || "") };
    if (incidentId) {
        data.incidentId = String(incidentId);
        data.incidentNumber = String(incidentNumber);
        data.url = `${BASE_URL}/incidents/${incidentId}`;
    }
    if (notificationId) data.notificationId = String(idOf(notificationId));

    return {
        notification: { title: String(title), body: String(body).slice(0, 300) },
        data,
    };
};

const deactivateTokens = async (tokens) => {
    if (!tokens.length) return;
    try {
        await PushToken.updateMany({ token: { $in: tokens } }, { isActive: false });
        logger.info(`pushNotificationService: deactivated ${tokens.length} invalid FCM token(s)`);
    } catch (error) {
        logger.error(`pushNotificationService: token cleanup failed (${error.message})`);
    }
};

/** FirebaseMessaging.sendEachForMulticast result -> per-token cleanup. */
const handleBatchResponse = async (tokens, response) => {
    const deadTokens = [];

    response.responses.forEach((item, index) => {
        if (item.success) return;
        const code = item.error?.code || "";
        if (INVALID_TOKEN_CODES.has(code)) deadTokens.push(tokens[index]);
        else logger.warn(`pushNotificationService: FCM send failed (${code || item.error?.message})`);
    });

    await deactivateTokens(deadTokens);
};

/**
 * Sends `payload` to every active device token of the given users.
 * Accepts user ids or hydrated user documents; never throws.
 */
const sendToUsers = async (users, payload) => {
    try {
        const ids = users.map(idOf).filter(Boolean);
        if (!ids.length || !payload) return;

        const messaging = firebaseAdminService.getFirebaseMessaging();
        if (!messaging) {
            logger.debug("pushNotificationService: Firebase not configured - push skipped");
            return;
        }

        const tokens = await PushToken.distinct("token", {
            userId: { $in: ids },
            isActive: true,
        });
        if (!tokens.length) return;

        await sendToTokens(tokens, payload);
    } catch (error) {
        logger.error(`pushNotificationService: sendToUsers failed (${error.message})`);
    }
};

/** Sends `payload` directly to an explicit token list. Never throws. */
const sendToTokens = async (tokens, payload) => {
    try {
        if (!tokens.length || !payload) return;

        const messaging = firebaseAdminService.getFirebaseMessaging();
        if (!messaging) return;

        const response = await messaging.sendEachForMulticast({
            tokens,
            notification: payload.notification,
            data: payload.data,
            webpush: {
                fcmOptions: payload.data.url ? { link: payload.data.url } : undefined,
            },
        });

        await handleBatchResponse(tokens, response);
    } catch (error) {
        logger.error(`pushNotificationService: sendToTokens failed (${error.message})`);
    }
};

module.exports = {
    PUSH_EVENTS,
    buildPayload,
    sendToUsers,
    sendToTokens,
    deactivateTokens,
};
