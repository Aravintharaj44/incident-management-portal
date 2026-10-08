const cron = require("node-cron");
const logger = require("../utils/logger");
const { runSync } = require("../services/zohoSyncService");

const SCHEDULE = process.env.ZOHO_SYNC_CRON || "* * * * *";
let running = false;

const runNow = async (options = {}) => {
    if (running) return { skipped: true };
    running = true;
    try {
        return await runSync(options);
    } finally {
        running = false;
    }
};

const start = () => {
    cron.schedule(SCHEDULE, () => {
        runNow().catch((err) => logger.event("zoho_sync_job_failed", { message: err.message }));
    });
    logger.event("zoho_sync_job_scheduled", { schedule: SCHEDULE });
};

module.exports = { start, runNow };