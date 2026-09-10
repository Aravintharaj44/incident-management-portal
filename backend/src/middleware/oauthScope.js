const { scopeSatisfies } = require("../services/oauthService");

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
