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
            default: null,
            index: true,
        },

        // V4 - Problem Management (FR4). An entry belongs to either an
        // incident (existing) or a problem. `incident` is nullable so
        // existing incident timelines are untouched while problem entries set
        // this optional reference instead.
        problem: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Problem",
            default: null,
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

/** Every audit entry must hang off an incident or a problem, never neither. */
activityLogSchema.pre("validate", function requireAnchor() {
    if (!this.incident && !this.problem) {
        this.invalidate("incident", "An activity entry must reference an incident or a problem");
    }
});

activityLogSchema.index({ incident: 1, createdAt: -1 });
activityLogSchema.index({ problem: 1, createdAt: -1 });

module.exports = mongoose.model("ActivityLog", activityLogSchema);
