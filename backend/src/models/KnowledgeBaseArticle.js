const mongoose = require("mongoose");
const { KBA_STATUS, KBA_STATUS_VALUE } = require("../constants");

const knowledgeBaseArticleSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, "Title is required"],
        trim: true,
        minlength: [3, "Title must be at least 3 characters"],
        maxlength: [250, "Title cannot exceed 250 characters"],
    },
    body: {
        type: String,
        required: [true, "Body is required"],
        trim: true,
        minlength: [10, "Body must be at least 10 characters"],
    },
    categories: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: "Category",
        required: [true, "At least one category is required"],
        validate: {
            validator: function (v) {
                return Array.isArray(v) && v.length > 0;
            },
            message: "At least one category is required",
        },
    },
    tags: {
        type: [String],
        default: [],
    },
    authorID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: [true, "Author is required"],
        index: true,
    },
    helpfulCount: {
        type: Number,
        default: 0,
        min: [0, "Helpful count cannot be negative"],
    },
    notHelpfulCount: {
        type: Number,
        default: 0,
        min: [0, "Not helpful count cannot be negative"],
    },
    status: {
        type: String,
        enum: KBA_STATUS_VALUE,
        default: KBA_STATUS.DRAFT,
        index: true,
    },
    deletedAt: {
        type: Date,
        default: null,
        index: true,
    },
},
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

knowledgeBaseArticleSchema.index(
    { title: "text", body: "text", tags: "text" },
    { weights: { title: 10, tags: 5, body: 1 }, name: "kb_text_search" }
);

knowledgeBaseArticleSchema.pre('find', function () {
    if (!this._includeDeleted) {
        this.where({ deletedAt: null });
    }
});

knowledgeBaseArticleSchema.pre('findOne', function () {
    if (!this._includeDeleted) {
        this.where({ deletedAt: null });
    }
});

knowledgeBaseArticleSchema.pre('countDocuments', function () {
    if (!this._includeDeleted) {
        this.where({ deletedAt: null });
    }
});

module.exports = mongoose.model("KnowledgeBaseArticle", knowledgeBaseArticleSchema);
