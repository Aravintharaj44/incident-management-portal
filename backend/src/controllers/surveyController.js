const PostResolutionSurvey = require('../models/PostResolutionSurvey');
const asyncHandler = require("../utils/asyncHandler");
const {SURVEY_STATUS} = require('../constants');
const ApiError = require('../utils/ApiError');
const { successResponse } = require("../utils/apiResponse");

const submitSurvey = asyncHandler(async (req, res) => {
    const { token } = req.params;
    const { rating, comments } = req.body;

    const survey = await PostResolutionSurvey.findOne({ token });

    if (!survey) {
        throw ApiError.notFound("Survey not found or link is invalid");
    }

    if (survey.status === SURVEY_STATUS.COMPLETED) {
        throw ApiError.badRequest(
            "This survey has already been submitted"
        );
    }

    survey.rating = rating;
    survey.comments = comments || "";
    survey.status = SURVEY_STATUS.COMPLETED;
    survey.submittedAt = new Date();

    await survey.save();

    return successResponse(res, 200, "Thank you for your feedback", {
        survey: {
            id: survey._id,
            rating: survey.rating,
            comments: survey.comments,
            status: survey.status,
            submittedAt: survey.submittedAt,
        },
    });
});
const getSurvey = asyncHandler(async (req, res) => {
    const { token } = req.params;

    const survey = await PostResolutionSurvey.findOne({
        token,
    })
        .populate("incident", "incidentNumber title status")
        .lean();

    if (!survey) {
        throw ApiError.notFound("Survey not found or link is invalid");
    }

    if (survey.status === SURVEY_STATUS.COMPLETED) {
        return successResponse(res, 200, "Survey already completed", {
            survey: {
                incident: survey.incident,
                status: survey.status,
            },
        });
    }

    return successResponse(res, 200, "Survey retrieved", {
        survey: {
            incident: survey.incident,
            status: survey.status,
        },
    });
});
module.exports={
    submitSurvey ,
    getSurvey 
}