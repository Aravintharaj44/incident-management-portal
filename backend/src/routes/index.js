const express = require("express");

const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const categoryRoutes = require("./categoryRoutes");
const incidentRoutes = require("./incidentRoutes");
const ticketRoutes = require("./ticketRoutes");
const contactRoutes = require("./contactRoutes");
const articleRoutes = require("./articleRoutes");
const commentRoutes = require("./commentRoutes");
const attachmentRoutes = require("./attachmentRoutes");
const dashboardRoutes = require("./dashboardRoutes");
const notificationRoutes = require("./notificationRoutes");
const departmentRoutes = require("./departmentRoutes");
const problemRoutes = require("./problemRoutes");
const actionItemRoutes = require("./actionItemRoutes");
const KnowlegdgeBaseArticle = require('./knowledgeBaseArticleRoutes');
const surveyRoutes = require("./surveyRoutes");
const oauthRoutes = require("./oauthRoutes");

/**
 * Single mount point for the whole API. app.js only has to mount this one
 * router, so adding a resource never means touching the app bootstrap.
 */
const router = express.Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/categories", categoryRoutes);
router.use("/incidents", incidentRoutes);
router.use("/tickets", ticketRoutes);
router.use("/contacts", contactRoutes);
router.use("/articles", articleRoutes);
router.use("/comments", commentRoutes);
router.use("/attachments", attachmentRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/notifications", notificationRoutes);
router.use("/departments", departmentRoutes);
router.use("/problems", problemRoutes);
router.use("/known-errors", problemRoutes.kedb);
router.use("/action-items", actionItemRoutes);
router.use("/kba",KnowlegdgeBaseArticle);
router.use("/surveys", surveyRoutes);
router.use("/oauth", oauthRoutes);
module.exports = router;
