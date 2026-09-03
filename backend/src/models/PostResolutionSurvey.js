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
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

module.exports = mongoose.model(
    "PostResolutionSurvey",
    postResolutionSurveySchema
);