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
  } = process.env;

  if (!INTAKE_IMAP_HOST || !INTAKE_IMAP_USER || !INTAKE_IMAP_PASSWORD) {
    return null;
  }

  const allowlist = (INTAKE_SENDER_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return {
    host: INTAKE_IMAP_HOST,
    port: Number(INTAKE_IMAP_PORT || 993),
    secure: true,
    auth: {
      user: INTAKE_IMAP_USER,
      pass: INTAKE_IMAP_PASSWORD,
    },
    allowlist,
  };
}

function isSenderAllowed(fromAddress, allowlist) {
  if (!allowlist || allowlist.length === 0) return true;
  return allowlist.includes(String(fromAddress).toLowerCase());
}

/**
 * Poll the monitored mailbox once
 */
async function pollInbox() {
  const config = getConfig();
  if (!config) {
    logger.warn('[emailIntakeService] IMAP not configured — skipping poll. Set INTAKE_IMAP_* env vars.');
    return { processed: 0, failed: 0 };
  }

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
    socketTimeout: 30000,
    tls: {
      rejectUnauthorized: false,
    },
  });

  // Catch socket errors on client instance to prevent Node process termination
  client.on('error', (err) => {
    logger.error(`[emailIntakeService] IMAP Socket Error prevented: ${err.message}`);
  });

  let processed = 0;
  let failed = 0;

  try {
    await client.connect();

    const lock = await client.getMailboxLock('INBOX');
    try {
      // Pass uid: true to retrieve exact message UID alongside sequence numbers
      for await (const message of client.fetch({ seen: false }, { envelope: true, source: true, uid: true })) {
        try {
          await handleRawEmail(message.source, config.allowlist);
          processed += 1;
        } catch (err) {
          failed += 1;
          await intakeService.logFailure({
            source: INTAKE_SOURCE.EMAIL,
            errorReason: err.message,
            rawPayload: message.envelope ? JSON.stringify(message.envelope) : 'unavailable',
          });
          logger.error(`[emailIntakeService] Failed to process message: ${err.message}`);
        } finally {
          // Use UID-based flag update to ensure read status persists across network reconnections
          try {
            await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true });
          } catch (flagErr) {
            logger.error(`[emailIntakeService] Could not set \\Seen flag for UID ${message.uid}: ${flagErr.message}`);
          }
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    logger.error(`[emailIntakeService] IMAP connection error: ${err.message}`);
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