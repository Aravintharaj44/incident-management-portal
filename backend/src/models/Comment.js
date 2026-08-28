const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
    {
        incident: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Incident",
            required: true,
            index: true,
        },

        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        message: {
            type: String,
            required: [true, "Comment message is required"],
            trim: true,
            minlength: [1, "Comment cannot be empty"],
            maxlength: [2000, "Comment cannot exceed 2000 characters"],
        },

        /**
         * Internal notes are visible to Admins and Agents only - the reporter
         * of the incident never sees them.
         */
        isInternal: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

// Comments are always read newest-or-oldest-first within one incident.
commentSchema.index({ incident: 1, createdAt: 1 });

module.exports = mongoose.model("Comment", commentSchema);
