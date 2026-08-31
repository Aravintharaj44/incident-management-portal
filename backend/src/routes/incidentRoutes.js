const express = require("express");

const protect = require("../middleware/auth");
const validate = require("../middleware/validate");
const upload = require("../middleware/upload");

const {
    incidentValidators,
    commentValidators,
    incidentLinkValidator,
    rcaValidators,
} = require("../validators");

const {
    listIncidents,
    getIncident,
    createIncident,
    updateIncident,
    updateStatus,
    getAssignmentOptions,
    assignIncident,
    deleteIncident,
    exportIncidents,
} = require("../controllers/incidentController");

const {
    getRca,
    saveRca,
    submitRca,
    reviewRca,
} = require("../controllers/rcaController");

const {
    listComments,
    addComment,
} = require("../controllers/commentController");

const {
    uploadAttachments,
    listAttachments,
} = require("../controllers/attachmentController");

const {
    listIncidentLinks,
    createIncidentLink,
    deleteIncidentLink,
    listCorrelationSuggestions,
    reviewCorrelationSuggestion,
} = require("../controllers/incidentLinkController");

const router = express.Router();

router.use(protect);

/**
 * Export
 */
router.get(
    "/export/csv",
    incidentValidators.list,
    validate,
    exportIncidents
);

/**
 * Incidents
 */
router
    .route("/")
    .get(
        incidentValidators.list,
        validate,
        listIncidents
    )
    .post(
        incidentValidators.create,
        validate,
        createIncident
    );

/**
 * Single incident
 */
router
    .route("/:id")
    .get(
        incidentValidators.byId,
        validate,
        getIncident
    )
    .patch(
        incidentValidators.update,
        validate,
        updateIncident
    )
    .delete(
        incidentValidators.byId,
        validate,
        deleteIncident
    );

/**
 * Workflow
 */
router.patch(
    "/:id/status",
    incidentValidators.updateStatus,
    validate,
    updateStatus
);

router.get(
    "/:id/assignment-options",
    incidentValidators.byId,
    validate,
    getAssignmentOptions
);

router.patch(
    "/:id/assign",
    incidentValidators.assign,
    validate,
    assignIncident
);

/** RCA */
router.route("/:id/rca")
    .get(rcaValidators.byIncident, validate, getRca)
    .put(rcaValidators.save, validate, saveRca);
router.post("/:id/rca/submit", rcaValidators.byIncident, validate, submitRca);
router.patch("/:id/rca/review", rcaValidators.review, validate, reviewRca);

/**
 * Comments
 */
router
    .route("/:incidentId/comments")
    .get(
        commentValidators.byIncidentId,
        validate,
        listComments
    )
    .post(
        commentValidators.create,
        validate,
        addComment
    );

router.route("/:incidentId/rca/:rcaId/attachments")
    .get(commentValidators.byIncidentId, validate, listAttachments)
    .post(upload.array("files", 5), uploadAttachments);

/**
 * Attachments
 */
router
    .route("/:incidentId/attachments")
    .get(
        commentValidators.byIncidentId,
        validate,
        listAttachments
    )
    .post(
        upload.array("files", 5),
        uploadAttachments
    );

/**
 * ============================================================
 * INCIDENT LINKS
 * ============================================================
 *
 * GET:
 *    /api/v1/incidents/:id/links
 *
 * POST:
 *    /api/v1/incidents/:id/links
 *
 * DELETE:
 *    /api/v1/incidents/:id/links/:linkId
 */

router
    .route("/:id/links")
    .get(
        incidentLinkValidator.byIncidentId,
        validate,
        listIncidentLinks
    )
    .post(
        incidentLinkValidator.create,
        validate,
        createIncidentLink
    );

router.get("/:id/correlation-suggestions", incidentLinkValidator.byIncidentId, validate, listCorrelationSuggestions);
router.patch("/:id/correlation-suggestions/:suggestionId", incidentLinkValidator.reviewSuggestion, validate, reviewCorrelationSuggestion);

router.delete(
    "/:id/links/:linkId",
    incidentLinkValidator.remove,
    validate,
    deleteIncidentLink
);

module.exports = router;
