const express = require("express");
const protect = require("../middleware/auth");
const validate = require("../middleware/validate");
const { objectId } = require("../validators");
const {
    viewAttachment,
    downloadAttachment,
    deleteAttachment,
} = require("../controllers/attachmentController");

const router = express.Router();

router.use(protect);

// Files are streamed through this route rather than served statically, so the
// parent incident's permissions apply to downloads too.
router.get("/:id/view", [objectId("id")], validate, viewAttachment);
router.get("/:id/download", [objectId("id")], validate, downloadAttachment);
router.delete("/:id", [objectId("id")], validate, deleteAttachment);

module.exports = router;
