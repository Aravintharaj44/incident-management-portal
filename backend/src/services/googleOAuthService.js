const crypto = require("node:crypto");
const { OAuth2Client } = require("google-auth-library");
const { env } = require("../config/env");
require("dotenv").config();


const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes - long enough to click through Google.

/** sub/email/name of a verified Google identity. Never includes secrets. */
const buildAuthUrl = (state) => {
    const client = new OAuth2Client(
        env.google.clientId,
        env.google.clientSecret,
        env.google.redirectUri
    );

    return client.generateAuthUrl({
        scope: ["openid", "email", "profile"],
        access_type: "online",
        redirect_uri: env.google.redirectUri,
        state,
    });
};

/** Exchanges the one-time authorization code for Google tokens. */
const exchangeCodeForTokens = async (code) => {
    const client = new OAuth2Client(
        env.google.clientId,
        env.google.clientSecret,
        env.google.redirectUri
    );

    const { tokens } = await client.getToken({
        code,
        redirect_uri: env.google.redirectUri,
    });

    return tokens;
};

/**
 * Verifies the ID token and returns the Google-verified identity claims.
 * Throws on any signature/audience/expiry failure, so the caller can treat the
 * result as trustworthy without re-checking.
 */
const verifyIdToken = async (idToken) => {
    const client = new OAuth2Client(
        env.google.clientId,
        env.google.clientSecret,
        env.google.redirectUri
    );

    const login = await client.verifyIdToken({
        idToken,
        audience: env.google.clientId,
    });

    const payload = login.getPayload();
    if (!payload) {
        throw new Error("Google ID token carries no identity payload");
    }

    return {
        // "sub" - the stable Google subject identifier for the account.
        sub: payload.sub || null,
        email: payload.email || null,
        emailVerified: payload.email_verified === true,
        name: payload.name || "",
        picture: payload.picture || null,
    };
};

/**
 * True only when the server has all credentials required for an OAuth code
 * flow. Keep this side-effect free: logging here previously became the arrow
 * function's return value because of automatic semicolon insertion, which
 * made Google sign-in look unconfigured even with valid environment values.
 */
const isConfigured = () =>
    Boolean(
        env.google.clientId.trim() &&
        env.google.clientSecret.trim() &&
        env.google.redirectUri.trim()
    );

// const isConfigured = () => {
//     console.log("===== isConfigured() =====");

//     console.log({
//         clientId: !!env.google.clientId,
//         clientSecret: !!env.google.clientSecret,
//         redirectUri: !!env.google.redirectUri,
//         redirectUriValue: env.google.redirectUri,
//     });

//     const configured = Boolean(
//         env.google.clientId &&
//         env.google.clientSecret &&
//         env.google.redirectUri
//     );

//     console.log("Google OAuth configured:", configured);

//     return configured;
// };

/**
 * In-memory single-use state store with TTL. A Map keyed by the random state;
 * served once and removed. Survives only inside a single server process, which
 * is fine for this deployment; production multi-instance setups should move
 * this to a shared store (Redis).
 */
const stateStore = new Map();

const createState = () => {
    const value = crypto.randomBytes(32).toString("hex");
    stateStore.set(value, Date.now() + STATE_TTL_MS);
    return value;
};

/** Returns true once, for a state that exists and has not expired. */
const consumeState = (state) => {
    if (typeof state !== "string" || state.length === 0) return false;

    const expiresAt = stateStore.get(state);
    if (expiresAt === undefined) return false;

    stateStore.delete(state); // single-use

    if (expiresAt < Date.now()) return false; // past TTL

    return true;
};

/** Test/ops hook: clear leftover states (never called at runtime). */
const clearStates = () => stateStore.clear();


module.exports = {
    buildAuthUrl,
    exchangeCodeForTokens,
    verifyIdToken,
    isConfigured,
    createState,
    consumeState,
    clearStates,
    STATE_TTL_MS,
};