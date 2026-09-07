const OAuthClient = require("../models/OAuthClient");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");
const { env } = require("../config/env");
const {
    CLIENT_CREDENTIALS_GRANT,
    verifyClientSecret,
    issueAccessToken,
} = require("../services/oauthService");

/**
 * RFC 6749 token-error response for the /oauth/token endpoint. This endpoint
 * deliberately answers with the OAuth standard `{ error, error_description }`
 * shape instead of the app envelope, because external OAuth clients parse it.
 */
const oauthError = (res, status, error, description) =>
    res.status(status).json({ error, error_description: description });

/** Parses an HTTP Basic Authorization header into { clientId, clientSecret }. */
const parseBasicCredentials = (req) => {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Basic ")) return null;

    try {
        const decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
        const separator = decoded.indexOf(":");
        if (separator === -1) return null;
        return {
            clientId: decoded.slice(0, separator),
            clientSecret: decoded.slice(separator + 1),
        };
    } catch {
        return null;
    }
};

/**
 * POST /api/v1/oauth/token
 *
 * FR5-02 client-credentials grant. Credentials may arrive via the preferred
 * HTTP Basic header and/or the `client_id`/`client_secret` form fields.
 * Success returns the standard `{ access_token, token_type, expires_in }`.
 */
const token = asyncHandler(async (req, res) => {
    const grantType = req.body && req.body.grant_type;

    if (!grantType) {
        return oauthError(res, 400, "invalid_request", "Missing grant_type parameter.");
    }

    if (grantType !== CLIENT_CREDENTIALS_GRANT) {
        return oauthError(
            res,
            400,
            "unsupported_grant_type",
            `The grant type "${grantType}" is not supported.`
        );
    }

    const basic = parseBasicCredentials(req);
    const clientId = basic ? basic.clientId : req.body.client_id;
    const clientSecret = basic ? basic.clientSecret : req.body.client_secret;

    if (!clientId || !clientSecret) {
        return oauthError(
            res,
            401,
            "invalid_client",
            "Client credentials are missing or invalid."
        );
    }

    const client = await OAuthClient.findOne({ clientId: String(clientId).trim() }).select(
        "+clientSecretHash"
    );

    // One generic message for unknown client, wrong secret and revoked client,
    // so the endpoint cannot be used to enumerate valid client ids.
    if (
        !client ||
        !(await verifyClientSecret(clientSecret, client.clientSecretHash)) ||
        !client.isActive
    ) {
        return oauthError(res, 401, "invalid_client", "Client credentials are invalid.");
    }

    const scope = typeof req.body.scope === "string" ? req.body.scope.trim().slice(0, 255) : "";

    const accessToken = issueAccessToken({ client, scope });

    logger.event("oauth_token_issued", { clientId: client.clientId });

    return res.status(200).json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: env.oauth.accessTokenExpiresIn,
    });
});

module.exports = { token };