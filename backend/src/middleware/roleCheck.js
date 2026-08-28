const ApiError = require("../utils/ApiError");

/**
 * Route-level role gate (FR-02).
 *
 * This is the authoritative check - the React app hides menu items for
 * convenience, but the decision is always made here on the server.
 *
 *   router.post("/", protect, authorize(ROLES.ADMIN), handler)
 */
const authorize =
    (...allowedRoles) =>
    (req, _res, next) => {
        if (!req.user) {
            return next(ApiError.unauthorized());
        }

        if (!allowedRoles.includes(req.user.role)) {
            return next(
                ApiError.forbidden(
                    "Your role does not have permission to perform this action"
                )
            );
        }

        return next();
    };

module.exports = authorize;
module.exports.authorize = authorize;
