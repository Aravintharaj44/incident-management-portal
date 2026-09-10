const express = require('express');
const verifyWebhookSignature = require('../middleware/verifyWebhookSignature');
const { receiveWebhook } = require('../controllers/webhookController');

const router = express.Router();

/**
 * POST /api/webhooks/monitoring/datadog
 * POST /api/webhooks/monitoring/alertmanager
 * POST /api/webhooks/monitoring/generic
 *
 * express.raw() here (instead of the app-wide express.json()) is required
 * so verifyWebhookSignature can HMAC the exact bytes the sender signed.
 * This router should be mounted BEFORE the global express.json() middleware
 * runs on this path — see WIRING_GUIDE.md.
 */
router.post('/monitoring/:vendor', express.raw({ type: 'application/json', limit: '1mb' }), verifyWebhookSignature, receiveWebhook);

module.exports = router;
