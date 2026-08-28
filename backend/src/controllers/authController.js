const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");
const generateToken = require("../utils/generateToken");
const { successResponse } = require("../utils/apiResponse");
const { ROLES } = require("../constants");

/**
 * POST /api/v1/auth/register
 *
 * Self-registration always creates an End User. Elevated roles are granted
 * only by an Admin through /api/v1/users - otherwise anyone could sign up as
 * an administrator by adding `"role": "admin"` to the request body.
 */
const register = asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;

    const existing = await User.findOne({ email: email.toLowerCase() });

    if (existing) {
        throw ApiError.conflict("An account with that email already exists");
    }

    // Hashing happens in the model's pre-save hook.
    const user = await User.create({
        name,
        email: email.toLowerCase(),
        password,
        role: ROLES.USER,
    });

    logger.event("user_registered", { userId: user.id, email: user.email });

    return successResponse(res, 201, "Registration successful", {
        user: user.toPublicJSON(),
        token: generateToken(user),
    });
});

/**
 * POST /api/v1/auth/login
 *
 * The same message is returned for an unknown email and a wrong password, so
 * the endpoint cannot be used to discover which addresses are registered.
 */
const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
        logger.event("login_failed", { email });
        throw ApiError.unauthorized("Invalid email or password");
    }

    if (!user.isActive) {
        throw ApiError.forbidden(
            "Your account has been deactivated. Please contact an administrator."
        );
    }

    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    logger.event("login_success", { userId: user.id, role: user.role });

    return successResponse(res, 200, "Login successful", {
        user: user.toPublicJSON(),
        token: generateToken(user),
    });
});

/**
 * GET /api/v1/auth/me
 * Used by the React app on boot to restore a session from a stored token.
 */
const getMe = asyncHandler(async (req, res) =>
    successResponse(res, 200, "Profile retrieved", { user: req.user.toPublicJSON() })
);

/** PATCH /api/v1/auth/me - a user updating their own display name. */
const updateProfile = asyncHandler(async (req, res) => {
    const { name } = req.body;

    req.user.name = name;
    await req.user.save();

    return successResponse(res, 200, "Profile updated", {
        user: req.user.toPublicJSON(),
    });
});

/** PATCH /api/v1/auth/me/password - requires the current password. */
const changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select("+password");

    if (!(await user.comparePassword(currentPassword))) {
        throw ApiError.badRequest("Your current password is incorrect");
    }

    if (currentPassword === newPassword) {
        throw ApiError.badRequest("The new password must be different from the current one");
    }

    user.password = newPassword;
    await user.save();

    logger.event("password_changed", { userId: user.id });

    // A fresh token keeps the client signed in after the change.
    return successResponse(res, 200, "Password updated successfully", {
        token: generateToken(user),
    });
});

module.exports = { register, login, getMe, updateProfile, changePassword };
