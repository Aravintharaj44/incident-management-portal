// src/routes/cronRoutes.js
const express = require("express");
const router = express.Router();

const { processOverdueIncidents } = require("../cron/overdueIncidentJob");
const { processOverdueActionItems } = require("../cron/overdueActionItemJob");
const { processUnacknowledgedEscalations } = require("../services/escalationService");
const emailIntakeService = require("../services/emailIntakeService");
const logger = require("../utils/logger");

// Verify the request actually came from Vercel's cron scheduler
function verifyCronSecret(req, res, next) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    next();
}

router.use(verifyCronSecret);

router.get("/overdue-incidents", async (req, res) => {
    await processOverdueIncidents();
    res.status(200).json({ success: true });
});

router.get("/overdue-action-items", async (req, res) => {
    await processOverdueActionItems();
    res.status(200).json({ success: true });
});

router.get("/escalations", async (req, res) => {
    await processUnacknowledgedEscalations();
    res.status(200).json({ success: true });
});

router.get("/email-intake", async (req, res) => {
    await emailIntakeService.pollInbox();
    res.status(200).json({ success: true });
});

router.get("/zoho-sync", async (req, res) => {
    const zohoSyncJob = require("../cron/zohoSyncJob");
    await zohoSyncJob.syncZohoData();
    res.status(200).json({ success: true });
});

module.exports = router;