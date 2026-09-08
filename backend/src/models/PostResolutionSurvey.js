const mongoose = require("mongoose");
const { SURVEY_STATUS_VALUE, SURVEY_STATUS } = require("../constants");

const postResolutionSurveySchema = new mongoose.Schema(
    {
        incident: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Incident",
            required: [true, "Incident is required"],
            unique: true,
            index: true,
        },

        reporterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Reporter is required"],
            index: true,
        },
         agentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true,
        },
        // Team/Department responsible for the incident
        departmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Department",
            default: null,
            index: true,
        },
        // Category at the time the survey was generated (FR4-27 historical attribution)
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            default: null,
            index: true,
        },

        rating: {
            type: Number,
            default: null,
            min: [1, "Rating must be at least 1"],
            max: [5, "Rating cannot exceed 5"],
        },

        comments: {
            type: String,
            trim: true,
            maxlength: [5000, "Comments cannot exceed 5000 characters"],
            default: "",
        },

        token: {
            type: String,
            required: [true, "Token is required"],
            unique: true,
            index: true,
        },

        status: {
            type: String,
            enum: SURVEY_STATUS_VALUE,
            default: SURVEY_STATUS.PENDING,
            index: true,
        },

        sentAt: {
            type: Date,
            default: null,
        },

        submittedAt: {
            type: Date,
            default: null,
        },

        // FR4-29: flagged when rating < configurable threshold
        requiresFollowUp: {
            type: Boolean,
            default: false,
            index: true,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

postResolutionSurveySchema.index({ status: 1, rating: 1 });
postResolutionSurveySchema.index({ submittedAt: -1 });
postResolutionSurveySchema.index({ requiresFollowUp: 1, status: 1 });

module.exports = mongoose.model(
    "PostResolutionSurvey",
    postResolutionSurveySchema
);