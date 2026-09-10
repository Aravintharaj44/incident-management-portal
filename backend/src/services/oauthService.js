const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { env } = require("../config/env");
const { OAUTH_SCOPES } = require("../constants");

const SALT_ROUNDS = 10;

const ACCESS_TOKEN_TYPE = "access_token";

/** FR5-02 only implements the client-credentials grant. */
const CLIENT_CREDENTIALS_GRANT = "client_credentials";

const generateClientId = () => crypto.randomBytes(16).toString("hex");

const generateClientSecret = () => crypto.randomBytes(32).toString("base64url");

const hashClientSecret = (secret) => bcrypt.hash(secret, SALT_ROUNDS);

const verifyClientSecret = (secret, hash) => bcrypt.compare(secret, hash);

const issueAccessToken = ({
    client,
    scope = "",
    expiresIn = env.oauth.accessTokenExpiresIn,
}) =>
    jwt.sign(
        {
            sub: client.clientId,
            client_id: client.clientId,
            typ: ACCESS_TOKEN_TYPE,
            purpose: "api",
            scope,
        },
        env.oauth.accessTokenSecret,
        {
            issuer: env.oauth.issuer,
            audience: env.oauth.audience,
            expiresIn,
            jwtid: crypto.randomUUID(),
        }
    );

const verifyAccessToken = (token) =>
    jwt.verify(token, env.oauth.accessTokenSecret, {
        algorithms: ["HS256"],
        issuer: env.oauth.issuer,
        audience: env.oauth.audience,
    });

const parseScopes = (raw) => {
    if (typeof raw !== "string") return [];
    return raw.trim().split(/\s+/).filter(Boolean);
};

const scopeSatisfies = (required, granted) => {
    const set = new Set(granted);
    if (set.has(required)) return true;
    if (required === OAUTH_SCOPES.TICKETS_READ && set.has(OAUTH_SCOPES.TICKETS_ALL)) return true;
    if (required === OAUTH_SCOPES.TICKETS_WRITE && set.has(OAUTH_SCOPES.TICKETS_ALL)) return true;
    return false;
};

module.exports = {
    ACCESS_TOKEN_TYPE,
    CLIENT_CREDENTIALS_GRANT,
    generateClientId,
    generateClientSecret,
    hashClientSecret,
    verifyClientSecret,
    issueAccessToken,
    verifyAccessToken,
    parseScopes,
    scopeSatisfies,
};