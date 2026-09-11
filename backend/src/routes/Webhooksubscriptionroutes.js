const express = require("express");
const protect = require("../middleware/auth");
const authorize = require("../middleware/roleCheck");
const { ROLES } = require("../constants");
const controller = require("../controllers/Webhooksubscriptioncontroller");

const router = express.Router();

/**
 * Outbound webhook SUBSCRIPTIONS (FR - "API clients can subscribe a callback
 * URL to ticket lifecycle events").
 *
 * This is unrelated to routes/webhookRoutes.js, which receives INBOUND
 * monitoring alerts (Datadog/Alertmanager) via HMAC-verified POSTs. That
 * file is untouched. This router is mounted under /oauth (see oauthRoutes.js)
 * so there is no path collision with the existing /webhooks/monitoring/:vendor
 * receiver.
 *
 * Every route here is admin-only, same as OAuth client management.
 */
router.use(protect, authorize(ROLES.ADMIN));

router.get("/", controller.listWebhooks);
router.post("/", controller.createWebhook);
router.get("/:id", controller.getWebhook);
router.patch("/:id", controller.updateWebhook);
router.delete("/:id", controller.deleteWebhook);
router.post("/:id/rotate-secret", controller.rotateWebhookSecret);
router.get("/:id/deliveries", controller.listDeliveries);

module.exports = router;