const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");
const generateToken = require("../utils/generateToken");
const { env } = require("../config/env");
const { ROLES } = require("../constants");
const zohoOAuthService = require("../services/zohoOAuthService");

const FRONTEND_CALLBACK = () => `${env.frontendUrl.replace(/\/+$/, "")}/auth/zoho/callback`;

const redirectToFrontend = (res, params) => {
    const query = new URLSearchParams(params).toString();
    res.redirect(302, `${FRONTEND_CALLBACK()}?${query}`);
};

/** GET /auth/zoho - starts the flow. */
const start = asyncHandler(async (req, res) => {
    if (!zohoOAuthService.isConfigured()) {
        logger.warn("zoho_oauth_start_blocked", {
            reason: "ZOHO_CLIENT_ID/ZOHO_CLIENT_SECRET not configured",
        });
        throw new ApiError(503, "Zoho sign-in is not configured by the administrator");
    }

    const state = zohoOAuthService.createState();
    const authUrl = zohoOAuthService.buildAuthUrl(state);

    logger.event("zoho_oauth_started", { state });
    res.redirect(302, authUrl);
});

/** GET /auth/zoho/callback */
const callback = asyncHandler(async (req, res) => {
    const { state, code, error } = req.query;

    if (error) {
        logger.warn("zoho_oauth_denied", { reason: String(error) });
        return redirectToFrontend(res, { error: "access_denied" });
    }

    if (!state) {
        logger.warn("zoho_oauth_state_missing");
        return redirectToFrontend(res, { error: "invalid_state" });
    }

    if (!zohoOAuthService.consumeState(state)) {
        logger.warn("zoho_oauth_state_mismatch");
        return redirectToFrontend(res, { error: "invalid_state" });
    }

    if (!code) {
        logger.warn("zoho_oauth_missing_code");
        return redirectToFrontend(res, { error: "invalid_request" });
    }

    let tokens;
    try {
        tokens = await zohoOAuthService.exchangeCodeForTokens(code);
    } catch (exchangeError) {
        logger.warn("zoho_oauth_token_exchange_failed", { message: exchangeError.message });
        return redirectToFrontend(res, { error: "token_exchange_failed" });
    }

    if (!tokens || !tokens.access_token) {
        logger.warn("zoho_oauth_no_access_token");
        return redirectToFrontend(res, { error: "verification_failed" });
    }

    let identity;
    try {
        identity = await zohoOAuthService.fetchUserInfo(tokens.access_token);
    } catch (verifyError) {
        logger.warn("zoho_oauth_verification_failed", { message: verifyError.message });
        return redirectToFrontend(res, { error: "verification_failed" });
    }

    if (!identity.sub || !identity.email || !identity.emailVerified) {
        logger.warn("zoho_oauth_unverified_email", {
            sub: identity.sub,
            email: identity.email,
        });
        return redirectToFrontend(res, { error: "unverified_email" });
    }

    const email = identity.email.toLowerCase();

    const completeLogin = async (user) => {
        if (!user.isActive) {
            logger.warn("zoho_oauth_account_inactive", { userId: user.id });
            return redirectToFrontend(res, { error: "account_inactive" });
        }

        user.lastLoginAt = new Date();
        await user.save({ validateBeforeSave: false });

        logger.event("zoho_login_success", { userId: user.id, role: user.role });

        return redirectToFrontend(res, { token: generateToken(user) });
    };

    // A) Existing user already linked to this Zoho account.
    let user = await User.findOne({ zohoId: identity.sub });
    if (user) return completeLogin(user);

    // B) Existing user with a matching email - link, preserve role/status.
    user = await User.findOne({ email });
    if (user) {
        if (user.zohoId && user.zohoId !== identity.sub) {
            logger.warn("zoho_oauth_account_linked_elsewhere", { userId: user.id });
            return redirectToFrontend(res, { error: "email_in_use" });
        }
        user.zohoId = identity.sub;
        return completeLogin(user);
    }

    // C) No matching user - provision a plain End User. Elevated roles are
    // never granted from an SSO claim.
    const fallbackName = email.split("@")[0].replace(/[^a-zA-Z0-9._\-\s]/g, "");
    try {
        user = await User.create({
            name: (identity.name || fallbackName || "Zoho User").trim().slice(0, 80),
            email,
            password: require("node:crypto").randomBytes(48).toString("hex"),
            role: ROLES.USER,
            isActive: true,
            authProvider: "zoho",
            zohoId: identity.sub,
        });
    } catch (createError) {
        if (createError && createError.code === 11000) {
            const field = Object.keys(createError.keyValue || {})[0] || "account";
            logger.warn("zoho_oauth_create_conflict", { field: String(field) });
            return redirectToFrontend(res, { error: "email_in_use" });
        }
        throw createError;
    }

    return completeLogin(user);
});

module.exports = { start, callback };