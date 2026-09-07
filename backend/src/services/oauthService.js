const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { env } = require("../config/env");

const SALT_ROUNDS = 10;

/**
 * Token type claim. Portal JWTs are `{ id, iat, exp }`; OAuth access tokens
 * always carry `typ: "access_token"` and a `client_id` so the two kinds can be
 * told apart before verifying, and neither can satisfy the other's flow.
 */
const ACCESS_TOKEN_TYPE = "access_token";

/** FR5-02 only implements the client-credentials grant. */
const CLIENT_CREDENTIALS_GRANT = "client_credentials";

/**
 * Random, non-guessable client credentials. crypto.randomBytes is used - never
 * Math.random, timestamps or ObjectIds, which are not seeded for secrecy.
 */
const generateClientId = () => crypto.randomBytes(16).toString("hex");

const generateClientSecret = () => crypto.randomBytes(32).toString("base64url");

const hashClientSecret = (secret) => bcrypt.hash(secret, SALT_ROUNDS);

const verifyClientSecret = (secret, hash) => bcrypt.compare(secret, hash);

/**
 * Signs a short-lived OAuth access token.
 *
 * The token is deliberately distinct from a portal login JWT: it is signed
 * with the OAuth secret (never the portal secret), carries `typ`/`client_id`
 * instead of `id`, and pins issuer + audience which the verify side checks.
 * `scope` is preserved verbatim for FR5-03 but is NOT enforced yet.
 */
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

/**
 * Verifies and decodes an OAuth access token. Throws whatever jsonwebtoken
 * throws for signature/expiry/malformed input; callers map that to a 401.
 */
const verifyAccessToken = (token) =>
    jwt.verify(token, env.oauth.accessTokenSecret, {
        algorithms: ["HS256"],
        issuer: env.oauth.issuer,
        audience: env.oauth.audience,
    });

module.exports = {
    ACCESS_TOKEN_TYPE,
    CLIENT_CREDENTIALS_GRANT,
    generateClientId,
    generateClientSecret,
    hashClientSecret,
    verifyClientSecret,
    issueAccessToken,
    verifyAccessToken,
};