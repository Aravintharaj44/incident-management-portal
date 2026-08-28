const express = require("express");
const protect = require("../middleware/auth");
const validate = require("../middleware/validate");
const { objectId } = require("../validators");
const {
    listNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
} = require("../controllers/notificationController");

const router = express.Router();

router.use(protect);

router.get("/", listNotifications);
router.get("/unread-count", getUnreadCount);

// Declared before "/:id/read" so it is not parsed as an id.
router.patch("/read-all", markAllAsRead);

router.patch("/:id/read", [objectId("id")], validate, markAsRead);
router.delete("/:id", [objectId("id")], validate, deleteNotification);

module.exports = router;
