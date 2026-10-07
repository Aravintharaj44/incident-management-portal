const mongoose = require("mongoose");

const remoteSessionSchema = new mongoose.Schema(
    {
        requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        targetUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        incident: { type: mongoose.Schema.Types.ObjectId, ref: "Incident", default: null },

        status: {
            type: String,
            enum: ["pending", "accepted", "declined", "ended", "expired"],
            default: "pending",
            index: true,
        },

        respondedAt: { type: Date, default: null },
        endedAt: { type: Date, default: null },
        endedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

// A pending request auto-expires after 2 minutes if the user never responds.
remoteSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 300, partialFilterExpression: { status: "pending" } });

module.exports = mongoose.model("RemoteSession", remoteSessionSchema);