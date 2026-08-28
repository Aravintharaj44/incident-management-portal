const fs = require("fs");
const path = require("path");
const Attachment = require("../models/Attachment");
const Incident = require("../models/Incident");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");
const { successResponse } = require("../utils/apiResponse");
const { removeFile } = require("../middleware/upload");
const activityService = require("../services/activityService");
const permissions = require("../services/permissionService");
const { env } = require("../config/env");
const { ACTIVITY_ACTIONS } = require("../constants");

/**
 * Attachments (FR-08).
 *
 * Files live outside the web root and are streamed back through an
 * authenticated route, so the incident's own permission rules also govern who
 * can download its evidence.
 */

const loadViewableIncident = async (incidentId, user) => {
    const incident = await Incident.findById(incidentId);

    if (!incident) throw ApiError.notFound("Incident not found");

    if (!permissions.canView(user, incident)) {
        throw ApiError.forbidden("You do not have access to this incident");
    }

    return incident;
};

/** POST /api/v1/incidents/:incidentId/attachments */
const uploadAttachments = asyncHandler(async (req, res) => {
    if (!req.files || !req.files.length) {
        throw ApiError.badRequest("No file was uploaded");
    }

    let incident;

    try {
        incident = await loadViewableIncident(req.params.incidentId, req.user);

        if (!permissions.canUploadAttachment(req.user, incident)) {
            throw ApiError.forbidden("You cannot add attachments to this incident");
        }
    } catch (error) {
        // Multer has already written the files to disk; if the request is
        // rejected they must not be left behind as orphans.
        req.files.forEach((file) => removeFile(file.filename));
        throw error;
    }

    const created = await Attachment.insertMany(
        req.files.map((file) => ({
            incident: incident._id,
            originalName: file.originalname,
            storedName: file.filename,
            mimeType: file.mimetype,
            size: file.size,
            uploadedBy: req.user._id,
        }))
    );

    await Incident.updateOne(
        { _id: incident._id },
        { $inc: { attachmentCount: created.length } }
    );

    await activityService.record({
        incident: incident._id,
        action: ACTIVITY_ACTIONS.ATTACHMENT_ADDED,
        performedBy: req.user._id,
        note: created.map((item) => item.originalName).join(", "),
    });

    logger.event("attachments_uploaded", {
        incidentId: incident.id,
        count: created.length,
        by: req.user.id,
    });

    const attachments = await Attachment.find({
        _id: { $in: created.map((item) => item._id) },
    })
        .populate("uploadedBy", "name email")
        .lean();

    return successResponse(
        res,
        201,
        `${created.length} file(s) attached`,
        { attachments }
    );
});

/** GET /api/v1/incidents/:incidentId/attachments */
const listAttachments = asyncHandler(async (req, res) => {
    const incident = await loadViewableIncident(req.params.incidentId, req.user);

    const attachments = await Attachment.find({ incident: incident._id })
        .populate("uploadedBy", "name email")
        .sort({ uploadedAt: -1 })
        .lean();

    return successResponse(res, 200, "Attachments retrieved", { attachments });
});

/**
 * GET /api/v1/attachments/:id/download
 *
 * Accepts the token as a query parameter as well as a header, so the file can
 * be opened straight from a browser tab.
 */
const downloadAttachment = asyncHandler(async (req, res) => {
    const attachment = await Attachment.findById(req.params.id);
    if (!attachment) throw ApiError.notFound("Attachment not found");

    // Permission is checked against the parent incident, not the file.
    await loadViewableIncident(attachment.incident, req.user);

    const filePath = path.join(env.upload.dir, attachment.storedName);

    // `storedName` is generated server-side, but resolving and re-checking the
    // prefix means a tampered database row still cannot escape the folder.
    if (!path.resolve(filePath).startsWith(path.resolve(env.upload.dir))) {
        throw ApiError.badRequest("Invalid attachment path");
    }

    if (!fs.existsSync(filePath)) {
        throw ApiError.notFound("The stored file is missing from the server");
    }

    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(attachment.originalName)}"`
    );

    return fs.createReadStream(filePath).pipe(res);
});

/** DELETE /api/v1/attachments/:id */
const deleteAttachment = asyncHandler(async (req, res) => {
    const attachment = await Attachment.findById(req.params.id);
    if (!attachment) throw ApiError.notFound("Attachment not found");

    const incident = await Incident.findById(attachment.incident);
    if (!incident) throw ApiError.notFound("Incident not found");

    if (!permissions.canDeleteAttachment(req.user, incident, attachment)) {
        throw ApiError.forbidden("You cannot remove this attachment");
    }

    removeFile(attachment.storedName);
    await attachment.deleteOne();

    await Incident.updateOne({ _id: incident._id }, { $inc: { attachmentCount: -1 } });

    await activityService.record({
        incident: incident._id,
        action: ACTIVITY_ACTIONS.ATTACHMENT_REMOVED,
        performedBy: req.user._id,
        note: attachment.originalName,
    });

    logger.event("attachment_deleted", { attachmentId: req.params.id, by: req.user.id });

    return successResponse(res, 200, `"${attachment.originalName}" was removed`);
});

module.exports = {
    uploadAttachments,
    listAttachments,
    downloadAttachment,
    deleteAttachment,
};
