const express = require("express");

const router = express.Router();
const { ROLES } = require("../constants");
const authorize = require("../middleware/roleCheck");
const {
    getSurvey,
    submitSurvey,
    getCsatStats
} = require("../controllers/surveyController");

const validate = require("../middleware/validate");
const {
    submitSurveyValidator,
} = require("../validators");

router.get("/:token", getSurvey);

router.post(
    "/:token",
    submitSurveyValidator,
    validate,
    submitSurvey
);
router.get("/csat",authorize(ROLES.ADMIN), getCsatStats);
module.exports = router;