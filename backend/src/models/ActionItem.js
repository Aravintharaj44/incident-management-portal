const mongoose = require("mongoose");

const {ACTION_ITEM_STATUS} = require('../constants');
const actionItemSchema = new mongoose.Schema(
    {
        rcaId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "RootCauseAnalysis",
            required: [true, "An action item must belong to an RCA"],
            index: true,
        },
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Owner is required"],
            index: true,
        },
        dueDate: {
            type: Date,
            required: [true, "Due date is required"],
            index: true,
        },
        description: {
            type: String,
            required: [true, "Description is required"],
            trim: true,
            minlength: [10, "Description must be at least 10 characters"],
            maxlength: [5000, "Description cannot exceed 5000 characters"],
        },
        completionNote: {
            type: String,
            trim: true,
            maxlength: [5000, "Completion note cannot exceed 5000 characters"],
        },
        status: {
            type: String,
            enum: ACTION_ITEM_STATUS,
            default: ACTION_ITEM_STATUS.OPEN,
            index: true,
        },
        // Scheduled-process housekeeping, mirrors Incident.overdueNotifiedAt so
        // the overdue/due-soon cron is safe to run repeatedly (FR4-08).
        overdueNotifiedAt: { type: Date, default: null, index: true },
        dueSoonNotifiedAt: { type: Date, default: null, index: true },
        // Set when the action item is marked Done, cleared on reopen. Used by
        // the dashboard widget (FR4-09) and closure evidence (FR4-10).
        completedAt: { type: Date, default: null, index: true },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

actionItemSchema.index({ dueDate: 1, status: 1 });
actionItemSchema.index({ ownerId: 1, status: 1 });
module.exports = mongoose.model("ActionItem", actionItemSchema);