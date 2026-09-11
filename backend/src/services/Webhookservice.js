const crypto = require("crypto");
const WebhookSubscription = require("../models/Webhooksubscription");
const WebhookDelivery = require("../models/Webhookdelivery");

const MAX_CONSECUTIVE_FAILURES = 5;

const signPayload = (payload, secret) =>
    crypto.createHmac("sha256", secret).update(payload).digest("hex");

const deliverWebhook = async (subscription, event, payload) => {
    const body = JSON.stringify({ event, data: payload });
    const startedAt = Date.now();
    let response;
    let errorMessage = null;

    try {
        response = await fetch(subscription.targetUrl, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-webhook-event": event,
                "x-webhook-signature": signPayload(body, subscription.secret),
            },
            body,
        });
    } catch (error) {
        errorMessage = error.message;
    }

    const success = Boolean(response?.ok);
    if (!success && !errorMessage) {
        errorMessage = `Webhook endpoint returned HTTP ${response.status}`;
    }

    await WebhookDelivery.create({
        subscription: subscription._id,
        event,
        success,
        statusCode: response?.status || null,
        errorMessage,
        durationMs: Date.now() - startedAt,
        payload,
    });

    subscription.lastDeliveryAt = new Date();
    if (success) {
        subscription.consecutiveFailures = 0;
        subscription.lastSuccessAt = new Date();
    } else {
        subscription.consecutiveFailures += 1;
        subscription.lastFailureAt = new Date();
        if (subscription.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            subscription.isActive = false;
            subscription.disabledAt = new Date();
            subscription.disabledReason = "Too many consecutive delivery failures";
        }
    }
    await subscription.save();
};

const triggerTicketEvent = (event, payload) => {
    void WebhookSubscription.find({ isActive: true, events: event })
        .select("+secret")
        .then((subscriptions) =>
            Promise.allSettled(
                subscriptions.map((subscription) =>
                    deliverWebhook(subscription, event, payload)
                )
            )
        )
        .catch(() => undefined);
};

module.exports = { triggerTicketEvent };