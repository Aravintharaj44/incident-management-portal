const cron = require('node-cron');
const emailIntakeService = require('../services/emailIntakeService');
const logger = require('../utils/logger');

/**
 * emailIntakeJob
 * FR4-16 — polls the monitored mailbox every few minutes so inbound
 * emails become incidents without anyone having to check the inbox by hand.
 *
 * Schedule is configurable via INTAKE_POLL_CRON (default: every 2 minutes).
 * Follows the same node-cron pattern as cron/overdueIncidentJob.js.
 */
function startEmailIntakeJob() {
  const schedule = process.env.INTAKE_POLL_CRON || '*/2 * * * *';

  if (!cron.validate(schedule)) {
    logger.error(`[emailIntakeJob] Invalid cron schedule "${schedule}" — job not started.`);
    return;
  }

  cron.schedule(schedule, async () => {
    try {
      await emailIntakeService.pollInbox();
    } catch (err) {
      // pollInbox already logs per-message failures to IntakeLog; this
      // catch is only for connection-level failures (bad creds, network).
      logger.error(`[emailIntakeJob] Poll cycle failed: ${err.message}`);
    }
  });

  logger.info(`[emailIntakeJob] Scheduled with cron expression "${schedule}".`);
}

module.exports = startEmailIntakeJob;
