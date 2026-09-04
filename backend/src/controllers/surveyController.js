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

const getCsatStats = asyncHandler(async (req, res) => {
    const stats = await PostResolutionSurvey.aggregate([
        { $match: { status: SURVEY_STATUS.COMPLETED, rating: { $ne: null } } },
        {
            $lookup: {
                from: "incidents",
                localField: "incident",
                foreignField: "_id",
                as: "incident",
            },
        },
        { $unwind: "$incident" },
        {
            $facet: {
                byAgent: [
                    { $match: { "incident.assignedTo": { $ne: null } } },
                    {
                        $group: {
                            _id: "$incident.assignedTo",
                            avgRating: { $avg: "$rating" },
                            responseCount: { $sum: 1 },
                        },
                    },
                    {
                        $lookup: {
                            from: "users",
                            localField: "_id",
                            foreignField: "_id",
                            as: "agent",
                        },
                    },
                    { $unwind: "$agent" },
                    {
                        $project: {
                            _id: 0,
                            agentId: "$_id",
                            agentName: "$agent.name",
                            avgRating: { $round: ["$avgRating", 2] },
                            responseCount: 1,
                        },
                    },
                    { $sort: { avgRating: -1 } },
                ],
                byDepartment: [
                    { $match: { "incident.department": { $ne: null } } },
                    {
                        $group: {
                            _id: "$incident.department",
                            avgRating: { $avg: "$rating" },
                            responseCount: { $sum: 1 },
                        },
                    },
                    {
                        $lookup: {
                            from: "departments",
                            localField: "_id",
                            foreignField: "_id",
                            as: "department",
                        },
                    },
                    { $unwind: "$department" },
                    {
                        $project: {
                            _id: 0,
                            departmentId: "$_id",
                            departmentName: "$department.title",
                            avgRating: { $round: ["$avgRating", 2] },
                            responseCount: 1,
                        },
                    },
                    { $sort: { avgRating: -1 } },
                ],
                byCategory: [
                    {
                        $group: {
                            _id: "$incident.category",
                            avgRating: { $avg: "$rating" },
                            responseCount: { $sum: 1 },
                        },
                    },
                    {
                        $lookup: {
                            from: "categories",
                            localField: "_id",
                            foreignField: "_id",
                            as: "category",
                        },
                    },
                    { $unwind: "$category" },
                    {
                        $project: {
                            _id: 0,
                            categoryId: "$_id",
                            categoryName: "$category.name",
                            avgRating: { $round: ["$avgRating", 2] },
                            responseCount: 1,
                        },
                    },
                    { $sort: { avgRating: -1 } },
                ],
                overall: [
                    {
                        $group: {
                            _id: null,
                            avgRating: { $avg: "$rating" },
                            responseCount: { $sum: 1 },
                        },
                    },
                    { $project: { _id: 0, avgRating: { $round: ["$avgRating", 2] }, responseCount: 1 } },
                ],
            },
        },
    ]);

    return successResponse(res, 200, "CSAT stats retrieved", {
        overall: stats[0].overall[0] || { avgRating: null, responseCount: 0 },
        byAgent: stats[0].byAgent,
        byDepartment: stats[0].byDepartment,
        byCategory: stats[0].byCategory,
    });
});

module.exports = {
    submitSurvey,
    getSurvey,
    getCsatStats,
};
