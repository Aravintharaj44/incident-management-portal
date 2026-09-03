const mongoose = require("mongoose");

const articleFeedbackSchema = new mongoose.Schema(
    {
        articleId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "KnowledgeBaseArticle",
            required: [true, "Article ID is required"],
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "User ID is required"],
            index: true,
        },
        value: {
            type: String,
            enum: {
                values: ["helpful", "not_helpful"],
                message: "Value must be 'helpful' or 'not_helpful'",
            },
            required: [true, "Feedback value is required"],
        },
    },
    {
        timestamps: true,
    }
);

articleFeedbackSchema.index({ articleId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("ArticleFeedback", articleFeedbackSchema);
