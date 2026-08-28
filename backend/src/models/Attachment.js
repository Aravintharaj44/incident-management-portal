const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema(
    {
        incident: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Incident",
            required: true,
            index: true,
        },

        // Name as the user saw it on their machine.
        originalName: { type: String, required: true },

        // Randomised name on disk - prevents collisions and path traversal via
        // a crafted upload filename.
        storedName: { type: String, required: true },

        mimeType: { type: String, required: true },
        size: { type: Number, required: true },

        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    { timestamps: { createdAt: "uploadedAt", updatedAt: false } }
);

/**
 * Files are streamed through an authenticated download route rather than being
 * served straight off the static folder, so incident-level permissions apply
 * to attachments too.
 */
attachmentSchema.virtual("url").get(function url() {
    return `/api/v1/attachments/${this._id}/download`;
});

attachmentSchema.set("toJSON", { virtuals: true });
attachmentSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Attachment", attachmentSchema);
