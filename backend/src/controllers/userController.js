const User = require("../models/User");
const Incident = require("../models/Incident");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");
const { containsPattern } = require("../utils/escapeRegex");
const { successResponse, paginatedResponse } = require("../utils/apiResponse");
const { getPagination } = require("../utils/pagination");
const { ROLES, ROLE_VALUES, TERMINAL_STATUSES } = require("../constants");

/**
 * GET /api/v1/users  (Admin only) - FR-13
 * Keyword search plus role/status filters, paginated.
 */
const listUsers = asyncHandler(async (req, res) => {
    const { search, role, isActive } = req.query;
    const { page, limit, skip } = getPagination(req.query, { defaultLimit: 10 });

    const filter = {};

    if (search) {
        const pattern = containsPattern(search);
        filter.$or = [{ name: pattern }, { email: pattern }];
    }

    if (role && ROLE_VALUES.includes(role)) filter.role = role;
    if (isActive === "true") filter.isActive = true;
    if (isActive === "false") filter.isActive = false;

    const [users, total] = await Promise.all([
        User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        User.countDocuments(filter),
    ]);

    return paginatedResponse(res, "Users retrieved", users, { page, limit, total });
});

/**
 * GET /api/v1/users/assignable
 *
 * Populates the "Assign to" dropdown. Available to Admins and Agents (an Agent
 * needs it to reassign within the team) and returns only id/name/email/role -
 * never the full user records.
 */
const listAssignableUsers = asyncHandler(async (_req, res) => {
    const agents = await User.find({
        role: { $in: [ROLES.AGENT, ROLES.ADMIN] },
        isActive: true,
    })
        .select("name email role")
        .sort({ name: 1 })
        .lean();

    return successResponse(res, 200, "Assignable users retrieved", { users: agents });
});

/** GET /api/v1/users/:id  (Admin only) - profile plus a workload summary. */
const getUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);

    if (!user) throw ApiError.notFound("User not found");

    const [reported, assigned, openAssigned] = await Promise.all([
        Incident.countDocuments({ reportedBy: user._id }),
        Incident.countDocuments({ assignedTo: user._id }),
        Incident.countDocuments({
            assignedTo: user._id,
            status: { $nin: TERMINAL_STATUSES },
        }),
    ]);

    return successResponse(res, 200, "User retrieved", {
        user: user.toPublicJSON(),
        stats: { reported, assigned, openAssigned },
    });
});

/** POST /api/v1/users  (Admin only) - create a user with any role. */
const createUser = asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body;

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) throw ApiError.conflict("An account with that email already exists");

    const user = await User.create({
        name,
        email: email.toLowerCase(),
        password,
        role: role || ROLES.USER,
    });

    logger.event("user_created", { userId: user.id, role: user.role, by: req.user.id });

    return successResponse(res, 201, "User created", { user: user.toPublicJSON() });
});

/** PATCH /api/v1/users/:id  (Admin only) - name, role and active flag. */
const updateUser = asyncHandler(async (req, res) => {
    const { name, role, isActive } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) throw ApiError.notFound("User not found");

    const isSelf = String(user._id) === String(req.user._id);

    // Guard rails so an admin cannot lock themselves out of the system.
    if (isSelf && role && role !== user.role) {
        throw ApiError.badRequest("You cannot change your own role");
    }

    if (isSelf && isActive === false) {
        throw ApiError.badRequest("You cannot deactivate your own account");
    }

    // Demoting or deactivating an agent must not orphan their open work.
    const losingAgentDuties =
        (role && role === ROLES.USER && user.role !== ROLES.USER) || isActive === false;

    if (losingAgentDuties) {
        const openWork = await Incident.countDocuments({
            assignedTo: user._id,
            status: { $nin: TERMINAL_STATUSES },
        });

        if (openWork > 0) {
            throw ApiError.badRequest(
                `${user.name} still has ${openWork} open incident(s) assigned. ` +
                    "Reassign them before changing this account."
            );
        }
    }

    if (name !== undefined) user.name = name;
    if (role !== undefined) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();

    logger.event("user_updated", { userId: user.id, by: req.user.id });

    return successResponse(res, 200, "User updated", { user: user.toPublicJSON() });
});

/** PATCH /api/v1/users/:id/password  (Admin only) - administrative reset. */
const resetUserPassword = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select("+password");
    if (!user) throw ApiError.notFound("User not found");

    user.password = req.body.newPassword;
    await user.save();

    logger.event("password_reset_by_admin", { userId: user.id, by: req.user.id });

    return successResponse(res, 200, `Password reset for ${user.name}`);
});

/**
 * DELETE /api/v1/users/:id  (Admin only)
 *
 * Users are deactivated, never removed: incidents, comments and audit entries
 * reference them, and deleting the row would break that history.
 */
const deactivateUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw ApiError.notFound("User not found");

    if (String(user._id) === String(req.user._id)) {
        throw ApiError.badRequest("You cannot deactivate your own account");
    }

    const openWork = await Incident.countDocuments({
        assignedTo: user._id,
        status: { $nin: TERMINAL_STATUSES },
    });

    if (openWork > 0) {
        throw ApiError.badRequest(
            `${user.name} still has ${openWork} open incident(s) assigned. ` +
                "Reassign them before deactivating this account."
        );
    }

    user.isActive = false;
    await user.save();

    logger.event("user_deactivated", { userId: user.id, by: req.user.id });

    return successResponse(res, 200, `${user.name} has been deactivated`, {
        user: user.toPublicJSON(),
    });
});

module.exports = {
    listUsers,
    listAssignableUsers,
    getUser,
    createUser,
    updateUser,
    resetUserPassword,
    deactivateUser,
};
