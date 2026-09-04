const mongoose = require("mongoose");
const Counter = require("./Counter");
const {
    PROBLEM_STATUS,
    PROBLEM_STATUS_VALUES,
} = require("../constants");

/**
 * V4 - Problem Management (FR4-01).
 *
 * A Problem groups one or more related Incidents. Ownership lives on the
 * record (one owner drives it to resolution) and the whole thing reuses the
 * existing RCA structure through `rcaId`, so reporting stays consistent.
 */
const problemSchema = new mongoose.Schema(
    {
        // Human-readable reference shown in the UI, allocated like incident numbers.
        problemNumber: {
            type: String,
            unique: true,
            index: true,
        },

        title: {
            type: String,
            required: [true, "Title is required"],
            trim: true,
            minlength: [5, "Title must be at least 5 characters"],
            maxlength: [140, "Title cannot exceed 140 characters"],
        },

        description: {
            type: String,
            required: [true, "Description is required"],
            trim: true,
            minlength: [10, "Description must be at least 10 characters"],
            maxlength: [5000, "Description cannot exceed 5000 characters"],
        },

        status: {
            type: String,
            enum: PROBLEM_STATUS_VALUES,
            default: PROBLEM_STATUS.NEW,
            index: true,
        },

        // Derived from the linked incidents; set when the problem is created.
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            default: null,
            index: true,
        },

        // One owner (Admin or Support Agent) responsible for this problem.
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true,
        },

        // Reuses the existing RCA collection (FR4-06) - never a new structure.
        rcaId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "RootCauseAnalysis",
            default: null,
            index: true,
        },

        // Documented workaround surfaced in the Known Error Database (FR4-03).
        workaround: {
            type: String,
            trim: true,
            maxlength: [3000, "Workaround cannot exceed 3000 characters"],
            default: "",
        },

        // V4 - Knowledge Base linking (FR4-14). A problem may reference a
        // published KB article. Nullable so existing problems are unaffected.
        kbArticleId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "KnowledgeBaseArticle",
            default: null,
            index: true,
        },

        resolvedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

/** The related incidents, exposed as a virtual for detail screens. */
problemSchema.virtual("incidents", {
    ref: "Incident",
    localField: "_id",
    foreignField: "problemId",
});

problemSchema.pre("save", async function assignProblemNumber() {
    if (this.isNew && !this.problemNumber) {
        const seq = await Counter.next("problem");
        this.problemNumber = `PRB-${String(seq).padStart(6, "0")}`;
    }
});

module.exports = mongoose.model("Problem", problemSchema);
module.exports.PROBLEM_STATUS = PROBLEM_STATUS;
