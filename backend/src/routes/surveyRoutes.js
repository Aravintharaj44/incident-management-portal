const express = require("express");

const router = express.Router();

const { ROLES } = require("../constants");
const authorize = require("../middleware/roleCheck");

const {
    getSurvey,
    submitSurvey,
    getCsatStats,
    getCsatTrend,
} = require("../controllers/surveyController");

const validate = require("../middleware/validate");
const protect = require("../middleware/auth");
const {
    submitSurveyValidator,
    getCsatTrendValidator,
} = require("../validators");

// CSAT statistics (Admin + Agent)
router.get(
    "/csat",
    protect,
    authorize(ROLES.ADMIN, ROLES.AGENT),
    getCsatStats
);

// CSAT trend over time (Admin + Agent)
router.get(
    "/csat/trend",
    protect,
    authorize(ROLES.ADMIN, ROLES.AGENT),
    getCsatTrendValidator,
    validate,
    getCsatTrend
);

// Public survey
router.get("/:token", getSurvey);

router.post(
    "/:token",
    submitSurveyValidator,
    validate,
    submitSurvey
);

module.exports = router;
