const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { ROLES } = require("../constants");
const onCallService = require("../services/onCallService");

/** Formats user document into standard Agent DTO */
const formatAgent = (user, activeOnCallUserIds = new Set()) => {
    const userIdStr = user._id.toString();
    const isOnCall = user.isActive && (
        Boolean(user.isOnCall) || 
        activeOnCallUserIds.has(userIdStr)
    );

    return {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        isOnCall,
        lastLoginAt: user.lastLoginAt || null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
};

/**
 * GET /api/v1/agents
 * Exposes a paginated list of agents along with on-call status.
 */
const listAgents = asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const query = {
        role: { $in: [ROLES.AGENT, ROLES.ADMIN] },
    };

    if (req.query.isActive !== undefined) {
        query.isActive = req.query.isActive;
    }

    if (req.query.search) {
        const searchRegex = new RegExp(req.query.search, "i");
        query.$or = [{ name: searchRegex }, { email: searchRegex }];
    }

    const [agents, total] = await Promise.all([
        User.find(query).skip(skip).limit(limit).sort({ name: 1 }),
        User.countDocuments(query),
    ]);

    let activeOnCallSet = new Set();
    try {
        if (typeof onCallService.getActiveOnCallUserIds === "function") {
            const ids = await onCallService.getActiveOnCallUserIds();
            activeOnCallSet = new Set(ids.map((id) => id.toString()));
        }
    } catch {
        // Fallback gracefully if schedule evaluation fails
    }

    return res.status(200).json({
        success: true,
        message: "Agents retrieved successfully",
        data: agents.map((agent) => formatAgent(agent, activeOnCallSet)),
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
        },
    });
});

/**
 * GET /api/v1/agents/:agent_id
 * Fetches an individual agent by ID.
 */
const getAgentById = asyncHandler(async (req, res) => {
    const { agent_id } = req.params;

    const agent = await User.findById(agent_id);

    if (!agent) {
        throw ApiError.notFound("Agent not found");
    }

    if (![ROLES.AGENT, ROLES.ADMIN].includes(agent.role)) {
        throw ApiError.notFound("Requested user is not an agent");
    }

    let activeOnCallSet = new Set();
    try {
        if (typeof onCallService.getActiveOnCallUserIds === "function") {
            const ids = await onCallService.getActiveOnCallUserIds();
            activeOnCallSet = new Set(ids.map((id) => id.toString()));
        }
    } catch {
        // Fallback gracefully
    }

    return res.status(200).json({
        success: true,
        message: "Agent retrieved successfully",
        data: formatAgent(agent, activeOnCallSet),
    });
});

module.exports = {
    listAgents,
    getAgentById,
};