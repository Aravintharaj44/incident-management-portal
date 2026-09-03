const express = require("express");

const protect = require("../middleware/auth");
const validate = require("../middleware/validate");
const {
    knowledgeBaseArticleValidators,
} = require("../validators");
const {
    listKBA,
    getKBA,
    createKBA,
    updateKBA,
    deleteKBA,
    feedbackKBA,
    suggestKBA,
} = require("../controllers/knowledgeBaseArticleController");

const router = express.Router();

router.use(protect);

router.get("/suggestions", knowledgeBaseArticleValidators.list, validate, suggestKBA);
router.get("/", knowledgeBaseArticleValidators.list, validate, listKBA);
router.get("/:id", knowledgeBaseArticleValidators.byId, validate, getKBA);
router.post(
    "/",
    knowledgeBaseArticleValidators.create,
    validate,
    createKBA
);
router.patch(
    "/:id",
    knowledgeBaseArticleValidators.update,
    validate,
    updateKBA
);
router.delete("/:id", knowledgeBaseArticleValidators.byId, validate, deleteKBA);
router.post(
    "/:id/feedback",
    knowledgeBaseArticleValidators.feedback,
    validate,
    feedbackKBA
);

module.exports = router;
