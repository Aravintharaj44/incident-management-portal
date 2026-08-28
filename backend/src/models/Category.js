const mongoose = require("mongoose");

/**
 * Master list of incident categories, managed by an Admin (FR-13).
 * Kept as its own collection rather than a hard-coded enum so the list can be
 * extended without a code change.
 */
const categorySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Category name is required"],
            trim: true,
            maxlength: [60, "Category name cannot exceed 60 characters"],
        },

        description: {
            type: String,
            trim: true,
            maxlength: [200, "Description cannot exceed 200 characters"],
            default: "",
        },

        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    { timestamps: true }
);

// Case-insensitive uniqueness: "Network" and "network" are the same category.
categorySchema.index(
    { name: 1 },
    { unique: true, collation: { locale: "en", strength: 2 } }
);

module.exports = mongoose.model("Category", categorySchema);
