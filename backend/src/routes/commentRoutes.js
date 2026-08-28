const express = require("express");
const protect = require("../middleware/auth");
const validate = require("../middleware/validate");
const { commentValidators } = require("../validators");
const {
    updateComment,
    deleteComment,
} = require("../controllers/commentController");

const router = express.Router();

router.use(protect);

/**
 * Comments are created and listed under /incidents/:incidentId/comments.
 * Editing and deleting act on a comment directly, so they live here.
 */
router
    .route("/:id")
    .patch(commentValidators.update, validate, updateComment)
    .delete(commentValidators.byId, validate, deleteComment);

module.exports = router;
