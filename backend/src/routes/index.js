const express = require("express");

const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const categoryRoutes = require("./categoryRoutes");
const incidentRoutes = require("./incidentRoutes");
const commentRoutes = require("./commentRoutes");
const attachmentRoutes = require("./attachmentRoutes");
const dashboardRoutes = require("./dashboardRoutes");
const notificationRoutes = require("./notificationRoutes");

/**
 * Single mount point for the whole API. app.js only has to mount this one
 * router, so adding a resource never means touching the app bootstrap.
 */
const router = express.Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/categories", categoryRoutes);
router.use("/incidents", incidentRoutes);
router.use("/comments", commentRoutes);
router.use("/attachments", attachmentRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/notifications", notificationRoutes);

module.exports = router;
