const express = require("express");

const { token } = require("../controllers/oauthController");
const clientRoutes = require("./clientRoutes");
const webhookSubscriptionRoutes = require("./Webhooksubscriptionroutes");

/**
 * FR5-02 - OAuth 2.0 endpoints.
 *
 * Mounted at /api/v1/oauth (see routes/index.js). Only the token endpoint
 * exists for the client-credentials grant; there are no authorization/refresh
 * endpoints in this feature.
 *
 * FR5-10 mounts the admin-only client management routes at /clients.
 * Outbound webhook subscriptions (a client subscribing a callback URL to
 * ticket lifecycle events) are mounted at /webhooks - distinct from the
 * top-level /api/v1/webhooks/monitoring/:vendor receiver, which is an
 * unrelated inbound-alerts feature.
 */
const router = express.Router();

router.post("/token", token);

// FR5-10 - OAuth client management (admin-only), /api/v1/oauth/clients.
router.use("/clients", clientRoutes);

// Outbound webhook subscriptions (admin-only), /api/v1/oauth/webhooks.
router.use("/webhooks", webhookSubscriptionRoutes);

module.exports = router;