const mongoose = require("mongoose");

/**
 * Browser FCM registration tokens for web push notifications.
 *
 * Deliberately a separate collection from User so the User document is not
 * enlarged and one document per browser/device token keeps deactivation,
 * lastSeenAt tracking and multi-device support simple.
 *
 * `token` is globally unique: an FCM token identifies exactly one device
 * subscription, so re-registering the same token from a different account
 * transfers ownership to the current user (standard FCM token lifecycle).
 */
const pushTokenSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        token: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        platform: {
            type: String,
            enum: ["web"],
            default: "web",
        },
        userAgent: {
            type: String,
            default: "",
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
        lastSeenAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

pushTokenSchema.index({ userId: 1, isActive: 1 });

module.exports = mongoose.model("PushToken", pushTokenSchema);
