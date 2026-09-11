const mongoose = require("mongoose");
const { WEBHOOK_EVENT_VALUES } = require("../constants");

/**
 * Audit trail of individual webhook delivery attempts. Not required for the
 * feature to function, but makes failures debuggable (e.g. from an admin
 * screen) instead of only living in application logs.
 */
const webhookDeliverySchema = new mongoose.Schema(
    {
        subscription: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "WebhookSubscription",
            required: true,
            index: true,
        },

        event: {
            type: String,
            required: true,
            enum: WEBHOOK_EVENT_VALUES,
            index: true,
        },

        attempt: {
            type: Number,
            required: true,
            default: 1,
        },

        success: {
            type: Boolean,
            required: true,
        },

        statusCode: {
            type: Number,
            default: null,
        },

        errorMessage: {
            type: String,
            default: null,
        },

        durationMs: {
            type: Number,
            default: null,
        },

        // Snapshot of what was sent, useful when debugging/replaying.
        payload: {
            type: mongoose.Schema.Types.Mixed,
        },
    },
    { timestamps: true }
);

webhookDeliverySchema.index({ subscription: 1, createdAt: -1 });

module.exports = mongoose.model("WebhookDelivery", webhookDeliverySchema);