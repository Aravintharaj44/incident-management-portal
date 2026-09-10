const cron = require("node-cron");
const logger = require("../utils/logger");
const { processUnacknowledgedEscalations } = require("../services/escalationService");

const startEscalationJob = () => {
    cron.schedule("* * * * *", async () => {
        await processUnacknowledgedEscalations();
    });

    logger.info("Escalation chain cron worker started. Checking every 60 seconds.");
};

module.exports = {
    startEscalationJob,
};