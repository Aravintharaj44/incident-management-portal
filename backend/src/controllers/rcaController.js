const RootCauseAnalysis = require("../models/RootCauseAnalysis");
const Incident = require("../models/Incident");
const Attachment = require("../models/Attachment");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { successResponse } = require("../utils/apiResponse");
const permissions = require("../services/permissionService");
const { ROLES } = require("../constants");

const rcaFields = ["rootCauseCategory", "rootCauseDescription", "why1", "why2", "why3", "why4", "why5", "contributingFactors", "correctiveActions", "preventiveActions"];
const loadIncident = async (id, user) => {
    const incident = await Incident.findById(id);
    if (!incident) throw ApiError.notFound("Incident not found");
    if (!permissions.canView(user, incident)) throw ApiError.forbidden("You do not have access to this incident");
    return incident;
};
const canAuthor = (user) => [ROLES.ADMIN, ROLES.AGENT].includes(user.role);

const getRca = asyncHandler(async (req, res) => {
    const incident = await loadIncident(req.params.id, req.user);
    const rca = await RootCauseAnalysis.findOne({ incident: incident._id }).populate("author reviewedBy", "name email role").lean();
    const evidence = rca ? await Attachment.find({ rca: rca._id }).populate("uploadedBy", "name email").lean() : [];
    return successResponse(res, 200, "RCA retrieved", { rca, evidence });
});

const saveRca = asyncHandler(async (req, res) => {
    const incident = await loadIncident(req.params.id, req.user);
    if (!canAuthor(req.user)) throw ApiError.forbidden("Only support staff can create or edit an RCA");
    let rca = await RootCauseAnalysis.findOne({ incident: incident._id });
    if (rca?.status === "approved") throw ApiError.badRequest("An approved RCA cannot be edited");
    const values = Object.fromEntries(rcaFields.filter((field) => req.body[field] !== undefined).map((field) => [field, req.body[field]]));
    if (!rca) rca = new RootCauseAnalysis({ incident: incident._id, author: req.user._id, ...values });
    else Object.assign(rca, values);
    await rca.save();
    return successResponse(res, 200, "RCA saved", { rca });
});

const submitRca = asyncHandler(async (req, res) => {
    await loadIncident(req.params.id, req.user);
    const rca = await RootCauseAnalysis.findOne({ incident: req.params.id });
    if (!rca) throw ApiError.notFound("RCA not found");
    if (!canAuthor(req.user) || String(rca.author) !== String(req.user._id) && req.user.role !== ROLES.ADMIN) throw ApiError.forbidden("You cannot submit this RCA");
    if (!rca.rootCauseDescription || !rca.correctiveActions || !rca.preventiveActions) throw ApiError.badRequest("Root cause, corrective actions and preventive actions are required before review");
    rca.status = "in_review"; rca.reviewComment = ""; await rca.save();
    return successResponse(res, 200, "RCA submitted for review", { rca });
});

const reviewRca = asyncHandler(async (req, res) => {
    await loadIncident(req.params.id, req.user);
    if (req.user.role !== ROLES.ADMIN) throw ApiError.forbidden("Only an administrator can approve or return an RCA");
    const rca = await RootCauseAnalysis.findOne({ incident: req.params.id });
    if (!rca || rca.status !== "in_review") throw ApiError.badRequest("No RCA is awaiting review");
    if (!['approved', 'returned'].includes(req.body.status)) throw ApiError.badRequest("Review status must be approved or returned");
    if (req.body.status === 'returned' && !req.body.reviewComment?.trim()) throw ApiError.badRequest("A comment is required when returning an RCA");
    rca.status = req.body.status; rca.reviewedBy = req.user._id; rca.reviewComment = req.body.reviewComment || ""; await rca.save();
    return successResponse(res, 200, req.body.status === 'approved' ? "RCA approved" : "RCA returned for changes", { rca });
});

module.exports = { getRca, saveRca, submitRca, reviewRca };