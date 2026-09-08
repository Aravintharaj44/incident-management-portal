const express = require("express");

const { token } = require("../controllers/oauthController");

/**
 * FR5-02 - OAuth 2.0 endpoints.
 *
 * Mounted at /api/v1/oauth (see routes/index.js). Only the token endpoint
 * exists for the client-credentials grant; there are no authorization/refresh
 * endpoints in this feature.
 */
const router = express.Router();

router.post("/token", token);

module.exports = router;