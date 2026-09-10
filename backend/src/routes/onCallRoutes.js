const express = require("express");
const router = express.Router();
const roleCheck = require("../middleware/roleCheck");
const { protect } = require("../middleware/auth");
const { ROLES } = require("../constants");
const {
    createRoster,
    acknowledgeIncident,
    getCalendarView,
} = require("../controllers/onCallController");

router.use(protect);

// FR4-21: Roster setup (Admin only)
router.post("/roster", roleCheck(ROLES.ADMIN), createRoster);

// FR4-25: Calendar view (All authenticated users)
router.get("/calendar", getCalendarView);

// FR4-23: Incident acknowledgement
router.post("/incidents/:id/acknowledge", acknowledgeIncident);

module.exports = router;