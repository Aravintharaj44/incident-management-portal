const Department = require("../models/Department");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

/**
 * Formats a Department document into the external Team DTO (FR5-06).
 * Only lookup-relevant fields are exposed - internal admin fields like
 * headOfDepartment stay out of the external API surface.
 */
const formatTeam = (department) => ({
    id: department._id,
    name: department.title,
    description: department.description,
    isActive: department.isActive,
    categories: (department.categories || []).map((category) => ({
        id: category._id,
        name: category.name,
        description: category.description,
        isActive: category.isActive,
    })),
    createdAt: department.createdAt,
    updatedAt: department.updatedAt,
});

/**
 * GET /api/v1/teams
 * FR5-06 - read-only Departments/Teams lookup for external clients, so
 * integrators can resolve the team/category structure used by on-call
 * scheduling (V4) without touching the internal Admin CRUD endpoints.
 */
const listTeams = asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const query = {};

    if (req.query.isActive !== undefined) {
        query.isActive = req.query.isActive;
    }

    if (req.query.search) {
        const searchRegex = new RegExp(req.query.search, "i");
        query.title = searchRegex;
    }

    const [teams, total] = await Promise.all([
        Department.find(query)
            .populate("categories", "name description isActive")
            .skip(skip)
            .limit(limit)
            .sort({ title: 1 })
            .lean(),
        Department.countDocuments(query),
    ]);

    return res.status(200).json({
        success: true,
        message: "Teams retrieved successfully",
        data: teams.map(formatTeam),
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
        },
    });
});

/**
 * GET /api/v1/teams/:team_id
 * FR5-06 - fetches a single Department/Team by id.
 */
const getTeamById = asyncHandler(async (req, res) => {
    const { team_id } = req.params;

    const team = await Department.findById(team_id)
        .populate("categories", "name description isActive")
        .lean();

    if (!team) {
        throw ApiError.notFound("Team not found");
    }

    return res.status(200).json({
        success: true,
        message: "Team retrieved successfully",
        data: formatTeam(team),
    });
});

module.exports = {
    listTeams,
    getTeamById,
};