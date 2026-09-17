const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");
const generateToken = require("../utils/generateToken");
const { env } = require("../config/env");
const { ROLES } = require("../constants");
const googleOAuthService = require("../services/googleOAuthService");


const FRONTEND_CALLBACK = () => `${env.frontendUrl.replace(/\/+$/, "")}/auth/google/callback`;


const redirectToFrontend = (res, params) => {
    const query = new URLSearchParams(params).toString();
    res.redirect(302, `${FRONTEND_CALLBACK()}?${query}`);
};


const start = asyncHandler(async (req, res) => {
    if (!googleOAuthService.isConfigured()) {
        logger.warn("google_oauth_start_blocked", {
            reason: "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not configured",
        });
        return redirectToFrontend(res, { error: "not_configured" });
    }
    

    const state = googleOAuthService.createState();
    const authUrl = googleOAuthService.buildAuthUrl(state);

    logger.event("google_oauth_started", { state });
    res.redirect(302, authUrl);
});

const callback = asyncHandler(async (req, res) => {
    const { state, code, error } = req.query;

    // 1. Google refused (user denied consent, etc.).
    if (error) {
        logger.warn("google_oauth_denied", { reason: String(error) });
        return redirectToFrontend(res, { error: "access_denied" });
    }

    // 2. State must be present and valid BEFORE any token exchange.
    if (!state) {
        logger.warn("google_oauth_state_missing");
        return redirectToFrontend(res, { error: "invalid_state" });
    }

    if (!googleOAuthService.consumeState(state)) {
        logger.warn("google_oauth_state_mismatch");
        return redirectToFrontend(res, { error: "invalid_state" });
    }

    // 3. A valid state but no code - malformed request.
    if (!code) {
        logger.warn("google_oauth_missing_code");
        return redirectToFrontend(res, { error: "invalid_request" });
    }

    // 4. Exchange the authorization code with Google. The Google access/refresh
    //    tokens returned here are discarded - the portal has no use for them.
    let tokens;
    try {
        tokens = await googleOAuthService.exchangeCodeForTokens(code);
    } catch (exchangeError) {
        logger.warn("google_oauth_token_exchange_failed", {
            message: exchangeError.message,
        });
        return redirectToFrontend(res, { error: "token_exchange_failed" });
    }

    if (!tokens || !tokens.id_token) {
        logger.warn("google_oauth_no_id_token");
        return redirectToFrontend(res, { error: "verification_failed" });
    }

    // 5. Verify the ID token (signature, issuer, audience, expiry).
    let identity;
    try {
        identity = await googleOAuthService.verifyIdToken(tokens.id_token);
    } catch (verifyError) {
        logger.warn("google_oauth_verification_failed", {
            message: verifyError.message,
        });
        return redirectToFrontend(res, { error: "verification_failed" });
    }

    // 6. Only a Google-verified email may be used to match the app user.
    //    Never trust an address supplied by the browser.
    if (!identity.sub || !identity.email || !identity.emailVerified) {
        logger.warn("google_oauth_unverified_email", {
            sub: identity.sub,
            email: identity.email,
            emailVerified: identity.emailVerified,
        });
        return redirectToFrontend(res, { error: "unverified_email" });
    }

    const email = identity.email.toLowerCase();

    // 7. Match the Google identity to an application user.
    const completeLogin = async (user) => {
        if (!user.isActive) {
            logger.warn("google_oauth_account_inactive", { userId: user.id });
            return redirectToFrontend(res, { error: "account_inactive" });
        }

        user.lastLoginAt = new Date();
        await user.save({ validateBeforeSave: false });

        logger.event("google_login_success", { userId: user.id, role: user.role });

        // The existing portal JWT - identical to what /auth/login returns.
        return redirectToFrontend(res, { token: generateToken(user) });
    };

    // A) Existing user already linked to this Google account.
    let user = await User.findOne({ googleId: identity.sub });
    if (user) return completeLogin(user);

    // B) Existing user with a matching verified email - link safely, preserving
    //    role/status/permissions. Never creates a duplicate account.
    user = await User.findOne({ email });
    if (user) {
        if (user.googleId && user.googleId !== identity.sub) {
            logger.warn("google_oauth_account_linked_elsewhere", { userId: user.id });
            return redirectToFrontend(res, { error: "email_in_use" });
        }
        user.googleId = identity.sub;
        return completeLogin(user);
    }

    // C) No matching user - follow the app's account-creation policy: an open
    //    self-registration portal, so provision a plain End User. Elevated
    //    roles are NEVER granted from Google claims.
    const fallbackName = email.split("@")[0].replace(/[^a-zA-Z0-9._\-\s]/g, "");
    try {
        user = await User.create({
            name: (identity.name || fallbackName || "Google User").trim().slice(0, 80),
            email,
            // Unknowable to the user - keeps the schema's required password
            // invariant while making password login impossible for this account.
            password: require("node:crypto").randomBytes(48).toString("hex"),
            role: ROLES.USER,
            isActive: true,
            authProvider: "google",
            googleId: identity.sub,
        });
    } catch (createError) {
        // Race: another request created this Google identity or email first.
        if (createError && createError.code === 11000) {
            const field = Object.keys(createError.keyValue || {})[0] || "account";
            logger.warn("google_oauth_create_conflict", { field: String(field) });
            return redirectToFrontend(res, { error: "email_in_use" });
        }
        throw createError;
    }

    return completeLogin(user);
});

module.exports = { start, callback };