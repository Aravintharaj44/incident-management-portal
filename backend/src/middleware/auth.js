const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { verifyToken } = require("../utils/generateToken");

const extractToken = (req) => {
    const header = req.headers.authorization;

    if (header && header.startsWith("Bearer ")) {
        return header.slice(7).trim();
    }

    // Allows attachment downloads to be opened directly in a new browser tab,
    // where custom headers cannot be set.
    if (req.query && typeof req.query.token === "string") {
        return req.query.token;
    }

    return null;
};

/**
 * Rejects the request unless it carries a valid token for an existing, active
 * user. On success `req.user` is a full Mongoose document (without the
 * password) that downstream handlers can rely on.
 */
const protect = asyncHandler(async (req, _res, next) => {
    const token = extractToken(req);

    if (!token) {
        throw ApiError.unauthorized("Authentication required");
    }

    let decoded;
    try {
        decoded = verifyToken(token);
    } catch (error) {
        const message =
            error.name === "TokenExpiredError"
                ? "Your session has expired, please log in again"
                : "Invalid authentication token";
        throw ApiError.unauthorized(message);
    }

    // Freshly loaded on every request: deactivating a user takes effect
    // immediately instead of at token expiry.
    const user = await User.findById(decoded.id);

    if (!user) {
        throw ApiError.unauthorized("This account no longer exists");
    }

    if (!user.isActive) {
        throw ApiError.forbidden("Your account has been deactivated");
    }

    req.user = user;
    next();
});

module.exports = protect;
module.exports.protect = protect;
