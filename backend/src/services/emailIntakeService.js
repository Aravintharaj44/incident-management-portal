const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const intakeService = require('./intakeService');
const User = require('../models/User');
const logger = require('../utils/logger');
const { INTAKE_SOURCE } = require('../constants');

/**
 * emailIntakeService
 * FR4-16 — Inbound Email-to-Incident Intake
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

  // Gmail X-GM-RAW "after:" expects YYYY/MM/DD. Default per requirement:
  // ignore everything before 05/09/2026 (5 Sept 2026), process from there on.
  const sinceDate = INTAKE_SINCE_DATE || '2026/09/05';
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
    sinceDate: /^\d{4}\/\d{2}\/\d{2}$/.test(sinceDate) ? sinceDate : '2026/09/05',
    label: INTAKE_LABEL || 'INC',
  };
}

function isSenderAllowed(fromAddress, allowlist) {
  if (!allowlist || allowlist.length === 0) return true;
  return allowlist.includes(String(fromAddress).toLowerCase());
}

/**
 * Applies the "INC" Gmail label and marks the message as Seen.
 * Gmail exposes labels over IMAP via the X-GM-LABELS extension (not as
 * regular flags/keywords). imapflow supports this directly through the
 * `useLabels: true` option on messageFlagsAdd — no copy-to-mailbox trick
 * needed, and the label is auto-created by Gmail if it doesn't exist yet.
 */
async function applyIncLabelAndMarkSeen(client, uid, label) {
  await client.messageFlagsAdd(uid, [label], { uid: true, useLabels: true });
  await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
}

/**
 * Builds a fresh ImapFlow client with the shared connection options.
 * Pulled out so both the read and write-back phases of pollInbox use
 * identical settings without duplicating the constructor call.
 *
 * socketTimeout bumped 30000 -> 60000: the original single-connection
 * design was holding the IMAP socket open (idle) while slow Mongo work
 * (User lookup, Incident.create, activity log) ran in between fetch and
 * flag-update, and the server was timing it out around the 30s mark.
 * The 3-phase split below is the real fix; this is extra headroom.
 */
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

  // Catch socket errors on client instance to prevent Node process termination
  client.on('error', (err) => {
    logger.error(`[emailIntakeService] IMAP Socket Error prevented (${label}): ${err.message}`);
  });

  return client;
}

/**
 * Poll the monitored mailbox once, using server-side SEARCH to only
 * fetch messages that actually match our intake conditions:
 *   - after the configured cutoff date
 *   - unread
 *   - not already labelled INC
 *
 * Split into 3 phases so the IMAP connection is never left open/idle
 * while the slow Mongo work (Phase 2) runs — that idle gap is what was
 * causing repeated "Socket timeout" errors and the label/Seen step to
 * never complete:
 *   Phase 1 (READ)       — connect, SEARCH, fetch matching messages into memory, disconnect.
 *   Phase 2 (PROCESS)    — no IMAP connection open; parse + create incidents.
 *   Phase 3 (WRITE-BACK) — connect again briefly, label + mark Seen only the successes, disconnect.
 */
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
      // Gmail-specific raw search (X-GM-RAW): after cutoff date, unread,
      // and not already labelled INC. Returns only matching UIDs — no
      // full-mailbox scan.
      const gmailQuery = `after:${config.sinceDate} is:unread -label:${config.label}`;
      const uids = await readClient.search({ gmraw: gmailQuery }, { uid: true });

      if (uids && uids.length > 0) {
        // Pull matching messages fully into memory now, while the
        // connection is fresh, instead of streaming them with an async
        // iterator that would keep the socket open through Phase 2.
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
  const succeededUids = [];

  for (const message of messages) {
    try {
      await handleRawEmail(message.source, config.allowlist);
      processed += 1;
      succeededUids.push(message.uid);
    } catch (err) {
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
  if (succeededUids.length > 0) {
    const writeClient = createImapClient(config, 'write-back phase');

    try {
      await writeClient.connect();
      const lock = await writeClient.getMailboxLock('INBOX');
      try {
        for (const uid of succeededUids) {
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

  logger.info(`[emailIntakeService] Poll complete: ${processed} processed, ${failed} failed.`);
  return { processed, failed };
}

async function resolveReportedBy(fromAddress) {
  const matchedUser = await User.findOne({ email: fromAddress.toLowerCase() });
  if (matchedUser) return matchedUser._id;

  if (process.env.INTAKE_SYSTEM_USER_ID) return process.env.INTAKE_SYSTEM_USER_ID;

  throw new Error(
    `Sender "${fromAddress}" doesn't match any User account and INTAKE_SYSTEM_USER_ID is not configured.`
  );
}

async function handleRawEmail(rawSource, allowlist = []) {
  const parsed = await simpleParser(rawSource);

  const fromAddress = parsed.from && parsed.from.value && parsed.from.value[0] ? parsed.from.value[0].address : null;
  const subject = parsed.subject;
  const body = parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, ' ') : '');

  if (!subject || !subject.trim()) {
    throw new Error('Email has no subject — cannot derive incident title.');
  }
  if (!fromAddress) {
    throw new Error('Email has no parseable sender address.');
  }
  if (!isSenderAllowed(fromAddress, allowlist)) {
    throw new Error(`Sender "${fromAddress}" is not on the monitored-mailbox allowlist.`);
  }
  if (!process.env.INTAKE_DEFAULT_CATEGORY_ID) {
    throw new Error('INTAKE_DEFAULT_CATEGORY_ID is not configured — cannot satisfy required Incident.category.');
  }

  const reportedBy = await resolveReportedBy(fromAddress);

  return intakeService.ingestAlert({
    title: subject,
    description: body || '',
    intakeSource: INTAKE_SOURCE.EMAIL,
    reportedBy,
    category: process.env.INTAKE_DEFAULT_CATEGORY_ID,
  });
}

module.exports = {
  pollInbox,
  handleRawEmail,
};