const express = require("express");
const { start, callback } = require("../controllers/googleAuthController");

/**
 * FR5-13 - Google OAuth 2.0 SSO. Mounted at the *app root* in app.js
 * (`app.use("/auth/google", thisRouter)`) because the configured
 * GOOGLE_REDIRECT_URI is `http://localhost:5000/auth/google/callback` and
 * Google requires an exact match on redirect URIs - it has no /api/v1 prefix.
 */
const router = express.Router();

// Public - browser-redirect flow. Both handlers respond with a 302, never JSON.
router.get("/", start);
router.get("/callback", callback);

module.exports = router;