/**
 * Outbound webhook SUBSCRIPTIONS - admin CRUD for external systems that want
 * to be notified about ticket lifecycle events.
 *
 * Not related to controllers/webhookController.js (receiveWebhook), which
 * handles INBOUND monitoring alerts from Datadog/Alertmanager. That file is
 * untouched by this one.
 */
const WebhookSubscription = require("../models/Webhooksubscription");
const WebhookDelivery = require("../models/Webhookdelivery");
const OAuthClient = require("../models/OAuthClient");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");
const { successResponse, paginatedResponse } = require("../utils/apiResponse");
const { getPagination } = require("../utils/pagination");
const { WEBHOOK_EVENT_VALUES } = require("../constants");

const assertClientExists = async (clientId) => {
    if (!clientId) throw ApiError.badRequest("oauthClient is required");
    const client = await OAuthClient.findById(clientId);
    if (!client) throw ApiError.badRequest("Please select a valid OAuth client");
    return client;
};

const assertValidEvents = (events) => {
    if (!Array.isArray(events) || events.length === 0) {
        throw ApiError.badRequest("At least one event must be selected");
    }
    const invalidEvent = events.find((e) => !WEBHOOK_EVENT_VALUES.includes(e));
    if (invalidEvent) {
        throw ApiError.badRequest(`Unsupported webhook event "${invalidEvent}"`);
    }
};

/**
 * GET /api/v1/webhooks  (Admin only)
 * Optional filters: ?oauthClient=<id>&isActive=true|false
 */
const listWebhooks = asyncHandler(async (req, res) => {
    const { oauthClient, isActive } = req.query;
    const { page, limit, skip } = getPagination(req.query, { defaultLimit: 10 });

    const filter = {};
    if (oauthClient) filter.oauthClient = oauthClient;
    if (isActive === "true") filter.isActive = true;
    if (isActive === "false") filter.isActive = false;

    const [subscriptions, total] = await Promise.all([
        WebhookSubscription.find(filter)
            .populate("oauthClient", "clientId name")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        WebhookSubscription.countDocuments(filter),
    ]);

    return paginatedResponse(
        res,
        "Webhook subscriptions retrieved",
        subscriptions.map((s) => s.toPublicJSON()),
        { page, limit, total }
    );
});

/** GET /api/v1/webhooks/:id  (Admin only) */
const getWebhook = asyncHandler(async (req, res) => {
    const subscription = await WebhookSubscription.findById(req.params.id).populate(
        "oauthClient",
        "clientId name"
    );

    if (!subscription) throw ApiError.notFound("Webhook subscription not found");

    return successResponse(res, 200, "Webhook subscription retrieved", {
        webhook: subscription.toPublicJSON(),
    });
});

/**
 * POST /api/v1/webhooks  (Admin only)
 * Body: { oauthClient, targetUrl, events, description? }
 *
 * The plaintext signing secret is returned exactly once in this response -
 * same pattern as the OAuth client secret. The model only stores it behind
 * select:false and no other endpoint ever re-exposes it.
 */
const createWebhook = asyncHandler(async (req, res) => {
    const { oauthClient, targetUrl, events, description } = req.body;

    await assertClientExists(oauthClient);
    assertValidEvents(events);

    if (!targetUrl) throw ApiError.badRequest("targetUrl is required");

    const secret = WebhookSubscription.generateSecret();

    const subscription = await WebhookSubscription.create({
        oauthClient,
        targetUrl,
        events,
        description,
        secret,
        isActive: true,
    });

    logger.event("webhook_subscription_created", {
        subscriptionId: subscription._id.toString(),
        oauthClient,
        events,
        by: req.user.id,
    });

    return successResponse(res, 201, "Webhook subscription created", {
        webhook: subscription.toPublicJSON(),
        // Shown once - copy it down now, it cannot be retrieved again.
        secret,
        note: "Store this signing secret securely now; it is shown only once. Use it to verify the X-Webhook-Signature header on incoming deliveries.",
    });
});

/** PATCH /api/v1/webhooks/:id  (Admin only) */
const updateWebhook = asyncHandler(async (req, res) => {
    const { targetUrl, events, description, isActive, oauthClient } = req.body;

    const subscription = await WebhookSubscription.findById(req.params.id);
    if (!subscription) throw ApiError.notFound("Webhook subscription not found");

    if (oauthClient !== undefined) {
        await assertClientExists(oauthClient);
        subscription.oauthClient = oauthClient;
    }

    if (events !== undefined) {
        assertValidEvents(events);
        subscription.events = events;
    }

    if (targetUrl !== undefined) subscription.targetUrl = targetUrl;
    if (description !== undefined) subscription.description = description;

    if (isActive !== undefined) {
        subscription.isActive = isActive;
        if (isActive) {
            // Manual re-activation clears the circuit breaker state.
            subscription.consecutiveFailures = 0;
            subscription.disabledAt = null;
            subscription.disabledReason = null;
        } else {
            subscription.disabledAt = new Date();
            subscription.disabledReason = "Manually deactivated";
        }
    }

    await subscription.save();

    logger.event("webhook_subscription_updated", {
        subscriptionId: subscription._id.toString(),
        by: req.user.id,
    });

    return successResponse(res, 200, "Webhook subscription updated", {
        webhook: subscription.toPublicJSON(),
    });
});

/**
 * POST /api/v1/webhooks/:id/rotate-secret  (Admin only)
 * Issues a new signing secret. Deliveries already sent keep their original
 * signature; only future deliveries use the new secret.
 */
const rotateWebhookSecret = asyncHandler(async (req, res) => {
    const subscription = await WebhookSubscription.findById(req.params.id);
    if (!subscription) throw ApiError.notFound("Webhook subscription not found");

    const secret = WebhookSubscription.generateSecret();
    subscription.secret = secret;
    await subscription.save();

    logger.event("webhook_subscription_secret_rotated", {
        subscriptionId: subscription._id.toString(),
        by: req.user.id,
    });

    return successResponse(res, 200, "Webhook signing secret rotated", {
        webhook: subscription.toPublicJSON(),
        secret,
        note: "Store this signing secret securely now; it is shown only once.",
    });
});

/** DELETE /api/v1/webhooks/:id  (Admin only) */
const deleteWebhook = asyncHandler(async (req, res) => {
    const subscription = await WebhookSubscription.findByIdAndDelete(req.params.id);
    if (!subscription) throw ApiError.notFound("Webhook subscription not found");

    logger.event("webhook_subscription_deleted", {
        subscriptionId: subscription._id.toString(),
        by: req.user.id,
    });

    return successResponse(res, 200, "Webhook subscription deleted", {});
});

/** GET /api/v1/webhooks/:id/deliveries  (Admin only) */
const listDeliveries = asyncHandler(async (req, res) => {
    const subscription = await WebhookSubscription.findById(req.params.id);
    if (!subscription) throw ApiError.notFound("Webhook subscription not found");

    const { page, limit, skip } = getPagination(req.query, { defaultLimit: 20 });

    const [deliveries, total] = await Promise.all([
        WebhookDelivery.find({ subscription: subscription._id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        WebhookDelivery.countDocuments({ subscription: subscription._id }),
    ]);

    return paginatedResponse(res, "Webhook deliveries retrieved", deliveries, {
        page,
        limit,
        total,
    });
});

module.exports = {
    listWebhooks,
    getWebhook,
    createWebhook,
    updateWebhook,
    rotateWebhookSecret,
    deleteWebhook,
    listDeliveries,
};