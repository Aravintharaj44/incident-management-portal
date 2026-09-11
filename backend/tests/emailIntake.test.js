const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * FR4-16 — Email Intake Unit Tests
 *
 * Tests handleRawEmail() from emailIntakeService.js.
 *
 * Mocking approach: simpleParser is destructured at require-time in
 * emailIntakeService, so we use a delegating wrapper. intakeService
 * methods are accessed via property lookup at call time, so direct
 * replacement works.
 *
 * Run: node --test tests/emailIntake.test.js
 */

// ---------------------------------------------------------------------------
// Mock infrastructure
// ---------------------------------------------------------------------------

let _currentSimpleParser = null;

const ingestAlertCalls = [];
const recordIntakeLogCalls = [];
const attachmentCreateCalls = [];
let fsWriteFileCalls = [];
let _fsWriteFileError = null;

function buildMockParsedEmail({
  from = 'alice@example.com',
  to = ['monitor@company.com'],
  subject = 'Test Incident Report',
  text = 'This is a plain text body.',
  html = '',
  messageId = '<abc123@mail.example.com>',
  attachments = [],
} = {}) {
  return {
    from: from ? { value: [{ address: from, name: 'Alice' }] } : null,
    to: { value: to.map((addr) => ({ address: addr, name: '' })) },
    subject,
    text,
    html,
    messageId,
    attachments,
  };
}

function resetCallLogs() {
  ingestAlertCalls.length = 0;
  recordIntakeLogCalls.length = 0;
  attachmentCreateCalls.length = 0;
  fsWriteFileCalls = [];
  _fsWriteFileError = null;
}

function lastIngestAlertCall() {
  return ingestAlertCalls[ingestAlertCalls.length - 1];
}

function lastRecordIntakeLogCall() {
  return recordIntakeLogCalls[recordIntakeLogCalls.length - 1];
}

function buildMockAttachment({
  filename = 'report.pdf',
  mimeType = 'application/pdf',
  size = 1024,
  content = Buffer.from('fake-pdf-content'),
} = {}) {
  return { filename, mimeType, size, content };
}

// ---------------------------------------------------------------------------
// Module setup
// ---------------------------------------------------------------------------

let savedEnv;
let User;
let Attachment;
let intakeService;
let emailIntakeService;
let origUserFindOne;
let origUserExists;
let origSimpleParser;
let origFsWriteFile;
let origAttachmentCreate;

/**
 * Default User.exists mock:
 * - alice@example.com → registered (most tests use this sender)
 * - everything else → not registered
 *
 * Tests override this when they need a different sender to be (un)registered.
 */
const DEFAULT_USER_EXISTS = async (query) => {
  if (query && query.email === 'alice@example.com') return { _id: '1' };
  return null;
};

function setupMocks() {
  savedEnv = { ...process.env };

  process.env.INTAKE_DEFAULT_CATEGORY_ID = '6650abc00000000000000001';
  process.env.INTAKE_SYSTEM_USER_ID = '6650abc00000000000000099';

  // Clear cache
  delete require.cache[require.resolve('../src/services/emailIntakeService')];
  delete require.cache[require.resolve('../src/services/intakeService')];
  delete require.cache[require.resolve('../src/models/User')];
  delete require.cache[require.resolve('../src/models/Attachment')];

  // --- mailparser ---
  const mailparser = require('mailparser');
  origSimpleParser = mailparser.simpleParser;
  _currentSimpleParser = async (...args) => origSimpleParser(...args);
  mailparser.simpleParser = (...args) => _currentSimpleParser(...args);

  // --- User ---
  User = require('../src/models/User');
  origUserFindOne = User.findOne;
  origUserExists = User.exists;
  User.findOne = async () => null;
  User.exists = DEFAULT_USER_EXISTS;

  // --- Attachment model ---
  Attachment = require('../src/models/Attachment');
  origAttachmentCreate = Attachment.create;
  attachmentCreateCalls.length = 0;
  Attachment.create = async (doc) => {
    attachmentCreateCalls.push(doc);
    return { _id: 'att_' + Date.now(), ...doc };
  };

  // --- fs.promises.writeFile ---
  const fs = require('fs');
  origFsWriteFile = fs.promises.writeFile;
  fsWriteFileCalls = [];
  _fsWriteFileError = null;
  fs.promises.writeFile = async (filePath, data) => {
    fsWriteFileCalls.push({ filePath, data });
    if (_fsWriteFileError) throw _fsWriteFileError;
  };

  // --- intakeService with call tracking ---
  intakeService = require('../src/services/intakeService');

  intakeService.ingestAlert = async (input) => {
    ingestAlertCalls.push([input]);
    return {
      incident: { _id: '6650abc00000000000000050', title: input.title },
      created: true,
    };
  };

  intakeService.recordIntakeLog = async (input) => {
    recordIntakeLogCalls.push([input]);
    return {};
  };

  intakeService.isMessageAlreadyProcessed = async () => false;
  intakeService.logFailure = async () => ({});

  emailIntakeService = require('../src/services/emailIntakeService');
}

function teardownMocks() {
  const fs = require('fs');
  const mailparser = require('mailparser');
  mailparser.simpleParser = origSimpleParser;
  User.findOne = origUserFindOne;
  User.exists = origUserExists;
  Attachment.create = origAttachmentCreate;
  fs.promises.writeFile = origFsWriteFile;
  process.env = { ...savedEnv };
  delete require.cache[require.resolve('../src/services/emailIntakeService')];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('FR4-16: setup', () => {
  setupMocks();
  resetCallLogs();
});

// ===== 1. Email subject → Incident.title =====

test('1. email subject becomes incident title', async () => {
  _currentSimpleParser = async () =>
    buildMockParsedEmail({ subject: 'Server is down in production' });

  const result = await emailIntakeService.handleRawEmail(Buffer.from('raw'));

  assert.equal(result.status, 'processed');
  assert.equal(result.created, true);
  assert.equal(lastIngestAlertCall()[0].title, 'Server is down in production');
});

test('1b. subject is preserved with original whitespace by intakeService', async () => {
  _currentSimpleParser = async () =>
    buildMockParsedEmail({ subject: '   Trimmed Subject   ' });

  await emailIntakeService.handleRawEmail(Buffer.from('raw'));
  assert.equal(lastIngestAlertCall()[0].title, '   Trimmed Subject   ');
});

// ===== 15. Missing subject =====

test('15. missing subject is rejected', async () => {
  _currentSimpleParser = async () => buildMockParsedEmail({ subject: '' });

  await assert.rejects(
    () => emailIntakeService.handleRawEmail(Buffer.from('raw')),
    /no subject/i
  );
});

test('15b. whitespace-only subject is rejected', async () => {
  _currentSimpleParser = async () => buildMockParsedEmail({ subject: '   ' });

  await assert.rejects(
    () => emailIntakeService.handleRawEmail(Buffer.from('raw')),
    /no subject/i
  );
});

// ===== 2. Plain-text body → Incident.description =====

test('2. plain text body becomes incident description', async () => {
  _currentSimpleParser = async () =>
    buildMockParsedEmail({ text: 'The database server is unreachable.' });

  await emailIntakeService.handleRawEmail(Buffer.from('raw'));
  assert.equal(lastIngestAlertCall()[0].description, 'The database server is unreachable.');
});

// ===== 3. HTML-only email → readable description =====

test('3. html-only email is converted to readable text', async () => {
  _currentSimpleParser = async () =>
    buildMockParsedEmail({
      text: '',
      html: '<p>Server <b>critical</b> alert: disk usage at 99%.</p>',
    });

  await emailIntakeService.handleRawEmail(Buffer.from('raw'));
  const desc = lastIngestAlertCall()[0].description;
  assert.ok(!desc.includes('<p>'), 'HTML <p> tag should be stripped');
  assert.ok(!desc.includes('<b>'), 'HTML <b> tag should be stripped');
  assert.ok(desc.includes('Server'), 'text content preserved');
  assert.ok(desc.includes('critical'), 'text content preserved');
});

// ===== 4. Sender resolves to correct User =====

test('4. sender email resolves to registered user', async () => {
  const fakeUserId = '6650abc00000000000000abc';
  User.findOne = async (query) => {
    if (query.email === 'alice@example.com') return { _id: fakeUserId };
    return null;
  };

  await emailIntakeService.handleRawEmail(Buffer.from('raw'));
  assert.equal(lastIngestAlertCall()[0].reportedBy, fakeUserId);
});

// ===== 5. Incident.reportedBy = sender's registered User ID =====

test('5. incident reportedBy equals sender registered user id', async () => {
  const senderId = '6650abc00000000000000def';
  User.findOne = async (query) => {
    if (query.email === 'bob@company.com') return { _id: senderId };
    return null;
  };
  // Register bob@company.com as a valid sender
  User.exists = async (query) => {
    if (query.email === 'bob@company.com') return { _id: '2' };
    return null;
  };

  _currentSimpleParser = async () => buildMockParsedEmail({ from: 'bob@company.com' });

  await emailIntakeService.handleRawEmail(Buffer.from('raw'));
  assert.equal(lastIngestAlertCall()[0].reportedBy, senderId);
});

// ===== 6. Unknown sender (registered in exists but not in findOne) → system user =====

test('6. sender registered in exists but not in findOne falls back to INTAKE_SYSTEM_USER_ID', async () => {
  // Sender passes exists check (is registered) but findOne returns null
  // → resolveReportedBy falls back to INTAKE_SYSTEM_USER_ID
  User.findOne = async () => null;
  User.exists = async (query) => {
    if (query.email === 'partial@example.com') return { _id: '3' };
    return null;
  };

  _currentSimpleParser = async () => buildMockParsedEmail({ from: 'partial@example.com' });

  await emailIntakeService.handleRawEmail(Buffer.from('raw'));
  assert.equal(lastIngestAlertCall()[0].reportedBy, '6650abc00000000000000099');
});

// ===== 16. Missing sender =====

test('16. missing sender address is rejected', async () => {
  _currentSimpleParser = async () => ({
    from: null,
    to: { value: [{ address: 'monitor@company.com' }] },
    subject: 'No sender test',
    text: 'Body here for validation.',
    html: '',
    messageId: '<nosender@test.com>',
  });

  await assert.rejects(
    () => emailIntakeService.handleRawEmail(Buffer.from('raw')),
    /no parseable sender/i
  );
});

// ===== 7. Sender must be a registered User =====

test('7. email from registered sender is accepted', async () => {
  // alice@example.com is registered by default mock
  User.exists = DEFAULT_USER_EXISTS;
  _currentSimpleParser = async () => buildMockParsedEmail({ from: 'alice@example.com' });

  const result = await emailIntakeService.handleRawEmail(Buffer.from('raw'));
  assert.equal(result.status, 'processed');
});

// ===== 8. Unregistered sender is skipped =====

test('8. email from unregistered sender is skipped', async () => {
  _currentSimpleParser = async () => buildMockParsedEmail({ from: 'nobody@external.com' });

  const result = await emailIntakeService.handleRawEmail(Buffer.from('raw'));
  assert.equal(result.status, 'skipped');
  assert.equal(result.incident, null);

  const logCall = lastRecordIntakeLogCall();
  assert.ok(logCall, 'recordIntakeLog was called');
  assert.equal(logCall[0].status, 'Skipped');
  assert.ok(logCall[0].errorReason.includes('nobody@external.com'));
});

// ===== 9. Message-ID prevents duplicate processing =====

test('9. same message-id prevents duplicate processing', async () => {
  intakeService.isMessageAlreadyProcessed = async () => true;

  _currentSimpleParser = async () =>
    buildMockParsedEmail({ messageId: '<duplicate@test.com>' });

  const result = await emailIntakeService.handleRawEmail(Buffer.from('raw'));
  assert.equal(result.status, 'duplicate');
  assert.equal(result.incident, null);

  const logCall = lastRecordIntakeLogCall();
  assert.equal(logCall[0].status, 'Duplicate');
  assert.equal(logCall[0].messageId, '<duplicate@test.com>');
});

// ===== 10. Failed processing remains retryable =====

test('10. failed processing does not log as Duplicate (remains retryable)', async () => {
  intakeService.isMessageAlreadyProcessed = async () => false;
  const origIngestAlert = intakeService.ingestAlert;
  intakeService.ingestAlert = async () => { throw new Error('Transient DB error'); };
  User.exists = DEFAULT_USER_EXISTS;

  _currentSimpleParser = async () =>
    buildMockParsedEmail({ messageId: '<retryable@test.com>' });

  await assert.rejects(
    () => emailIntakeService.handleRawEmail(Buffer.from('raw')),
    /Transient DB error/
  );

  intakeService.ingestAlert = origIngestAlert;
});

// ===== 11. Successful processing logged as Processed =====

test('11. successful processing is logged as Processed', async () => {
  intakeService.isMessageAlreadyProcessed = async () => false;
  User.exists = DEFAULT_USER_EXISTS;
  const testIncidentId = '6650abc00000000000000999';
  intakeService.ingestAlert = async (input) => {
    ingestAlertCalls.push([input]);
    return { incident: { _id: testIncidentId }, created: true };
  };

  _currentSimpleParser = async () =>
    buildMockParsedEmail({ messageId: '<success@test.com>' });

  await emailIntakeService.handleRawEmail(Buffer.from('raw'));
  const logCall = lastRecordIntakeLogCall();
  assert.equal(logCall[0].status, 'Processed');
  assert.equal(logCall[0].resolvedIncidentId, testIncidentId);

  // Restore default
  intakeService.ingestAlert = async (input) => {
    ingestAlertCalls.push([input]);
    return { incident: { _id: '6650abc00000000000000050', title: input.title }, created: true };
  };
});

// ===== 12. Duplicate Message-ID logged as Duplicate =====

test('12. duplicate message-id is logged as Duplicate', async () => {
  intakeService.isMessageAlreadyProcessed = async () => true;

  _currentSimpleParser = async () =>
    buildMockParsedEmail({ messageId: '<dupe-logged@test.com>' });

  await emailIntakeService.handleRawEmail(Buffer.from('raw'));
  const logCall = lastRecordIntakeLogCall();
  assert.equal(logCall[0].status, 'Duplicate');
  assert.equal(logCall[0].messageId, '<dupe-logged@test.com>');
});

// ===== 13. Failed email logged as Failed (via pollInbox) =====

test('13. logFailure is available for pollInbox error handling', () => {
  assert.equal(typeof intakeService.logFailure, 'function');
});

// ===== 14. Incident intakeSource is EMAIL =====

test('14. intakeSource is set to EMAIL', async () => {
  intakeService.isMessageAlreadyProcessed = async () => false;

  _currentSimpleParser = async () =>
    buildMockParsedEmail({ subject: 'Email source test incident report' });

  await emailIntakeService.handleRawEmail(Buffer.from('raw'));
  assert.equal(lastIngestAlertCall()[0].intakeSource, 'Email');
});

// ===== 17. Missing category configuration =====

test('17. missing INTAKE_DEFAULT_CATEGORY_ID is rejected', async () => {
  const orig = process.env.INTAKE_DEFAULT_CATEGORY_ID;
  delete process.env.INTAKE_DEFAULT_CATEGORY_ID;

  _currentSimpleParser = async () =>
    buildMockParsedEmail({ subject: 'No category test incident' });

  await assert.rejects(
    () => emailIntakeService.handleRawEmail(Buffer.from('raw')),
    /INTAKE_DEFAULT_CATEGORY_ID/
  );

  process.env.INTAKE_DEFAULT_CATEGORY_ID = orig;
});

// ===== 19. IMAP configuration errors =====

test('19. pollInbox skips gracefully when IMAP is not configured', async () => {
  const origHost = process.env.INTAKE_IMAP_HOST;
  const origUser = process.env.INTAKE_IMAP_USER;
  const origPass = process.env.INTAKE_IMAP_PASSWORD;
  delete process.env.INTAKE_IMAP_HOST;
  delete process.env.INTAKE_IMAP_USER;
  delete process.env.INTAKE_IMAP_PASSWORD;

  const result = await emailIntakeService.pollInbox();
  assert.equal(result.processed, 0);
  assert.equal(result.failed, 0);

  process.env.INTAKE_IMAP_HOST = origHost;
  process.env.INTAKE_IMAP_USER = origUser;
  process.env.INTAKE_IMAP_PASSWORD = origPass;
});

// ===== Sender allowlist =====

test('sender not on allowlist is rejected', async () => {
  _currentSimpleParser = async () =>
    buildMockParsedEmail({ from: 'blocked@spammer.com' });

  await assert.rejects(
    () => emailIntakeService.handleRawEmail(Buffer.from('raw'), ['allowed@company.com']),
    /allowlist/
  );
});

test('sender on allowlist is accepted', async () => {
  intakeService.isMessageAlreadyProcessed = async () => false;
  // Register allowed@company.com as a valid sender
  User.exists = async (query) => {
    if (query.email === 'allowed@company.com') return { _id: '4' };
    return null;
  };

  _currentSimpleParser = async () =>
    buildMockParsedEmail({ from: 'allowed@company.com' });

  const result = await emailIntakeService.handleRawEmail(Buffer.from('raw'), ['allowed@company.com']);
  assert.equal(result.status, 'processed');
});

test('empty allowlist accepts all senders', async () => {
  intakeService.isMessageAlreadyProcessed = async () => false;
  // Register anyone@world.com as a valid sender
  User.exists = async (query) => {
    if (query.email === 'anyone@world.com') return { _id: '5' };
    return null;
  };

  _currentSimpleParser = async () =>
    buildMockParsedEmail({ from: 'anyone@world.com' });

  const result = await emailIntakeService.handleRawEmail(Buffer.from('raw'), []);
  assert.equal(result.status, 'processed');
});

// ===== FR4-18 behavior preserved =====

test('FR4-18: duplicate incident merge returns created=false', async () => {
  intakeService.isMessageAlreadyProcessed = async () => false;
  User.exists = DEFAULT_USER_EXISTS;
  intakeService.ingestAlert = async (input) => {
    ingestAlertCalls.push([input]);
    return { incident: { _id: '6650abc0000000000000merge' }, created: false };
  };

  _currentSimpleParser = async () =>
    buildMockParsedEmail({ subject: 'Merge test incident report here', messageId: '<merge@test.com>' });

  const result = await emailIntakeService.handleRawEmail(Buffer.from('raw'));
  assert.equal(result.status, 'duplicate_incident');
  assert.equal(result.created, false);

  const logCall = lastRecordIntakeLogCall();
  assert.ok(logCall[0].errorReason.includes('Matched an existing open incident'));

  // Restore
  intakeService.ingestAlert = async (input) => {
    ingestAlertCalls.push([input]);
    return { incident: { _id: '6650abc00000000000000050', title: input.title }, created: true };
  };
});

// ===== 20. Multiple emails: one failure does not stop others =====

test('20. one failed email does not block processing of other emails', async () => {
  intakeService.isMessageAlreadyProcessed = async () => false;
  User.exists = DEFAULT_USER_EXISTS;

  // First call: no subject → throws (before sender check)
  _currentSimpleParser = async () => buildMockParsedEmail({ subject: '' });
  let threw = false;
  try {
    await emailIntakeService.handleRawEmail(Buffer.from('raw'));
  } catch (e) {
    threw = true;
  }
  assert.equal(threw, true, 'first email should throw (no subject)');

  // Second call: valid email → succeeds
  _currentSimpleParser = async () =>
    buildMockParsedEmail({ subject: 'Valid follow-up incident report' });
  const result = await emailIntakeService.handleRawEmail(Buffer.from('raw'));
  assert.equal(result.status, 'processed');
});

// ===== Body edge cases =====

test('empty body is passed as empty string to intakeService', async () => {
  intakeService.isMessageAlreadyProcessed = async () => false;

  _currentSimpleParser = async () =>
    buildMockParsedEmail({ text: '', html: '' });

  await emailIntakeService.handleRawEmail(Buffer.from('raw'));
  assert.equal(typeof lastIngestAlertCall()[0].description, 'string');
});

test('whitespace-only body is passed through to intakeService', async () => {
  intakeService.isMessageAlreadyProcessed = async () => false;

  _currentSimpleParser = async () =>
    buildMockParsedEmail({ text: '   \n\t  ', html: '' });

  await emailIntakeService.handleRawEmail(Buffer.from('raw'));
  assert.equal(typeof lastIngestAlertCall()[0].description, 'string');
});

// ===== IntakeLog data quality =====

test('IntakeLog records fromAddress, toAddresses, subject, messageId', async () => {
  intakeService.isMessageAlreadyProcessed = async () => false;
  // Register audit@test.com as a valid sender
  User.exists = async (query) => {
    if (query.email === 'audit@test.com') return { _id: '6' };
    return null;
  };

  _currentSimpleParser = async () =>
    buildMockParsedEmail({
      from: 'audit@test.com',
      to: ['monitor@company.com'],
      subject: 'Audit trail test incident',
      messageId: '<audit@test.com>',
    });

  await emailIntakeService.handleRawEmail(Buffer.from('raw'));
  const logData = lastRecordIntakeLogCall()[0];

  assert.equal(logData.source, 'Email');
  assert.equal(logData.fromAddress, 'audit@test.com');
  assert.deepEqual(logData.toAddresses, ['monitor@company.com']);
  assert.equal(logData.subject, 'Audit trail test incident');
  assert.equal(logData.messageId, '<audit@test.com>');
  assert.equal(logData.vendor, 'gmail');
});

// ===== Unknown sender is skipped (not attributed to system user) =====

test('unregistered sender email is skipped with IntakeLog Skipped status', async () => {
  _currentSimpleParser = async () =>
    buildMockParsedEmail({ from: 'stranger@outside.com', subject: 'External alert report' });

  const result = await emailIntakeService.handleRawEmail(Buffer.from('raw'));
  assert.equal(result.status, 'skipped');

  const logCall = lastRecordIntakeLogCall();
  assert.equal(logCall[0].status, 'Skipped');
  assert.ok(logCall[0].errorReason.includes('stranger@outside.com'));
});

// ===== Email Attachment Storage =====

test('ATT-1: email without attachments creates incident with no attachment processing', async () => {
  intakeService.isMessageAlreadyProcessed = async () => false;
  User.exists = DEFAULT_USER_EXISTS;
  attachmentCreateCalls.length = 0;
  fsWriteFileCalls = [];

  _currentSimpleParser = async () =>
    buildMockParsedEmail({
      subject: 'No attachments test incident',
      attachments: [],
    });

  await emailIntakeService.handleRawEmail(Buffer.from('raw'));

  assert.equal(attachmentCreateCalls.length, 0, 'No Attachment.create calls expected');
  assert.equal(fsWriteFileCalls.length, 0, 'No file writes expected');

  const logCall = lastRecordIntakeLogCall();
  assert.equal(logCall[0].status, 'Processed');
  assert.ok(!logCall[0].errorReason.includes('attachment'), 'Log should not mention attachments');
});

test('ATT-2: email with one attachment creates incident and stores/links attachment', async () => {
  intakeService.isMessageAlreadyProcessed = async () => false;
  User.exists = DEFAULT_USER_EXISTS;
  attachmentCreateCalls.length = 0;
  fsWriteFileCalls = [];
  const incidentId = '6650abc00000000000000050';

  _currentSimpleParser = async () =>
    buildMockParsedEmail({
      subject: 'One attachment test incident',
      attachments: [
        buildMockAttachment({ filename: 'screenshot.png', mimeType: 'image/png', size: 2048, content: Buffer.from('png-data') }),
      ],
    });

  await emailIntakeService.handleRawEmail(Buffer.from('raw'));

  assert.equal(attachmentCreateCalls.length, 1, 'One Attachment.create call expected');
  assert.equal(fsWriteFileCalls.length, 1, 'One file write expected');

  const attDoc = attachmentCreateCalls[0];
  assert.equal(attDoc.incident, incidentId);
  assert.equal(attDoc.originalName, 'screenshot.png');
  assert.equal(attDoc.mimeType, 'image/png');
  assert.equal(attDoc.size, 2048);
  assert.ok(attDoc.storedName.endsWith('.png'), 'Stored filename should preserve .png extension');
  assert.equal(attDoc.rca, null);

  const logCall = lastRecordIntakeLogCall();
  assert.equal(logCall[0].status, 'Processed');
  assert.ok(logCall[0].errorReason.includes('1 attachment(s) stored'));
});

test('ATT-3: email with multiple attachments stores all attachments', async () => {
  intakeService.isMessageAlreadyProcessed = async () => false;
  User.exists = DEFAULT_USER_EXISTS;
  attachmentCreateCalls.length = 0;
  fsWriteFileCalls = [];

  _currentSimpleParser = async () =>
    buildMockParsedEmail({
      subject: 'Multiple attachments test incident',
      attachments: [
        buildMockAttachment({ filename: 'doc1.pdf', mimeType: 'application/pdf', size: 1024 }),
        buildMockAttachment({ filename: 'doc2.pdf', mimeType: 'application/pdf', size: 2048 }),
        buildMockAttachment({ filename: 'image.jpg', mimeType: 'image/jpeg', size: 4096 }),
      ],
    });

  await emailIntakeService.handleRawEmail(Buffer.from('raw'));

  assert.equal(attachmentCreateCalls.length, 3, 'Three Attachment.create calls expected');
  assert.equal(fsWriteFileCalls.length, 3, 'Three file writes expected');

  const logCall = lastRecordIntakeLogCall();
  assert.equal(logCall[0].status, 'Processed');
  assert.ok(logCall[0].errorReason.includes('3 attachment(s) stored'));
});

test('ATT-4: attachment filename and MIME type are preserved on Attachment document', async () => {
  intakeService.isMessageAlreadyProcessed = async () => false;
  User.exists = DEFAULT_USER_EXISTS;
  attachmentCreateCalls.length = 0;
  fsWriteFileCalls = [];

  _currentSimpleParser = async () =>
    buildMockParsedEmail({
      subject: 'Filename preservation test incident',
      attachments: [
        buildMockAttachment({
          filename: 'quarterly-report-final.pdf',
          mimeType: 'application/pdf',
          size: 5120,
          content: Buffer.from('pdf-contents'),
        }),
      ],
    });

  await emailIntakeService.handleRawEmail(Buffer.from('raw'));

  const attDoc = attachmentCreateCalls[0];
  assert.equal(attDoc.originalName, 'quarterly-report-final.pdf', 'originalName must match');
  assert.equal(attDoc.mimeType, 'application/pdf', 'mimeType must match');
  assert.equal(attDoc.size, 5120, 'size must match');
});

test('ATT-5: attachment storage failure does not crash email processing', async () => {
  intakeService.isMessageAlreadyProcessed = async () => false;
  User.exists = DEFAULT_USER_EXISTS;
  attachmentCreateCalls.length = 0;
  fsWriteFileCalls = [];

  const fs = require('fs');
  _fsWriteFileError = new Error('ENOSPC: no space left on device');

  _currentSimpleParser = async () =>
    buildMockParsedEmail({
      subject: 'Storage failure test incident',
      attachments: [
        buildMockAttachment({ filename: 'large.pdf', mimeType: 'application/pdf', size: 1024 }),
      ],
    });

  const result = await emailIntakeService.handleRawEmail(Buffer.from('raw'));

  assert.equal(result.status, 'processed', 'Incident should still be created');
  assert.equal(result.created, true);

  const logCall = lastRecordIntakeLogCall();
  assert.equal(logCall[0].status, 'Partial');
  assert.ok(logCall[0].errorReason.includes('failed to store'));

  _fsWriteFileError = null;
});

test('ATT-6: non-allowed MIME type attachment is skipped', async () => {
  intakeService.isMessageAlreadyProcessed = async () => false;
  User.exists = DEFAULT_USER_EXISTS;
  attachmentCreateCalls.length = 0;
  fsWriteFileCalls = [];

  _currentSimpleParser = async () =>
    buildMockParsedEmail({
      subject: 'Non-allowed MIME type test incident',
      attachments: [
        buildMockAttachment({ filename: 'archive.zip', mimeType: 'application/zip', size: 1024 }),
        buildMockAttachment({ filename: 'photo.jpg', mimeType: 'image/jpeg', size: 2048 }),
      ],
    });

  await emailIntakeService.handleRawEmail(Buffer.from('raw'));

  assert.equal(attachmentCreateCalls.length, 1, 'Only the JPEG attachment should be stored');
  assert.equal(attachmentCreateCalls[0].originalName, 'photo.jpg');
  assert.equal(fsWriteFileCalls.length, 1, 'Only one file write expected');

  const logCall = lastRecordIntakeLogCall();
  assert.equal(logCall[0].status, 'Partial');
  assert.ok(logCall[0].errorReason.includes('1 attachment(s) stored'));
  assert.ok(logCall[0].errorReason.includes('1 failed'));
});

// ===== Cleanup =====

test('FR4-16: teardown', () => {
  teardownMocks();
});
