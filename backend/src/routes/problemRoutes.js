const express = require("express");

const protect = require("../middleware/auth");
const validate = require("../middleware/validate");

const {
    problemValidators,
    knownErrorValidators,
    problemRcaValidators,
    knowledgeBaseArticleValidators,
} = require("../validators");

const {
    listProblems,
    getProblem,
    createProblem,
    updateProblem,
    updateProblemStatus,
    updateProblemOwner,
    linkIncident,
    unlinkIncident,
    deleteProblem,
    listKnownErrors,
    getKnownError,
    suggestProblemFromIncident,
    linkKBArticle,
    unlinkKBArticle,
} = require("../controllers/problemController");

const {
    getProblemRca,
    saveProblemRca,
    submitProblemRca,
    reviewProblemRca,
} = require("../controllers/rcaController");

const router = express.Router();

router.use(protect);

/**
 * Problems (FR4-01)
 */
router.get(
    "/suggestions/incidents/:incidentId",
    problemValidators.suggest,
    validate,
    suggestProblemFromIncident
);

router
    .route("/")
    .get(problemValidators.list, validate, listProblems)
    .post(problemValidators.create, validate, createProblem);

router
    .route("/:id")
    .get(problemValidators.byId, validate, getProblem)
    .patch(problemValidators.update, validate, updateProblem)
    .delete(problemValidators.byId, validate, deleteProblem);

/** Problem workflow (FR4 status/owner) */
router.patch("/:id/status", problemValidators.updateStatus, validate, updateProblemStatus);
router.patch("/:id/owner", problemValidators.updateOwner, validate, updateProblemOwner);

/** Incident <-> Problem linking (FR4-04) */
router.post("/:id/incidents", problemValidators.linkIncident, validate, linkIncident);
router.delete("/:id/incidents/:incidentId", problemValidators.byId, validate, unlinkIncident);

/** Problem <-> KB Article linking (FR4-14) */
router.patch(
    "/:id/kb-article",
    knowledgeBaseArticleValidators.linkKB,
    validate,
    linkKBArticle
);
router.delete(
    "/:id/kb-article",
    problemValidators.byId,
    validate,
    unlinkKBArticle
);

/** Problem-level RCA reusing the existing RCA controller (FR4-06) */
router.route("/:id/rca")
    .get(problemRcaValidators.byProblem, validate, getProblemRca)
    .put(problemRcaValidators.save, validate, saveProblemRca);
router.post("/:id/rca/submit", problemRcaValidators.byProblem, validate, submitProblemRca);
router.patch("/:id/rca/review", problemRcaValidators.review, validate, reviewProblemRca);

module.exports = router;

/**
 * Known Error Database (FR4-03) - mounted separately in routes/index.js.
 */
const routerKedb = express.Router();
routerKedb.use(protect);
routerKedb.get("/", knownErrorValidators.list, validate, listKnownErrors);
routerKedb.get("/:id", knownErrorValidators.byId, validate, getKnownError);

module.exports.kedb = routerKedb;
