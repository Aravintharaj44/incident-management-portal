const mongoose = require("mongoose");
const Problem = require("../models/Problem");
const Incident = require("../models/Incident");
const User = require("../models/User");
const RootCauseAnalysis = require("../models/RootCauseAnalysis");
const KBArticle = require("../models/KnowledgeBaseArticle");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");
const { containsPattern } = require("../utils/escapeRegex");
const { successResponse, paginatedResponse } = require("../utils/apiResponse");
const { getPagination } = require("../utils/pagination");
const activityService = require("../services/activityService");
const permissions = require("../services/permissionService");
const {
    ROLES,
    PROBLEM_STATUS,
    PROBLEM_STATUS_VALUES,
    PROBLEM_STATUS_LABELS,
    ACTIVITY_ACTIONS,
} = require("../constants");

const isValidId = (value) => mongoose.Types.ObjectId.isValid(value);

const POPULATE = [
    { path: "category", select: "name isActive" },
    { path: "ownerId", select: "name email role isActive" },
    { path: "kbArticleId", select: "title status categories" },
];

/**
 * Every Problem endpoint is staff-only. Non-staff are rejected up front even
 * though the visibility filter also excludes them.
 */
const requireStaff = (user) => {
    if (!permissions.canManageProblems(user)) {
        throw ApiError.forbidden("You do not have permission to manage problems");
    }
};

const loadProblem = async (id, user) => {
    if (!isValidId(id)) throw ApiError.badRequest("Invalid problem ID");
    const problem = await Problem.findById(id).populate(POPULATE);
    if (!problem) throw ApiError.notFound("Problem not found");
    requireStaff(user);
    return problem;
};

/** Only active Admins and Support Agents may own a Problem (FR4-05). */
const resolveEligibleOwner = async (ownerId) => {
    if (!ownerId) throw ApiError.badRequest("An owner is required");
    const user = await User.findById(ownerId);
    if (!user || user.isActive === false) throw ApiError.badRequest("The selected owner is not an active user");
    if (![ROLES.ADMIN, ROLES.AGENT].includes(user.role)) {
        throw ApiError.badRequest("Only an administrator or support agent can own a problem");
    }
    return user;
};

const SORTABLE_FIELDS = {
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    title: "title",
    status: "status",
    problemNumber: "problemNumber",
};

const buildSort = (query) => {
    const field = SORTABLE_FIELDS[query.sortBy] || "createdAt";
    const direction = query.sortOrder === "asc" ? 1 : -1;
    return field === "createdAt" ? { createdAt: direction } : { [field]: direction, createdAt: -1 };
};

const toArray = (value) => {
    if (value === undefined || value === null || value === "") return [];
    const raw = Array.isArray(value) ? value : String(value).split(",");
    return raw.map((item) => String(item).trim()).filter(Boolean);
};

/**
 * GET /api/v1/problems
 * Search, filter, sort and paginate the Problem queue (FR4-01).
 */
const listProblems = asyncHandler(async (req, res) => {
    requireStaff(req.user);
    const { search, status, ownerId, category } = req.query;

    const conditions = [permissions.problemVisibilityFilter(req.user)];

    const statuses = toArray(status).filter((s) => PROBLEM_STATUS_VALUES.includes(s));
    if (statuses.length) conditions.push({ status: { $in: statuses } });

    if (ownerId === "me") {
        conditions.push({ ownerId: req.user._id });
    } else if (ownerId && isValidId(ownerId)) {
        conditions.push({ ownerId });
    }

    if (category && isValidId(category)) conditions.push({ category });

    if (search && String(search).trim()) {
        const pattern = containsPattern(search);
        conditions.push({
            $or: [{ title: pattern }, { description: pattern }, { problemNumber: pattern }, { workaround: pattern }],
        });
    }

    const filter = conditions.length === 1 ? conditions[0] : { $and: conditions };
    const { page, limit, skip } = getPagination(req.query, { defaultLimit: 10 });

    const [problems, total] = await Promise.all([
        Problem.find(filter).populate(POPULATE).sort(buildSort(req.query)).skip(skip).limit(limit).lean(),
        Problem.countDocuments(filter),
    ]);

    return paginatedResponse(res, "Problems retrieved", problems, { page, limit, total });
});

/**
 * GET /api/v1/problems/:id
 * Detail plus linked incidents, RCA and activity in a single round trip.
 */
const getProblem = asyncHandler(async (req, res) => {
    const problem = await loadProblem(req.params.id, req.user);

    const [incidents, rca, activity] = await Promise.all([
        Incident.find({ problemId: problem._id })
            .populate("category reportedBy assignedTo", "name email role isActive name")
            .sort({ createdAt: -1 })
            .lean(),
        RootCauseAnalysis.findOne({ problem: problem._id }).populate("author reviewedBy", "name email role").lean(),
        activityService.listForProblem(problem._id),
    ]);

    return successResponse(res, 200, "Problem retrieved", {
        problem,
        incidents,
        rca,
        activity,
        permissions: {
            canManage: permissions.canManageProblems(req.user),
            isAdmin: permissions.isAdmin(req.user),
        },
    });
});

/**
 * POST /api/v1/problems (FR4-01)
 * Staff create a Problem, optionally grouping supplied incidents right away.
 */
const createProblem = asyncHandler(async (req, res) => {
    requireStaff(req.user);
    const { title, description, workaround, ownerId, incidentIds } = req.body;

    let owner = null;
    if (ownerId) owner = await resolveEligibleOwner(ownerId);

    // Group the supplied incidents (FR4-01/04) and derive the category from
    // them, mirroring how a problem inherits its theme from its incidents.
    const incidents = Array.isArray(incidentIds) && incidentIds.length
        ? await Incident.find({ _id: { $in: incidentIds } }).lean()
        : [];
    if (incidents.length !== (incidentIds?.length || 0)) {
        throw ApiError.badRequest("One or more selected incidents do not exist");
    }
    for (const incident of incidents) {
        if (!permissions.canView(req.user, incident)) {
            throw ApiError.forbidden("You do not have access to one of the selected incidents");
        }
    }

    const problem = await Problem.create({
        title,
        description,
        workaround: workaround || "",
        ownerId: owner ? owner._id : null,
        category: incidents.length ? incidents[0].category : (req.body.category || null),
        status: PROBLEM_STATUS.NEW,
    });

    await activityService.record({
        problem: problem._id,
        action: ACTIVITY_ACTIONS.PROBLEM_CREATED,
        performedBy: req.user._id,
        note: owner ? `Problem created and assigned to ${owner.name}` : "Problem created",
    });

    // Link the supplied incidents to the new problem. They were fetched with
    // .lean(), so update them in place rather than calling save() on a plain doc.
    for (const incident of incidents) {
        await Incident.updateOne({ _id: incident._id }, { $set: { problemId: problem._id } });
        await activityService.record({
            incident: incident._id,
            action: ACTIVITY_ACTIONS.INCIDENT_PROBLEM_LINKED,
            performedBy: req.user._id,
            note: `Linked to ${problem.problemNumber}`,
        });
    }

    logger.event("problem_created", { problemId: problem.id, number: problem.problemNumber, by: req.user.id });

    const created = await Problem.findById(problem._id).populate(POPULATE).lean();
    return successResponse(res, 201, "Problem created successfully", { problem: created });
});

/**
 * PATCH /api/v1/problems/:id
 * Edits the descriptive fields. Status and owner have their own endpoints.
 */
const updateProblem = asyncHandler(async (req, res) => {
    const problem = await loadProblem(req.params.id, req.user);
    if (!permissions.canManageProblems(req.user)) throw ApiError.forbidden("You do not have permission to edit this problem");

    const { title, description, workaround } = req.body;
    const auditEntries = [];

    if (title !== undefined && title !== problem.title) {
        auditEntries.push({
            problem: problem._id,
            action: ACTIVITY_ACTIONS.PROBLEM_UPDATED,
            performedBy: req.user._id,
            field: "title",
            oldValue: problem.title,
            newValue: title,
        });
        problem.title = title;
    }
    if (description !== undefined && description !== problem.description) {
        auditEntries.push({
            problem: problem._id,
            action: ACTIVITY_ACTIONS.PROBLEM_UPDATED,
            performedBy: req.user._id,
            field: "description",
            note: "Description updated",
        });
        problem.description = description;
    }
    if (workaround !== undefined && workaround !== problem.workaround) {
        auditEntries.push({
            problem: problem._id,
            action: ACTIVITY_ACTIONS.PROBLEM_UPDATED,
            performedBy: req.user._id,
            field: "workaround",
            note: "Workaround updated",
        });
        problem.workaround = workaround;
    }

    if (!auditEntries.length) throw ApiError.badRequest("No changes were supplied");

    await problem.save();
    await activityService.recordMany(auditEntries);

    const updated = await Problem.findById(problem._id).populate(POPULATE).lean();
    return successResponse(res, 200, "Problem updated", { problem: updated });
});

/**
 * PATCH /api/v1/problems/:id/status (FR4 status workflow)
 * Validated transitions; sets/clears resolvedAt to stay consistent.
 */
const updateProblemStatus = asyncHandler(async (req, res) => {
    const problem = await loadProblem(req.params.id, req.user);
    if (!permissions.canManageProblems(req.user)) throw ApiError.forbidden("You do not have permission to change this problem's status");

    const { status } = req.body;
    const oldStatus = problem.status;
    permissions.assertProblemTransition(oldStatus, status);

    problem.status = status;
    if (status === PROBLEM_STATUS.RESOLVED) {
        problem.resolvedAt = new Date();
    } else if (oldStatus === PROBLEM_STATUS.RESOLVED) {
        problem.resolvedAt = null;
    }

    await problem.save();

    await activityService.record({
        problem: problem._id,
        action: ACTIVITY_ACTIONS.PROBLEM_STATUS_CHANGED,
        performedBy: req.user._id,
        field: "status",
        oldValue: PROBLEM_STATUS_LABELS[oldStatus],
        newValue: PROBLEM_STATUS_LABELS[status],
    });

    logger.event("problem_status_changed", { problemId: problem.id, from: oldStatus, to: status, by: req.user.id });

    const updated = await Problem.findById(problem._id).populate(POPULATE).lean();
    return successResponse(res, 200, `Problem status changed to ${PROBLEM_STATUS_LABELS[status]}`, { problem: updated });
});

/**
 * PATCH /api/v1/problems/:id/owner (FR4-05)
 * Assign/change owner; backend validates an active Admin/Agent.
 */
const updateProblemOwner = asyncHandler(async (req, res) => {
    const problem = await loadProblem(req.params.id, req.user);
    if (!permissions.canManageProblems(req.user)) throw ApiError.forbidden("You do not have permission to change this problem's owner");

    const { ownerId } = req.body;
    const newOwner = await resolveEligibleOwner(ownerId);
    const previousName = problem.ownerId?.name || "Unassigned";

    if (problem.ownerId && String(problem.ownerId._id) === String(newOwner._id)) {
        throw ApiError.badRequest("This problem is already owned by that user");
    }

    problem.ownerId = newOwner._id;
    await problem.save();

    await activityService.record({
        problem: problem._id,
        action: ACTIVITY_ACTIONS.PROBLEM_OWNER_CHANGED,
        performedBy: req.user._id,
        field: "ownerId",
        oldValue: previousName,
        newValue: newOwner.name,
    });

    const updated = await Problem.findById(problem._id).populate(POPULATE).lean();
    return successResponse(res, 200, `Problem assigned to ${newOwner.name}`, { problem: updated });
});

/**
 * POST /api/v1/problems/:id/incidents (FR4-04)
 * Link an existing incident to a Problem.
 */
const linkIncident = asyncHandler(async (req, res) => {
    const problem = await loadProblem(req.params.id, req.user);
    requireStaff(req.user);

    const { incidentId } = req.body;
    if (!isValidId(incidentId)) throw ApiError.badRequest("Invalid incident ID");

    const incident = await Incident.findById(incidentId).populate("reportedBy", "name email role").lean();
    if (!incident) throw ApiError.notFound("Incident not found");
    if (!permissions.canView(req.user, incident)) throw ApiError.forbidden("You do not have access to this incident");

    if (incident.problemId && String(incident.problemId) === String(problem._id)) {
        throw ApiError.badRequest("This incident is already linked to this problem");
    }
    if (incident.problemId) {
        throw ApiError.badRequest("This incident is already linked to another problem");
    }

    await Incident.updateOne({ _id: incident._id }, { $set: { problemId: problem._id } });

    await activityService.record({
        incident: incident._id,
        action: ACTIVITY_ACTIONS.INCIDENT_PROBLEM_LINKED,
        performedBy: req.user._id,
        note: `Linked to ${problem.problemNumber}`,
    });
    await activityService.record({
        problem: problem._id,
        action: ACTIVITY_ACTIONS.INCIDENT_PROBLEM_LINKED,
        performedBy: req.user._id,
        note: `Linked to ${incident.incidentNumber}`,
    });

    return successResponse(res, 200, `Incident ${incident.incidentNumber} linked to the problem`);
});

/**
 * DELETE /api/v1/problems/:id/incidents/:incidentId (FR4-04)
 * Unlink an incident from a Problem.
 */
const unlinkIncident = asyncHandler(async (req, res) => {
    const problem = await loadProblem(req.params.id, req.user);
    requireStaff(req.user);

    const { incidentId } = req.params;
    if (!isValidId(incidentId)) throw ApiError.badRequest("Invalid incident ID");

    const incident = await Incident.findById(incidentId).lean();
    if (!incident) throw ApiError.notFound("Incident not found");
    if (!incident.problemId || String(incident.problemId) !== String(problem._id)) {
        throw ApiError.badRequest("This incident is not linked to this problem");
    }

    await Incident.updateOne({ _id: incident._id }, { $set: { problemId: null } });

    await activityService.record({
        incident: incident._id,
        action: ACTIVITY_ACTIONS.INCIDENT_PROBLEM_UNLINKED,
        performedBy: req.user._id,
        note: `Removed from ${problem.problemNumber}`,
    });
    await activityService.record({
        problem: problem._id,
        action: ACTIVITY_ACTIONS.INCIDENT_PROBLEM_UNLINKED,
        performedBy: req.user._id,
        note: `Removed ${incident.incidentNumber}`,
    });

    return successResponse(res, 200, `Incident ${incident.incidentNumber} removed from the problem`);
});

/**
 * DELETE /api/v1/problems/:id (Admin only)
 * Removes the Problem and its problem-scoped RCA/activity, never touching the
 * incidents themselves or their shared V3 relationships.
 */
const deleteProblem = asyncHandler(async (req, res) => {
    const problem = await loadProblem(req.params.id, req.user);
    if (!permissions.isAdmin(req.user)) throw ApiError.forbidden("Only an administrator can delete a problem");

    // Detach incidents so they continue to work normally.
    await Incident.updateMany({ problemId: problem._id }, { $set: { problemId: null } });

    const ActivityLog = require("../models/ActivityLog");
    await Promise.all([
        ActivityLog.deleteMany({ problem: problem._id }),
        RootCauseAnalysis.deleteMany({ problem: problem._id }),
    ]);

    await problem.deleteOne();
    logger.event("problem_deleted", { problemId: problem.id, number: problem.problemNumber, by: req.user.id });
    return successResponse(res, 200, `${problem.problemNumber} was deleted`);
});

/**
 * GET /api/v1/problems/suggestions/incidents/:incidentId (FR4-02)
 *
 * Auto-suggestion reuses the existing V3 correlation logic: same category,
 * within the correlation window, textually similar. It only *suggests* - an
 * authorized user decides whether to create a Problem. No auto-creation.
 */
const suggestProblemFromIncident = asyncHandler(async (req, res) => {
    requireStaff(req.user);
    const { incidentId } = req.params;
    if (!isValidId(incidentId)) throw ApiError.badRequest("Invalid incident ID");

    const IncidentCorrelationSuggestion = require("../models/IncidentCorrelationSuggestion");
    const IncidentLink = require("../models/IncidentLink");

    const incident = await Incident.findById(incidentId).populate("category", "name isActive").lean();
    if (!incident) throw ApiError.notFound("Incident not found");
    if (!permissions.canView(req.user, incident)) throw ApiError.forbidden("You do not have access to this incident");

    const windowHours = Math.max(1, Number(process.env.CORRELATION_WINDOW_HOURS || 72));
    const from = new Date(incident.createdAt.getTime() - windowHours * 36e5);
    const to = new Date(incident.createdAt.getTime() + windowHours * 36e5);

    const existingLinks = await IncidentLink.find({ $or: [{ fromIncidentId: incident._id }, { toIncidentId: incident._id }] }).lean();
    const excludedIds = existingLinks.map((link) => String(link.fromIncidentId) === String(incident._id) ? link.toIncidentId : link.fromIncidentId);

    // Same category + same window as V3 correlation.
    const candidates = await Incident.find({
        _id: { $nin: [incident._id, ...excludedIds] },
        category: incident.category,
        createdAt: { $gte: from, $lte: to },
    })
        .select("incidentNumber title description status")
        .lean();

    const suggestions = candidates.map((candidate) => ({
        incidentId: candidate._id,
        incidentNumber: candidate.incidentNumber,
        title: candidate.title,
        status: candidate.status,
    }));

    return successResponse(res, 200, "Problem suggestion retrieved", {
        incident: { _id: incident._id, incidentNumber: incident.incidentNumber, title: incident.title, category: incident.category },
        suggestion: suggestions.length >= 2 ? {
            canCreate: true,
            message: `${suggestions.length} related incidents with the same category were found within the correlation window. Create a Problem to group them.`,
            relatedIncidents: suggestions,
        } : {
            canCreate: false,
            message: "Not enough related incidents to suggest grouping into a Problem.",
            relatedIncidents: suggestions,
        },
    });
});

/**
 * GET /api/v1/known-errors (FR4-03)
 * The searchable Known Error Database. Only Problems in "Known Error" status
 * appear; searches the title/description/workaround fields.
 */
const listKnownErrors = asyncHandler(async (req, res) => {
    requireStaff(req.user);
    const { search } = req.query;
    const conditions = [{ status: PROBLEM_STATUS.KNOWN_ERROR }];

    if (search && String(search).trim()) {
        const pattern = containsPattern(search);
        conditions.push({
            $or: [{ title: pattern }, { description: pattern }, { workaround: pattern }, { problemNumber: pattern }],
        });
    }

    const filter = conditions.length === 1 ? conditions[0] : { $and: conditions };
    const { page, limit, skip } = getPagination(req.query, { defaultLimit: 10 });

    const [items, total] = await Promise.all([
        Problem.find(filter).populate(POPULATE).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
        Problem.countDocuments(filter),
    ]);

    return paginatedResponse(res, "Known errors retrieved", items, { page, limit, total });
});

/**
 * GET /api/v1/known-errors/:id (FR4-03)
 * Full Known Error detail: workaround, RCA (if any) and linked incidents.
 */
const getKnownError = asyncHandler(async (req, res) => {
    requireStaff(req.user);
    const { id } = req.params;
    if (!isValidId(id)) throw ApiError.badRequest("Invalid problem ID");

    const problem = await Problem.findById(id).populate(POPULATE);
    if (!problem) throw ApiError.notFound("Known error not found");
    if (problem.status !== PROBLEM_STATUS.KNOWN_ERROR) {
        throw ApiError.notFound("Known error not found");
    }

    const [rca, incidents] = await Promise.all([
        RootCauseAnalysis.findOne({ problem: problem._id }).populate("author reviewedBy", "name email role").lean(),
        Incident.find({ problemId: problem._id })
            .populate("category reportedBy", "name email role isActive name")
            .sort({ createdAt: -1 })
            .lean(),
    ]);

    return successResponse(res, 200, "Known error retrieved", { problem, rca, incidents });
});

/**
 * PATCH /api/v1/problems/:id/kb-article (FR4-14)
 * Link a published KB article to this problem.
 */
const linkKBArticle = asyncHandler(async (req, res) => {
    const problem = await loadProblem(req.params.id, req.user);

    const { kbArticleId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(kbArticleId)) {
        throw ApiError.badRequest("Invalid KB article ID");
    }

    const article = await KBArticle.findById(kbArticleId);
    if (!article) throw ApiError.notFound("KB article not found");
    if (article.status !== "published") {
        throw ApiError.badRequest("Only published articles can be linked");
    }

    problem.kbArticleId = article._id;
    await problem.save();

    await activityService.record({
        problem: problem._id,
        action: ACTIVITY_ACTIONS.KB_ARTICLE_LINKED,
        performedBy: req.user._id,
        field: "kbArticleId",
        oldValue: "None",
        newValue: article.title,
    });

    const updated = await Problem.findById(problem._id).populate(POPULATE).lean();
    return successResponse(res, 200, `KB article linked to ${problem.problemNumber}`, {
        problem: updated,
    });
});

/**
 * DELETE /api/v1/problems/:id/kb-article (FR4-14)
 * Unlink the KB article from this problem.
 */
const unlinkKBArticle = asyncHandler(async (req, res) => {
    const problem = await loadProblem(req.params.id, req.user);

    if (!problem.kbArticleId) {
        throw ApiError.badRequest("This problem has no linked KB article");
    }

    const articleTitle = problem.kbArticleId?.title || "a KB article";

    await Problem.updateOne({ _id: problem._id }, { $set: { kbArticleId: null } });

    await activityService.record({
        problem: problem._id,
        action: ACTIVITY_ACTIONS.KB_ARTICLE_UNLINKED,
        performedBy: req.user._id,
        field: "kbArticleId",
        oldValue: articleTitle,
        newValue: "None",
    });

    const updated = await Problem.findById(problem._id).populate(POPULATE).lean();
    return successResponse(res, 200, `KB article unlinked from ${problem.problemNumber}`, {
        problem: updated,
    });
});

module.exports = {
    listProblems,
    getProblem,
    createProblem,
    updateProblem,
    updateProblemStatus,
    updateProblemOwner,
    linkIncident,
    unlinkIncident,
    deleteProblem,
    listKnownErrors,
    getKnownError,
    suggestProblemFromIncident,
    linkKBArticle,
    unlinkKBArticle,
};
