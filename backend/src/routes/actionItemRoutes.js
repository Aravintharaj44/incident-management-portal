const express = require("express");
const protect = require("../middleware/auth");
const validate = require("../middleware/validate");
const { actionItemValidators } = require("../validators");
const {
    listActionItems,
    getActionItem,
    createActionItem,
    updateActionItem,
    updateActionItemStatus,
    updateActionItemOwner,
    deleteActionItem,
} = require("../controllers/actionItemController");

const router = express.Router();

router.use(protect);

/**
 * RCA Action Items (FR4-07..10).
 *
 * Mounted at /api/v1/action-items (see routes/index.js). Both incident- and
 * problem-anchored RCAs are covered by the same endpoints; the RCA itself
 * carries the anchor.
 */
router
    .route("/")
    .get(actionItemValidators.list, validate, listActionItems)
    .post(actionItemValidators.create, validate, createActionItem);

router
    .route("/:id")
    .get(actionItemValidators.byId, validate, getActionItem)
    .patch(actionItemValidators.update, validate, updateActionItem)
    .delete(actionItemValidators.byId, validate, deleteActionItem);

router.patch(
    "/:id/status",
    actionItemValidators.updateStatus,
    validate,
    updateActionItemStatus
);

router.patch(
    "/:id/owner",
    actionItemValidators.updateOwner,
    validate,
    updateActionItemOwner
);

module.exports = router;
