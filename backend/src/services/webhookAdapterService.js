/**
 * webhookAdapterService
 * FR4-17 — Monitoring Webhook Intake
 *
 * Every external monitoring tool sends a different JSON shape. This module
 * converts whatever comes in into one normalized "NormalizedAlert" shape
 * that the rest of the intake pipeline (intakeService) understands:
 *
 * NormalizedAlert = {
 *   title: string,
 *   description: string,
 *   priority: 'low' | 'medium' | 'high' | 'critical',  // matches backend/src/constants PRIORITY_VALUES
 *   dedupeKey: string,   // stable key identifying "the same underlying alert"
 *   vendor: string,
 * }
 */

const { PRIORITY } = require('../constants');

const SEVERITY_MAP = {
  critical: PRIORITY.CRITICAL,
  error: PRIORITY.HIGH,
  high: PRIORITY.HIGH,
  warning: PRIORITY.MEDIUM,
  medium: PRIORITY.MEDIUM,
  info: PRIORITY.LOW,
  low: PRIORITY.LOW,
};

function mapSeverity(raw) {
  if (!raw) return PRIORITY.MEDIUM;
  const key = String(raw).toLowerCase();
  return SEVERITY_MAP[key] || PRIORITY.MEDIUM;
}

/**
 * Datadog monitor webhook payload (standard Datadog webhook integration).
 * Docs shape (typical fields): $EVENT_TITLE, $TEXT_ONLY_MSG, $ALERT_TYPE,
 * $ALERT_ID / $ALERT_TRANSITION, $ALERT_METRIC, $ALERT_SCOPE
 * We accept a JSON body a user configures on Datadog's webhook integration.
 */
function normalizeDatadog(payload = {}) {
  const title = payload.title || payload.event_title || 'Datadog alert';
  const description =
    payload.body || payload.text_only_msg || payload.message || 'No details provided by Datadog webhook.';
  const alertId = payload.alert_id || payload.id;
  const scope = payload.alert_scope || payload.scope || '';

  if (!alertId && !title) {
    throw new Error('Datadog payload missing both alert_id and title — cannot process.');
  }

  return {
    title: String(title).slice(0, 200),
    description: String(description).slice(0, 5000),
    priority: mapSeverity(payload.alert_type || payload.priority),
    // Prefer the stable Datadog alert id; fall back to title+scope
    dedupeKey: `datadog:${alertId || `${title}:${scope}`}`,
    vendor: 'datadog',
  };
}

/**
 * Prometheus Alertmanager webhook_config payload.
 * https://prometheus.io/docs/alerting/latest/configuration/#webhook_config
 * Shape: { status, groupKey, commonLabels, commonAnnotations, alerts: [...] }
 * A single Alertmanager POST can contain multiple alerts — we take the
 * first firing alert as the representative one for incident creation and
 * rely on groupKey/fingerprint for deduplication.
 */
function normalizeAlertmanager(payload = {}) {
  const alerts = Array.isArray(payload.alerts) && payload.alerts.length ? payload.alerts : [payload];
  const primary = alerts.find((a) => a.status === 'firing') || alerts[0] || {};

  const labels = primary.labels || payload.commonLabels || {};
  const annotations = primary.annotations || payload.commonAnnotations || {};

  const title = labels.alertname || annotations.summary || 'Alertmanager alert';
  const description =
    annotations.description || annotations.summary || JSON.stringify(labels).slice(0, 2000);

  const fingerprint = primary.fingerprint || payload.groupKey;
  if (!fingerprint) {
    throw new Error('Alertmanager payload missing fingerprint/groupKey — cannot deduplicate.');
  }

  return {
    title: String(title).slice(0, 200),
    description: String(description).slice(0, 5000),
    priority: mapSeverity(labels.severity),
    dedupeKey: `alertmanager:${fingerprint}`,
    vendor: 'alertmanager',
  };
}

/**
 * Fallback for any tool that doesn't have a dedicated adapter yet.
 * Accepts a reasonably generic shape:
 * { title, description, severity, dedupeKey | id }
 */
function normalizeGeneric(payload = {}) {
  const title = payload.title || payload.name || payload.summary;
  const description = payload.description || payload.message || payload.details || '';
  const key = payload.dedupeKey || payload.id || payload.alertId;

  if (!title) {
    throw new Error('Generic webhook payload missing a "title"/"name"/"summary" field.');
  }
  if (!key) {
    throw new Error('Generic webhook payload missing a "dedupeKey"/"id"/"alertId" field.');
  }

  return {
    title: String(title).slice(0, 200),
    description: String(description).slice(0, 5000),
    priority: mapSeverity(payload.severity || payload.priority),
    dedupeKey: `generic:${key}`,
    vendor: 'generic',
  };
}

const ADAPTERS = {
  datadog: normalizeDatadog,
  alertmanager: normalizeAlertmanager,
  generic: normalizeGeneric,
};

/**
 * @param {'datadog'|'alertmanager'|'generic'} vendor
 * @param {object} payload raw JSON body from the webhook request
 * @returns {{title, description, priority, dedupeKey, vendor}}
 * @throws Error with a human-readable reason if the payload can't be normalized
 */
function normalizePayload(vendor, payload) {
  const adapter = ADAPTERS[vendor];
  if (!adapter) {
    throw new Error(`Unsupported webhook vendor "${vendor}". Supported: ${Object.keys(ADAPTERS).join(', ')}`);
  }
  return adapter(payload);
}

module.exports = {
  normalizePayload,
  normalizeDatadog,
  normalizeAlertmanager,
  normalizeGeneric,
};
