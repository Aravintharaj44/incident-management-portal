const crypto = require("node:crypto");
const { env } = require("../config/env");

const STATE_TTL_MS = 10 * 60 * 1000;

const buildAuthUrl = (state) => {
    const params = new URLSearchParams({
        scope: "AaaServer.profile.Read",
        client_id: env.zoho.clientId,
        response_type: "code",
        access_type: "online",
        redirect_uri: env.zoho.redirectUri,
        state,
        prompt: "consent",
    });

    return `${env.zoho.accountsUrl}/oauth/v2/auth?${params.toString()}`;
};

/** Exchanges the one-time authorization code for a Zoho access token. */
const exchangeCodeForTokens = async (code) => {
    const params = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: env.zoho.clientId,
        client_secret: env.zoho.clientSecret,
        redirect_uri: env.zoho.redirectUri,
        code,
    });

    const response = await fetch(`${env.zoho.accountsUrl}/oauth/v2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
        throw new Error(data.error || `Zoho token exchange failed (${response.status})`);
    }

    return data; // { access_token, refresh_token?, expires_in, ... }
};

/**
 * Fetches the Zoho-verified identity using the access token. Zoho's user-info
 * endpoint is the equivalent of Google's ID-token payload - it's what proves
 * the email actually belongs to the person who just authenticated.
 */
const fetchUserInfo = async (accessToken) => {
    const response = await fetch(`${env.zoho.accountsUrl}/oauth/user/info`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });

    const data = await response.json();

    if (!response.ok || !data.Email) {
        throw new Error("Zoho user-info request did not return a verified profile");
    }

    return {
        // ZUID - Zoho's stable per-account identifier, equivalent to Google's "sub".
        sub: data.ZUID ? String(data.ZUID) : null,
        email: data.Email || null,
        // Zoho only returns an email for an account it has already verified
        // ownership of during signup, so there is no separate "verified" flag
        // to check the way Google exposes email_verified.
        emailVerified: Boolean(data.Email),
        name: data.Display_Name || [data.First_Name, data.Last_Name].filter(Boolean).join(" "),
    };
};

const isConfigured = () =>
    Boolean(env.zoho.clientId && env.zoho.clientSecret && env.zoho.redirectUri);

const stateStore = new Map();

const createState = () => {
    const value = crypto.randomBytes(32).toString("hex");
    stateStore.set(value, Date.now() + STATE_TTL_MS);
    return value;
};

const consumeState = (state) => {
    if (typeof state !== "string" || state.length === 0) return false;

    const expiresAt = stateStore.get(state);
    if (expiresAt === undefined) return false;

    stateStore.delete(state);

    if (expiresAt < Date.now()) return false;

    return true;
};

const clearStates = () => stateStore.clear();

module.exports = {
    buildAuthUrl,
    exchangeCodeForTokens,
    fetchUserInfo,
    isConfigured,
    createState,
    consumeState,
    clearStates,
    STATE_TTL_MS,
};