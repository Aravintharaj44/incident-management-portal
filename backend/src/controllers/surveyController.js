const PostResolutionSurvey = require('../models/PostResolutionSurvey');
const Incident = require('../models/Incident');
const asyncHandler = require("../utils/asyncHandler");
const { SURVEY_STATUS } = require('../constants');
const ApiError = require('../utils/ApiError');
const { successResponse } = require("../utils/apiResponse");
const { env } = require("../config/env");
const logger = require("../utils/logger");

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

    // Defense-in-depth: validate rating even though the validator middleware
    // already enforces this, in case the route is ever called without validation.
    const parsedRating = Number(rating);
    if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
        throw ApiError.badRequest("Rating must be an integer between 1 and 5");
    }

    const threshold = env.csatFollowupThreshold;
    const requiresFollowUp = parsedRating < threshold;

    survey.rating = parsedRating;
    survey.comments = (typeof comments === "string" ? comments.trim() : "");
    survey.status = SURVEY_STATUS.COMPLETED;
    survey.submittedAt = new Date();
    survey.requiresFollowUp = requiresFollowUp;

    await survey.save();

    // Propagate the follow-up flag to the incident so managers can filter for it.
    if (requiresFollowUp) {
        try {
            await Incident.findByIdAndUpdate(survey.incident, {
                requiresFollowUp: true,
            });
        } catch (err) {
            // Best-effort: survey is already saved, do not fail the response.
            logger.error(`Failed to update incident follow-up flag: ${err.message}`);
        }
    }

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
                as: "incidentDoc",
            },
        },
        { $unwind: "$incidentDoc" },
        {
            // Add resolved snapshot fields with fallback to live incident values.
            $addFields: {
                resolvedAgentId: {
                    $ifNull: ["$agentId", "$incidentDoc.assignedTo"],
                },
                resolvedDepartmentId: {
                    $ifNull: ["$departmentId", "$incidentDoc.department"],
                },
                resolvedCategoryId: {
                    $ifNull: ["$categoryId", "$incidentDoc.category"],
                },
            },
        },
        {
            $facet: {
                byAgent: [
                    { $match: { resolvedAgentId: { $ne: null } } },
                    {
                        $group: {
                            _id: "$resolvedAgentId",
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
                    { $match: { resolvedDepartmentId: { $ne: null } } },
                    {
                        $group: {
                            _id: "$resolvedDepartmentId",
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
                    { $match: { resolvedCategoryId: { $ne: null } } },
                    {
                        $group: {
                            _id: "$resolvedCategoryId",
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
                followUpCount: [
                    { $match: { requiresFollowUp: true } },
                    { $count: "count" },
                ],
            },
        },
    ]);

    const followUpDoc = stats[0].followUpCount[0];

    return successResponse(res, 200, "CSAT stats retrieved", {
        overall: stats[0].overall[0] || { avgRating: null, responseCount: 0 },
        byAgent: stats[0].byAgent,
        byDepartment: stats[0].byDepartment,
        byCategory: stats[0].byCategory,
        followUpCount: followUpDoc ? followUpDoc.count : 0,
    });
});

const getCsatTrend = asyncHandler(async (req, res) => {
    const days = parseInt(req.query.days, 10) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const trend = await PostResolutionSurvey.aggregate([
        {
            $match: {
                status: SURVEY_STATUS.COMPLETED,
                rating: { $ne: null },
                submittedAt: { $gte: startDate },
            },
        },
        {
            $group: {
                _id: {
                    $dateToString: { format: "%Y-%m-%d", date: "$submittedAt" },
                },
                avgRating: { $avg: "$rating" },
                responseCount: { $sum: 1 },
            },
        },
        {
            $project: {
                _id: 0,
                date: "$_id",
                avgRating: { $round: ["$avgRating", 2] },
                responseCount: 1,
            },
        },
        { $sort: { date: 1 } },
    ]);

    return successResponse(res, 200, "CSAT trend retrieved", {
        trend,
    });
});

module.exports = {
    submitSurvey,
    getSurvey,
    getCsatStats,
    getCsatTrend,
};
