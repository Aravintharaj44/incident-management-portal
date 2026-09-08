const { scopeSatisfies } = require("../services/oauthService");

/**
 * FR5-03 - Scope authorization middleware for OAuth 2.0 access tokens.
 *
 * For OAuth-authenticated requests the middleware checks whether the token's
 * granted scopes cover the `requiredScope`.  Portal JWT requests are passed
 * through without a scope check - their authorization is role-based and
 * handled by the existing permission layer in the controllers.
 *
 * Usage (after `authenticate` in the route chain):
 *
 *   router.get("/", requireOAuthScope("tickets.READ"), handler)
 *
 * When the scope is insufficient the response follows the app envelope:
 *   { success: false, message: "Insufficient OAuth scope", error: "insufficient_scope" }
 */
const requireOAuthScope = (requiredScope) => (req, res, next) => {
    // Portal JWT requests are not subject to OAuth scope checks.
    if (!req.oauth) return next();

    const rawScope = req.oauth.token && req.oauth.token.scope;
    const granted = typeof rawScope === "string" ? rawScope.trim().split(/\s+/).filter(Boolean) : [];

    if (scopeSatisfies(requiredScope, granted)) return next();

    res.setHeader("WWW-Authenticate", 'Bearer error="insufficient_scope"');
    return res.status(403).json({
        success: false,
        message: "Insufficient OAuth scope",
        error: "insufficient_scope",
    });
};

module.exports = requireOAuthScope;
module.exports.requireOAuthScope = requireOAuthScope;
