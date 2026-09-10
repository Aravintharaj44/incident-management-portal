const crypto = require('crypto');
const ApiError = require('../utils/ApiError');

/**
 * verifyWebhookSignature
 * NFR (section 15) — "Webhook endpoints require a verifiable
 * signature/shared secret". FR4-20 acceptance criteria: "a test webhook
 * call without a valid signature is rejected".
 *
 * Expects the caller to send an HMAC-SHA256 signature of the raw request
 * body, hex-encoded, in the `X-Webhook-Signature` header, using the shared
 * secret MONITORING_WEBHOOK_SECRET.
 *
 * IMPORTANT: this must run on the RAW body, before JSON parsing re-serializes
 * it (re-serialized JSON is not guaranteed byte-identical to what the sender
 * signed). Mount this route with `express.raw({ type: 'application/json' })`
 * ahead of your global `express.json()` — see WIRING_GUIDE.md.
 */
function verifyWebhookSignature(req, res, next) {
  const secret = process.env.MONITORING_WEBHOOK_SECRET;
  if (!secret) {
    return next(new ApiError(500, 'MONITORING_WEBHOOK_SECRET is not configured on the server.'));
  }

  const signature = req.get('X-Webhook-Signature');
  if (!signature) {
    return next(new ApiError(401, 'Missing X-Webhook-Signature header.'));
  }

  // req.body is a Buffer here because this route uses express.raw()
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  const isValid =
    signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

  if (!isValid) {
    return next(new ApiError(401, 'Invalid webhook signature.'));
  }

  // Parse now that we've verified authenticity, so downstream code gets JSON
  try {
    req.body = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    return next(new ApiError(400, 'Webhook body is not valid JSON.'));
  }

  next();
}

module.exports = verifyWebhookSignature;
