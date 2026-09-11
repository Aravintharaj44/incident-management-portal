const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const intakeService = require('./intakeService');
const activityService = require('./activityService');
const User = require('../models/User');
const Incident = require('../models/Incident');
const Attachment = require('../models/Attachment');
const logger = require('../utils/logger');
const { env } = require('../config/env');
const { INTAKE_SOURCE, ACTIVITY_ACTIONS } = require('../constants');
const categoryService = require('./categoryService');

/**
 * emailIntakeService
 * FR4-16 — Inbound Email-to-Incident Intake
 *
 * Failure model (important):
 *   - Permanent failures (bad subject, unknown sender, title too short,
 *     missing config) → logged as 'Skipped', message gets the INC label,
 *     never retried.
 *   - Transient failures (DB down, IMAP socket dropped) → logged as
 *     'Failed', message left unlabelled, retried on next poll.
 *
 * isMessageAlreadyProcessed() treats 'Skipped' as terminal, so once a
 * message is skipped it is never picked up again by the IMAP search
 * (which filters on -label:INC anyway).
 */

function getConfig() {
  const {
    INTAKE_IMAP_HOST,
    INTAKE_IMAP_PORT,
    INTAKE_IMAP_USER,
    INTAKE_IMAP_PASSWORD,
    INTAKE_SENDER_ALLOWLIST,
    INTAKE_SINCE_DATE,
    INTAKE_LABEL,
  } = process.env;

  if (!INTAKE_IMAP_HOST || !INTAKE_IMAP_USER || !INTAKE_IMAP_PASSWORD) {
    return null;
  }

  const allowlist = (INTAKE_SENDER_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const sinceDate = INTAKE_SINCE_DATE || '2026/09/02';
  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(sinceDate)) {
    logger.error(
      `[emailIntakeService] INTAKE_SINCE_DATE "${sinceDate}" is not in YYYY/MM/DD format — falling back to default.`
    );
  }

  return {
    host: INTAKE_IMAP_HOST,
    port: Number(INTAKE_IMAP_PORT || 993),
    secure: true,
    auth: {
      user: INTAKE_IMAP_USER,
      pass: INTAKE_IMAP_PASSWORD,
    },
    allowlist,
    sinceDate: /^\d{4}\/\d{2}\/\d{2}$/.test(sinceDate) ? sinceDate : '2026/09/02',
    label: INTAKE_LABEL || 'INC',
  };
}

function isSenderAllowed(fromAddress, allowlist) {
  if (!allowlist || allowlist.length === 0) return true;
  return allowlist.includes(String(fromAddress).toLowerCase());
}

async function applyIncLabelAndMarkSeen(client, uid, label) {
  await client.messageFlagsAdd(uid, [label], { uid: true, useLabels: true });
  await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
}

function createImapClient(config, label) {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
    logger: false,
    clientInfo: { name: 'IncidentPortal' },
    emitLogs: false,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 60000,
    tls: {
      rejectUnauthorized: false,
    },
  });

  client.on('error', (err) => {
    logger.error(`[emailIntakeService] IMAP Socket Error prevented (${label}): ${err.message}`);
  });

  return client;
}

/**
 * Same safe-dispatch pattern as intakeService's internal recordActivity —
 * duplicated locally rather than exported from intakeService, since
 * activity logging for attachments is specific to this file's concerns.
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
  console.log('[emailIntakeService] Activity logged:', payload);
}

/**
 * FR4-16 — Email Attachment Intake
 *
 * Saves each mailparser-extracted attachment to disk using the exact same
 * convention as middleware/upload.js (random filename, same directory), so
 * the existing download route, removeFile cleanup, and incident-deletion
 * cascade all work on email-sourced attachments without any changes.
 */
async function saveEmailAttachments(parsedAttachments, incidentId, uploadedBy) {
  if (!parsedAttachments || parsedAttachments.length === 0) return;

  const maxFiles = (env.upload.limits && env.upload.limits.files) || 5;
  const maxBytes = env.upload.maxFileSizeMb * 1024 * 1024;

  const toSave = parsedAttachments.slice(0, maxFiles);
  if (parsedAttachments.length > maxFiles) {
    logger.warn(
      `[emailIntakeService] Incident ${incidentId}: email had ${parsedAttachments.length} attachments, only the first ${maxFiles} were saved.`
    );
  }

  let savedCount = 0;

  for (const att of toSave) {
    try {
      const originalName = att.filename || 'attachment';
      const mimeType = att.contentType || 'application/octet-stream';
      const size = att.size || (att.content ? att.content.length : 0);

      if (!env.upload.allowedMimeTypes.includes(mimeType)) {
        logger.warn(
          `[emailIntakeService] Incident ${incidentId}: skipped attachment "${originalName}" — MIME type "${mimeType}" not allowed.`
        );
        continue;
      }
      if (size > maxBytes) {
        logger.warn(
          `[emailIntakeService] Incident ${incidentId}: skipped attachment "${originalName}" — ${size} bytes exceeds the ${env.upload.maxFileSizeMb}MB limit.`
        );
        continue;
      }
      if (!att.content || !Buffer.isBuffer(att.content)) {
        logger.warn(
          `[emailIntakeService] Incident ${incidentId}: skipped attachment "${originalName}" — no readable content.`
        );
        continue;
      }

      // Identical naming scheme to middleware/upload.js's filename callback.
      const ext = path.extname(originalName).toLowerCase().slice(0, 10);
      const safeExt = /^\.[a-z0-9]+$/.test(ext) ? ext : '';
      const storedName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`;

      fs.mkdirSync(env.upload.dir, { recursive: true });
      await fs.promises.writeFile(path.join(env.upload.dir, storedName), att.content);

      const attachment = await Attachment.create({
        incident: incidentId,
        originalName,
        storedName,
        mimeType,
        size,
        uploadedBy,
      });

      await Incident.updateOne({ _id: incidentId }, { $inc: { attachmentCount: 1 } });

      await recordActivity({
        incidentId,
        action: ACTIVITY_ACTIONS.ATTACHMENT_ADDED,
        details: `Attachment "${originalName}" added from inbound email.`,
      });

      savedCount += 1;
    } catch (err) {
      logger.error(
        `[emailIntakeService] Incident ${incidentId}: failed to save attachment "${att.filename || 'unknown'}": ${err.message}`
      );
      // Continue to the next attachment — a failed file never costs the incident.
    }
  }

  return savedCount;
}

async function pollInbox() {
  const config = getConfig();
  if (!config) {
    logger.warn('[emailIntakeService] IMAP not configured — skipping poll. Set INTAKE_IMAP_* env vars.');
    return { processed: 0, failed: 0 };
  }

  let processed = 0;
  let failed = 0;

  // ---- Phase 1: READ ----
  let messages = [];
  const readClient = createImapClient(config, 'read phase');

  try {
    await readClient.connect();
    const lock = await readClient.getMailboxLock('INBOX');
    try {
      const gmailQuery = `after:${config.sinceDate} -label:${config.label}`;
      const uids = await readClient.search({ gmraw: gmailQuery }, { uid: true });

      if (uids && uids.length > 0) {
        messages = await readClient.fetchAll(uids, { envelope: true, source: true, uid: true }, { uid: true });
      }
    } finally {
      lock.release();
    }
    await readClient.logout();
  } catch (err) {
    logger.error(`[emailIntakeService] IMAP connection error (read phase): ${err.message}`);
    return { processed: 0, failed: 0 };
  }

  if (messages.length === 0) {
    logger.info('[emailIntakeService] Poll complete: 0 matching messages.');
    return { processed: 0, failed: 0 };
  }

  // ---- Phase 2: PROCESS (no IMAP connection open) ----
  // uidsToLabel = every message we never want to see again (processed,
  // duplicate, skipped). Transient failures are intentionally NOT added,
  // so the next poll retries them.
  const uidsToLabel = [];
  let duplicates = 0;
  let skipped = 0;

  for (const message of messages) {
    try {
      const result = await handleRawEmail(message.source, config.allowlist);

      if (result.status === 'skipped') {
        skipped += 1;
      } else {
        processed += 1;
        if (result.status === 'duplicate' || result.status === 'duplicate_incident') {
          duplicates += 1;
        }
      }

      // Label + mark seen for processed, duplicate, and skipped.
      uidsToLabel.push(message.uid);
    } catch (err) {
      // Only transient errors reach here now — handleRawEmail returns a
      // 'skipped' result for anything retrying cannot fix.
      failed += 1;
      await intakeService.logFailure({
        source: INTAKE_SOURCE.EMAIL,
        errorReason: err.message,
        rawPayload: message.envelope ? JSON.stringify(message.envelope) : 'unavailable',
      });
      logger.error(`[emailIntakeService] Failed to process message UID ${message.uid}: ${err.message}`);
      // Intentionally left unread and unlabelled so it's retried on the next poll.
    }
  }

  // ---- Phase 3: WRITE-BACK ----
  if (uidsToLabel.length > 0) {
    const writeClient = createImapClient(config, 'write-back phase');

    try {
      await writeClient.connect();
      const lock = await writeClient.getMailboxLock('INBOX');
      try {
        for (const uid of uidsToLabel) {
          try {
            await applyIncLabelAndMarkSeen(writeClient, uid, config.label);
          } catch (labelErr) {
            logger.error(
              `[emailIntakeService] Incident created but failed to label/mark UID ${uid}: ${labelErr.message}`
            );
          }
        }
      } finally {
        lock.release();
      }
      await writeClient.logout();
    } catch (err) {
      logger.error(`[emailIntakeService] IMAP connection error (write-back phase): ${err.message}`);
    }
  }

  logger.info(
    `[emailIntakeService] Poll complete: ${processed} processed, ${duplicates} duplicate, ${skipped} skipped, ${failed} failed.`
  );
  return { processed, failed };
}

/**
 * @param {Buffer|string} rawSource - Raw RFC-822 email content
 * @param {string[]} allowlist - Optional sender allowlist (empty = all allowed)
 * @returns {{ status: string, incident: object|null, created?: boolean }}
 */
async function handleRawEmail(rawSource, allowlist = []) {
  const parsed = await simpleParser(rawSource);

  const fromAddress = parsed.from && parsed.from.value && parsed.from.value[0]
    ? parsed.from.value[0].address.toLowerCase()
    : null;
  const toAddresses = [
    ...(parsed.to && parsed.to.value ? parsed.to.value : []),
    ...(parsed.cc && parsed.cc.value ? parsed.cc.value : []),
  ]
    .map((entry) => String(entry.address || '').toLowerCase())
    .filter(Boolean);
  const subject = parsed.subject;
  const body = parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, ' ') : '');
  const messageId = parsed.messageId || null;

  /**
   * Helper: log a permanent failure as 'Skipped' and return the skip
   * result. Caller will apply the INC label so the message never shows
   * up in the search again.
   */
  const skip = async (reason) => {
    await intakeService.recordIntakeLog({
      source: INTAKE_SOURCE.EMAIL,
      vendor: 'zoho',
      status: 'Skipped',
      errorReason: reason,
      rawPayload: { subject, from: fromAddress, to: toAddresses },
      messageId,
      fromAddress,
      toAddresses,
      subject,
    });
    logger.warn(`[emailIntakeService] Skipping message (permanent): ${reason}`);
    return { status: 'skipped', incident: null };
  };

  // ---- Permanent validation failures ----
  if (!subject || !subject.trim()) {
    return skip('Email has no subject — cannot derive incident title.');
  }
  if (!fromAddress) {
    return skip('Email has no parseable sender address.');
  }
  if (!isSenderAllowed(fromAddress, allowlist)) {
    return skip(`Sender "${fromAddress}" is not on the monitored-mailbox allowlist.`);
  }
  // if (!process.env.INTAKE_DEFAULT_CATEGORY_ID) {
  //   return skip('INTAKE_DEFAULT_CATEGORY_ID is not configured — cannot satisfy required Incident.category.');
  // }

  // --- FR4-16 / FR4-10 dedup: skip if this Message-ID was already handled ---
  if (await intakeService.isMessageAlreadyProcessed(INTAKE_SOURCE.EMAIL, messageId)) {
    await intakeService.recordIntakeLog({
      source: INTAKE_SOURCE.EMAIL,
      vendor: 'zoho',
      status: 'Duplicate',
      errorReason: 'Message already processed in a previous poll (matched by Message-ID).',
      rawPayload: { subject, from: fromAddress, to: toAddresses },
      messageId,
      fromAddress,
      toAddresses,
      subject,
    });
    return { status: 'duplicate', incident: null };
  }

  // --- FR4-16 fix: sender MUST be a registered User, or the email is skipped ---
  const matchedUser = await User.findOne({ email: fromAddress });
  if (!matchedUser) {
    return skip(`Sender "${fromAddress}" does not match any registered User — no incident created.`);
  }

  const reportedBy = matchedUser._id;

  // --- FR4-16: create or merge incident via shared intake pipeline ---
  // Wrap so that permanent validation errors (title too short, etc.)
  // become 'Skipped', while genuine transient errors still bubble up.
  let intakeResult;
  try {
    const categoryId = await categoryService.getDefaultIntakeCategoryId();
    intakeResult = await intakeService.ingestAlert({
      title: subject,
      description: body || '',
      intakeSource: INTAKE_SOURCE.EMAIL,
      reportedBy,
      // category: process.env.INTAKE_DEFAULT_CATEGORY_ID,
      category: categoryId,
    });
  } catch (err) {
    const permanent = /shorter than the required|required by the schema|No reportedBy/.test(err.message);
    if (permanent) {
      return skip(`Permanent validation failure: ${err.message}`);
    }
    throw err; // transient — pollInbox logs Failed and retries next poll
  }

  const { incident, created } = intakeResult;

  // --- Attachments: saved whether the incident was created or merged ---
  if (parsed.attachments && parsed.attachments.length > 0) {
    await saveEmailAttachments(parsed.attachments, incident._id, reportedBy);
  }

  // --- FR4-16 / FR4-20: record successful intake ---
  await intakeService.recordIntakeLog({
    source: INTAKE_SOURCE.EMAIL,
    vendor: 'zoho',
    status: 'Processed',
    errorReason: created
      ? 'Incident created from inbound email.'
      : 'Matched an existing open incident and was merged instead of creating a new one.',
    rawPayload: { subject, from: fromAddress, to: toAddresses },
    messageId,
    fromAddress,
    toAddresses,
    subject,
    resolvedIncidentId: incident._id,
  });

  return { status: created ? 'processed' : 'duplicate_incident', incident, created };
}

module.exports = {
  pollInbox,
  handleRawEmail,
  saveEmailAttachments,
};