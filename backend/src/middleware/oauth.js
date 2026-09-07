const OAuthClient = require("../models/OAuthClient");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const {
    verifyAccessToken,
    ACCESS_TOKEN_TYPE,
} = require("../services/oauthService");

/** Pulls the bearer token out of the Authorization header (header only). */
const extractBearerToken = (req) => {
    const header = req.headers.authorization;
    if (header && header.startsWith("Bearer ")) {
        return header.slice(7).trim();
    }
    return null;
};

const requireValidAccessToken = (res, message) => {
    res.setHeader("WWW-Authenticate", 'Bearer error="invalid_token"');
    throw ApiError.unauthorized(message);
};

/**
 * FR5-02 - authenticates a request using an OAuth 2.0 client-credentials
 * access token (issued by POST /api/v1/oauth/token).
 *
 * On success:
 *   req.oauthClient = safe public representation of the OAuthClient
 *   req.oauth       = { clientId, token, issuedAt, expiresAt }
 *   req.user        = the client's linked service-account User
 *
 * The client and its user are freshly loaded on every request, so revoking a
 * client or deactivating the service account takes effect immediately.
 */
const oauthProtect = asyncHandler(async (req, res, next) => {
    const token = extractBearerToken(req);

    if (!token) {
        requireValidAccessToken(res, "Invalid or expired access token");
    }

    let decoded;
    try {
        decoded = verifyAccessToken(token);
    } catch {
        requireValidAccessToken(res, "Invalid or expired access token");
    }

    if (
        !decoded ||
        typeof decoded !== "object" ||
        decoded.typ !== ACCESS_TOKEN_TYPE ||
        !decoded.client_id
    ) {
        requireValidAccessToken(res, "Invalid or expired access token");
    }

    const client = await OAuthClient.findOne({ clientId: decoded.client_id });

    if (!client || !client.isActive) {
        requireValidAccessToken(res, "Invalid or expired access token");
    }

    const user = await User.findById(client.user);

    if (!user) {
        requireValidAccessToken(
            res,
            "The service account for this OAuth client no longer exists"
        );
    }

    if (!user.isActive) {
        requireValidAccessToken(
            res,
            "The service account for this OAuth client is deactivated"
        );
    }

    req.oauthClient = client.toPublicJSON();
    req.oauth = {
        clientId: client.clientId,
        token: decoded,
        issuedAt: decoded.iat,
        expiresAt: decoded.exp,
    };
    req.user = user;
    next();
});

module.exports = oauthProtect;
module.exports.oauthProtect = oauthProtect;
module.exports.extractBearerToken = extractBearerToken;