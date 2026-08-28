const mongoose = require("mongoose");
const { NOTIFICATION_TYPES } = require("../constants");

/**
 * In-app notification shown in the header bell (FR-09).
 * Email delivery is best-effort and may be disabled; these rows are the
 * reliable half of the notification requirement.
 */
const notificationSchema = new mongoose.Schema(
    {
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        type: {
            type: String,
            enum: Object.values(NOTIFICATION_TYPES),
            required: true,
        },

        title: { type: String, required: true },
        body: { type: String, default: "" },

        incident: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Incident",
            default: null,
        },

        isRead: { type: Boolean, default: false, index: true },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

// Housekeeping: notifications expire after 60 days so the collection cannot
// grow without bound.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 60 });

module.exports = mongoose.model("Notification", notificationSchema);
