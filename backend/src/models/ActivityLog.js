const mongoose = require("mongoose");
const { ACTIVITY_ACTIONS } = require("../constants");

/**
 * Append-only audit trail (FR-07, NFR Auditability).
 *
 * Entries are never updated or deleted by application code - the history of an
 * incident is the sequence of these documents.
 */
const activityLogSchema = new mongoose.Schema(
    {
        incident: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Incident",
            required: true,
            index: true,
        },

        action: {
            type: String,
            enum: Object.values(ACTIVITY_ACTIONS),
            required: true,
        },

        performedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        // Stored as display-ready strings so the history stays readable even if
        // a referenced category or user is later renamed or removed.
        field: { type: String, default: null },
        oldValue: { type: String, default: null },
        newValue: { type: String, default: null },

        note: { type: String, default: null },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
    }
);

activityLogSchema.index({ incident: 1, createdAt: -1 });

module.exports = mongoose.model("ActivityLog", activityLogSchema);
