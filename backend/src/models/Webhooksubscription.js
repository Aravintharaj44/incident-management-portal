const mongoose = require("mongoose");
const crypto = require("crypto");
const { WEBHOOK_EVENT_VALUES } = require("../constants");

const isHttpsUrl = (value) => {
    try {
        const parsed = new URL(value);
        return parsed.protocol === "https:";
    } catch {
        return false;
    }
};

/**
 * Outbound webhook subscription. A subscription belongs to an OAuthClient
 * (the external system) and fires an HTTP callback whenever a ticket
 * lifecycle event it's subscribed to happens, instead of that system having
 * to poll the REST API.
 */
const webhookSubscriptionSchema = new mongoose.Schema(
    {
        oauthClient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OAuthClient",
            required: [true, "A webhook must be linked to an OAuth client"],
            index: true,
        },

        targetUrl: {
            type: String,
            required: [true, "targetUrl is required"],
            trim: true,
            validate: {
                validator: isHttpsUrl,
                message: "targetUrl must be a valid https:// URL",
            },
        },

        events: {
            type: [String],
            required: true,
            validate: {
                validator: (arr) => Array.isArray(arr) && arr.length > 0,
                message: "At least one event must be selected",
            },
            enum: {
                values: WEBHOOK_EVENT_VALUES,
                message: "Unsupported webhook event",
            },
        },

        description: {
            type: String,
            trim: true,
            maxlength: [500, "Description cannot exceed 500 characters"],
        },

        // HMAC signing secret used to sign every delivery so the receiver can
        // verify authenticity. Never ships with a normal query result -
        // mirrors OAuthClient.clientSecretHash - only re-selected internally
        // by the delivery service.
        secret: {
            type: String,
            required: true,
            select: false,
        },

        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },

        // Circuit breaker: after too many consecutive failed deliveries the
        // subscription is auto-disabled so a dead/decommissioned endpoint
        // can't be hammered forever. Reset to 0 on any successful delivery.
        consecutiveFailures: {
            type: Number,
            default: 0,
        },

        disabledAt: { type: Date, default: null },
        disabledReason: { type: String, default: null },

        lastDeliveryAt: { type: Date, default: null },
        lastSuccessAt: { type: Date, default: null },
        lastFailureAt: { type: Date, default: null },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// A client shouldn't register the same URL twice.
webhookSubscriptionSchema.index({ oauthClient: 1, targetUrl: 1 }, { unique: true });

webhookSubscriptionSchema.statics.generateSecret = () =>
    `whsec_${crypto.randomBytes(24).toString("hex")}`;

webhookSubscriptionSchema.methods.toPublicJSON = function toPublicJSON() {
    return {
        id: this._id,
        oauthClient: this.oauthClient,
        targetUrl: this.targetUrl,
        events: this.events,
        description: this.description,
        isActive: this.isActive,
        consecutiveFailures: this.consecutiveFailures,
        disabledAt: this.disabledAt,
        disabledReason: this.disabledReason,
        lastDeliveryAt: this.lastDeliveryAt,
        lastSuccessAt: this.lastSuccessAt,
        lastFailureAt: this.lastFailureAt,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
    };
};

// Defence in depth: even a raw res.json(subscription) cannot leak the secret.
webhookSubscriptionSchema.set("toJSON", {
    virtuals: true,
    transform: (_doc, ret) => {
        delete ret.secret;
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model("WebhookSubscription", webhookSubscriptionSchema);