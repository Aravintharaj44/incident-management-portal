const RootCauseAnalysis = require("../models/RootCauseAnalysis");
const Incident = require("../models/Incident");
const Problem = require("../models/Problem");
const Attachment = require("../models/Attachment");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { successResponse } = require("../utils/apiResponse");
const permissions = require("../services/permissionService");
const { ROLES } = require("../constants");

const rcaFields = ["rootCauseCategory", "rootCauseDescription", "why1", "why2", "why3", "why4", "why5", "contributingFactors", "correctiveActions", "preventiveActions"];
const canAuthor = (user) => [ROLES.ADMIN, ROLES.AGENT].includes(user.role);

/**
 * Loads the record (Incident or Problem) an RCA hangs off and checks that the
 * caller may view it. V4 Problem RCAs reuse this exact flow (FR4-06).
 */
const loadAnchor = async (kind, id, user) => {
    if (kind === "incident") {
        const incident = await Incident.findById(id);
        if (!incident) throw ApiError.notFound("Incident not found");
        if (!permissions.canView(user, incident)) throw ApiError.forbidden("You do not have access to this incident");
        return { incident: incident._id };
    }

    const problem = await Problem.findById(id);
    if (!problem) throw ApiError.notFound("Problem not found");
    if (!permissions.canManageProblems(user)) throw ApiError.forbidden("You do not have access to this problem");
    return { problem: problem._id };
};

const findRca = (filter) => RootCauseAnalysis.findOne(filter).populate("author reviewedBy", "name email role").lean();
const findRcaDoc = (filter) => RootCauseAnalysis.findOne(filter);

const getRcaFor = (kind) => asyncHandler(async (req, res) => {
    const anchor = await loadAnchor(kind, req.params.id, req.user);
    const rca = await findRca(anchor);
    const evidence = rca ? await Attachment.find({ rca: rca._id }).populate("uploadedBy", "name email").lean() : [];
    return successResponse(res, 200, "RCA retrieved", { rca, evidence });
});

const saveRcaFor = (kind) => asyncHandler(async (req, res) => {
    const anchor = await loadAnchor(kind, req.params.id, req.user);
    if (!canAuthor(req.user)) throw ApiError.forbidden("Only support staff can create or edit an RCA");
    let rca = await findRcaDoc(anchor);
    if (rca?.status === "approved") throw ApiError.badRequest("An approved RCA cannot be edited");
    const values = Object.fromEntries(rcaFields.filter((field) => req.body[field] !== undefined).map((field) => [field, req.body[field]]));
    if (!rca) rca = new RootCauseAnalysis({ ...anchor, author: req.user._id, ...values });
    else Object.assign(rca, values);
    await rca.save();
    return successResponse(res, 200, "RCA saved", { rca });
});

const submitRcaFor = (kind) => asyncHandler(async (req, res) => {
    await loadAnchor(kind, req.params.id, req.user);
    const rca = await findRcaDoc(loadAnchorFilter(kind, req.params.id));
    if (!rca) throw ApiError.notFound("RCA not found");
    if (!canAuthor(req.user) || String(rca.author) !== String(req.user._id) && req.user.role !== ROLES.ADMIN) throw ApiError.forbidden("You cannot submit this RCA");
    if (!rca.rootCauseDescription || !rca.correctiveActions || !rca.preventiveActions) throw ApiError.badRequest("Root cause, corrective actions and preventive actions are required before review");
    rca.status = "in_review"; rca.reviewComment = ""; await rca.save();
    return successResponse(res, 200, "RCA submitted for review", { rca });
});

const reviewRcaFor = (kind) => asyncHandler(async (req, res) => {
    await loadAnchor(kind, req.params.id, req.user);
    if (req.user.role !== ROLES.ADMIN) throw ApiError.forbidden("Only an administrator can approve or return an RCA");
    const rca = await findRcaDoc(loadAnchorFilter(kind, req.params.id));
    if (!rca || rca.status !== "in_review") throw ApiError.badRequest("No RCA is awaiting review");
    if (!["approved", "returned"].includes(req.body.status)) throw ApiError.badRequest("Review status must be approved or returned");
    if (req.body.status === "returned" && !req.body.reviewComment?.trim()) throw ApiError.badRequest("A comment is required when returning an RCA");
    rca.status = req.body.status; rca.reviewedBy = req.user._id; rca.reviewComment = req.body.reviewComment || ""; await rca.save();
    return successResponse(res, 200, req.body.status === "approved" ? "RCA approved" : "RCA returned for changes", { rca });
});

const loadAnchorFilter = (kind, id) => (kind === "incident" ? { incident: id } : { problem: id });

// Wrap submit/review so the anchor filter helper is available at call time.
const getRca = getRcaFor("incident");
const saveRca = saveRcaFor("incident");
const submitRca = submitRcaFor("incident");
const reviewRca = reviewRcaFor("incident");
const getProblemRca = getRcaFor("problem");
const saveProblemRca = saveRcaFor("problem");
const submitProblemRca = submitRcaFor("problem");
const reviewProblemRca = reviewRcaFor("problem");

module.exports = {
    getRca,
    saveRca,
    submitRca,
    reviewRca,
    getProblemRca,
    saveProblemRca,
    submitProblemRca,
    reviewProblemRca,
};
