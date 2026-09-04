const Incident = require('../models/Incident');
const IntakeLog = require('../models/IntakeLog');
const activityService = require('./activityService');
const { TERMINAL_STATUSES, PRIORITY_VALUES, ACTIVITY_ACTIONS, INTAKE_SOURCE_LABELS } = require('../constants');

/**
 * intakeService
 * Shared pipeline used by BOTH the email intake job and the webhook
 * controller, so FR4-16 (email) and FR4-17 (webhook) always apply the same
 * FR4-18 (dedupe) and FR4-19 (source tagging) rules.
 */

const TITLE_MIN = 5;
const TITLE_MAX = 140;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 5000;

/**
 * Helper to safely call whichever log method activityService exports
 */
async function recordActivity(payload) {
  if (typeof activityService.createLog === 'function') {
    return activityService.createLog(payload);
  }
  if (typeof activityService.logActivity === 'function') {
    return activityService.logActivity(payload);
  }
  if (typeof activityService.log === 'function') {
    return activityService.log(payload);
  }
  // Safe fallback to console if method is unmapped
  console.log('[intakeService] Activity logged:', payload);
}

/**
 * Find an existing OPEN incident that already represents this alert.
 */
async function findDuplicateIncident({ dedupeKey, title, intakeSource }) {
  if (dedupeKey) {
    const byKey = await Incident.findOne({
      dedupeKey,
      status: { $nin: TERMINAL_STATUSES },
    });
    if (byKey) return byKey;
  }

  const normalizedTitle = title.trim().toLowerCase();
  return Incident.findOne({
    intakeSource,
    status: { $nin: TERMINAL_STATUSES },
    title: new RegExp(`^${escapeRegExp(normalizedTitle)}$`, 'i'),
  });
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Clamp/validate title and description against the schema limits
 */
function sanitizeTitle(rawTitle) {
  const title = String(rawTitle || '').trim();
  if (title.length < TITLE_MIN) {
    throw new Error(`Title "${title}" is shorter than the required ${TITLE_MIN} characters.`);
  }
  return title.slice(0, TITLE_MAX);
}

function sanitizeDescription(rawDescription) {
  let description = String(rawDescription || '').trim();
  if (description.length < DESCRIPTION_MIN) {
    description = `${description} (no further details were provided by the source.)`.trim();
  }
  return description.slice(0, DESCRIPTION_MAX);
}

function sanitizePriority(rawPriority) {
  if (rawPriority && PRIORITY_VALUES.includes(rawPriority)) return rawPriority;
  return undefined;
}

/**
 * Creates a new incident or updates existing duplicate
 */
async function ingestAlert(input) {
  const { priority, intakeSource, dedupeKey, reportedBy, category, vendor } = input;

  if (!reportedBy) {
    throw new Error('No reportedBy user could be resolved for this intake — set INTAKE_SYSTEM_USER_ID.');
  }
  if (!category) {
    throw new Error(
      'Incident.category is required by the schema but intake has no category to assign — set INTAKE_DEFAULT_CATEGORY_ID.'
    );
  }

  const title = sanitizeTitle(input.title);
  const description = sanitizeDescription(input.description);

  const existing = await findDuplicateIncident({ dedupeKey, title, intakeSource });

  if (existing) {
    existing.description = sanitizeDescription(
      `${existing.description}\n\n---\n[${new Date().toISOString()}] Duplicate ${INTAKE_SOURCE_LABELS[intakeSource] || intakeSource} alert received:\n${description}`
    );
    await existing.save();

    await recordActivity({
      incidentId: existing._id,
      action: ACTIVITY_ACTIONS.INTAKE_DUPLICATE_RECEIVED || 'INTAKE_DUPLICATE_RECEIVED',
      details: `Repeated ${INTAKE_SOURCE_LABELS[intakeSource] || intakeSource} alert${vendor ? ` (${vendor})` : ''} matched this open incident instead of creating a duplicate.`,
    });

    return { incident: existing, created: false };
  }

  const incident = await Incident.create({
    title,
    description,
    category,
    priority: sanitizePriority(priority),
    intakeSource,
    dedupeKey: dedupeKey || null,
    reportedBy,
  });

  await recordActivity({
    incidentId: incident._id,
    action: ACTIVITY_ACTIONS.INTAKE_INCIDENT_CREATED || 'INTAKE_INCIDENT_CREATED',
    details: `Incident auto-created from ${INTAKE_SOURCE_LABELS[intakeSource] || intakeSource} intake${vendor ? ` (${vendor})` : ''}.`,
  });

  return { incident, created: true };
}

/**
 * FR4-20 — Intake Failure Log
 * Explicitly assigns 'flagged' status so records display on the default UI filter
 */
/**
 * FR4-20 — Intake Failure Log
 */
async function logFailure({ source, vendor = null, errorReason, rawPayload, status = 'Failed' }) {
  try {
    return await IntakeLog.create({
      source: source || INTAKE_SOURCE.WEBHOOK,
      vendor: vendor || 'generic',
      errorReason: String(errorReason || 'Unknown error').slice(0, 1000),
      rawPayload: typeof rawPayload === 'object' ? rawPayload : { data: rawPayload },
      status: status, // Matches capitalized enum ['Failed', 'Reviewed', 'Resolved']
    });
  } catch (err) {
    console.error('[intakeService] Error logging intake failure to MongoDB:', err);
    throw err;
  }
}

module.exports = {
  ingestAlert,
  logFailure,
  findDuplicateIncident,
};