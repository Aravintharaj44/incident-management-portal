const express = require("express");

const router = express.Router();

const {
    getSurvey,
    submitSurvey,
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

module.exports = router;