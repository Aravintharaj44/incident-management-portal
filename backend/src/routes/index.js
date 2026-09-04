const express = require("express");

const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const categoryRoutes = require("./categoryRoutes");
const incidentRoutes = require("./incidentRoutes");
const commentRoutes = require("./commentRoutes");
const attachmentRoutes = require("./attachmentRoutes");
const dashboardRoutes = require("./dashboardRoutes");
const notificationRoutes = require("./notificationRoutes");
const departmentRoutes = require("./departmentRoutes");
const problemRoutes = require("./problemRoutes");
const webhookRoutes = require("./webhookRoutes");
const intakeRoutes = require("./intakeRoutes");
const actionItemRoutes = require("./actionItemRoutes");
const KnowlegdgeBaseArticle = require('./knowledgeBaseArticleRoutes');
const surveyRoutes = require("./surveyRoutes");

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
router.use("/departments", departmentRoutes);
router.use("/problems", problemRoutes);
router.use("/known-errors", problemRoutes.kedb);
router.use("/webhooks", webhookRoutes);
router.use("/intake", intakeRoutes);

router.use("/action-items", actionItemRoutes);
router.use("/kba",KnowlegdgeBaseArticle);
router.use("/surveys", surveyRoutes);
module.exports = router;
