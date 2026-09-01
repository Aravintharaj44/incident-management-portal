const express = require("express");
const protect = require("../middleware/auth");
const authorize = require("../middleware/roleCheck");
const { ROLES } = require("../constants");
const {
    getSummary,
    getCharts,
    getAgentWorkload,
    getRecentIncidents,
    getAdvancedAnalytics,
    getActionItemSummary,
} = require("../controllers/dashboardController");

const router = express.Router();

router.use(protect);

// Each of these is scoped to what the caller may see, so all three roles can
// call them and simply get different numbers.
router.get("/summary", getSummary);
router.get("/charts", getCharts);
router.get("/recent", getRecentIncidents);
router.get("/advanced", getAdvancedAnalytics);
// Action items are a staff concern (FR4-09): an End User gets nothing.
router.get("/action-items", authorize(ROLES.ADMIN, ROLES.AGENT), getActionItemSummary);

// Cross-agent workload is a management view.
router.get("/workload", authorize(ROLES.ADMIN), getAgentWorkload);

module.exports = router;
