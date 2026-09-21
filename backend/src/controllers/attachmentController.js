const Attachment = require("../models/Attachment");
const RootCauseAnalysis = require("../models/RootCauseAnalysis");
const Incident = require("../models/Incident");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");
const { successResponse } = require("../utils/apiResponse");
const { removeFile } = require("../middleware/upload");
const storageService = require("../services/storageService");
const crypto = require("crypto");
const path = require("path");
const activityService = require("../services/activityService");
const permissions = require("../services/permissionService");
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

    const rca = req.params.rcaId ? await RootCauseAnalysis.findOne({ _id: req.params.rcaId, incident: incident._id }) : null;
    if (req.params.rcaId && !rca) throw ApiError.notFound("RCA not found for this incident");


    const uploaded = [];
    try {
        for (const file of req.files) {
            const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
            const storedName = file.filename || `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${/^\.[a-z0-9]+$/.test(ext) ? ext : ""}`;
            const storage = await storageService.upload({ incidentId: incident._id, storedName, mimeType: file.mimetype, data: file.buffer, sourcePath: file.path });
            uploaded.push({ file, storedName, storage });
        }
    } catch (error) {
        await Promise.allSettled(uploaded.map(({ storedName, storage }) => storageService.delete({ storedName, ...storage })));
        req.files.forEach((file) => removeFile(file.filename));
        throw error;
    }

    let created;
    try {
        created = await Attachment.insertMany(uploaded.map(({ file, storedName, storage }) => ({
            incident: incident._id, rca: rca?._id || null, originalName: file.originalname, storedName,
            storageProvider: storage.storageProvider, storageKey: storage.storageKey,
            mimeType: file.mimetype, size: file.size, uploadedBy: req.user._id,
        })));
    } catch (error) {
        await Promise.allSettled(uploaded.map(({ storedName, storage }) => storageService.delete({ storedName, ...storage })));
        throw error;
    }

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

    const attachments = await Attachment.find({ incident: incident._id, ...(req.params.rcaId ? { rca: req.params.rcaId } : {}) })
        .populate("uploadedBy", "name email")
        .sort({ uploadedAt: -1 })
        .lean();

    return successResponse(res, 200, "Attachments retrieved", { attachments });
});

const streamAttachment = async (req, res, disposition) => {
    const attachment = await Attachment.findById(req.params.id);
    if (!attachment) throw ApiError.notFound("Attachment not found");

    await loadViewableIncident(attachment.incident, req.user);

    let stream;
    try {
        stream = await storageService.download(attachment);
    } catch (error) {
        if (error.code === "STORAGE_NOT_FOUND") throw ApiError.notFound("The stored file is missing from storage");
        if (error.code === "INVALID_STORAGE_KEY") throw ApiError.badRequest("Invalid attachment path");
        // Keep provider/bucket details out of API responses.
        throw ApiError.internal("Unable to retrieve the attachment");
    }

    const originalName = attachment.originalName || "attachment";
    const safeName = originalName.replace(/["\\\r\n]/g, "_");
    res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(originalName)}`);
    return stream.pipe(res);
};

/** GET /api/v1/attachments/:id/view */
const viewAttachment = asyncHandler(async (req, res) => streamAttachment(req, res, "inline"));

/** GET /api/v1/attachments/:id/download */
const downloadAttachment = asyncHandler(async (req, res) => streamAttachment(req, res, "attachment"));

/** DELETE /api/v1/attachments/:id */
const deleteAttachment = asyncHandler(async (req, res) => {
    const attachment = await Attachment.findById(req.params.id);
    if (!attachment) throw ApiError.notFound("Attachment not found");

    const incident = await Incident.findById(attachment.incident);
    if (!incident) throw ApiError.notFound("Incident not found");

    if (!permissions.canDeleteAttachment(req.user, incident, attachment)) {
        throw ApiError.forbidden("You cannot remove this attachment");
    }

    await storageService.delete(attachment);
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
    viewAttachment,
    downloadAttachment,
    deleteAttachment,
};
