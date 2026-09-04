const asyncHandler = require('../utils/asyncHandler');
const webhookAdapterService = require('../services/webhookAdapterService');
const intakeService = require('../services/intakeService');
const { INTAKE_SOURCE } = require('../constants');

const SUPPORTED_VENDORS = ['datadog', 'alertmanager', 'generic'];

/**
 * POST /api/webhooks/monitoring/:vendor
 * FR4-17 — Monitoring Webhook Intake
 */
const receiveWebhook = asyncHandler(async (req, res) => {
  const vendor = String(req.params.vendor || '').toLowerCase();

  if (!SUPPORTED_VENDORS.includes(vendor)) {
    await intakeService.logFailure({
      source: INTAKE_SOURCE.WEBHOOK,
      vendor,
      errorReason: `Unsupported vendor "${vendor}".`,
      rawPayload: req.body,
    });
    return res.status(400).json({
      success: false,
      message: `Unsupported webhook vendor "${vendor}".`,
    });
  }

  let normalized;
  try {
    normalized = webhookAdapterService.normalizePayload(vendor, req.body);
  } catch (err) {
    await intakeService.logFailure({
      source: INTAKE_SOURCE.WEBHOOK,
      vendor,
      errorReason: err.message,
      rawPayload: req.body,
    });
    return res.status(202).json({
      success: true,
      message: 'Payload accepted but could not be parsed; flagged for manual review.',
      data: null,
    });
  }

  try {
    // Pass raw env strings directly — Mongoose automatically handles string to ObjectId casting
    const { incident, created } = await intakeService.ingestAlert({
      ...normalized,
      intakeSource: INTAKE_SOURCE.WEBHOOK,
      reportedBy: process.env.INTAKE_SYSTEM_USER_ID,
      category: process.env.INTAKE_DEFAULT_CATEGORY_ID,
    });

    const statusCode = created ? 201 : 200;
    const message = created
      ? 'Incident created from webhook alert.'
      : 'Existing incident updated (duplicate alert).';

    return res.status(statusCode).json({
      success: true,
      message,
      data: { incidentId: incident._id, created },
    });
  } catch (err) {
    // Console log the exact internal error so it prints in npm run dev terminal
    console.error('[webhookController] Ingest Error Details:', err);

    await intakeService.logFailure({
      source: INTAKE_SOURCE.WEBHOOK,
      vendor,
      errorReason: err.message,
      rawPayload: req.body,
    });
    return res.status(202).json({
      success: true,
      message: 'Alert accepted but could not be turned into an incident; flagged for manual review.',
      data: null,
    });
  }
});

module.exports = { receiveWebhook };