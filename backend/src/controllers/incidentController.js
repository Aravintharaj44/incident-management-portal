const mongoose = require("mongoose");
const Incident = require("../models/Incident");
const Category = require("../models/Category");
const User = require("../models/User");
const Comment = require("../models/Comment");
const Attachment = require("../models/Attachment");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");
const { containsPattern } = require("../utils/escapeRegex");
const { successResponse, paginatedResponse } = require("../utils/apiResponse");
const { getPagination } = require("../utils/pagination");
const { toCsv, sendCsv } = require("../utils/csv");
const activityService = require("../services/activityService");
const notificationService = require("../services/notificationService");
const permissions = require("../services/permissionService");
const slaService = require("../services/slaService");
const IncidentLink = require("../models/IncidentLink");
const RootCauseAnalysis = require("../models/RootCauseAnalysis");
const {
    ROLES,
    STATUS,
    STATUS_VALUES,
    STATUS_LABELS,
    PRIORITY,
    PRIORITY_VALUES,
    PRIORITY_LABELS,
    TERMINAL_STATUSES,
    ACTIVITY_ACTIONS,
} = require("../constants");

/** Fields the client may sort by, mapped to real schema paths. */
const SORTABLE_FIELDS = {
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    dueBy: "dueBy",
    title: "title",
    status: "status",
    priority: "priorityWeight",
    incidentNumber: "incidentNumber",
};

/** Accepts either ?status=new&status=closed or ?status=new,closed. */
const toArray = (value) => {
    if (value === undefined || value === null || value === "") return [];
    const raw = Array.isArray(value) ? value : String(value).split(",");
    return raw.map((item) => String(item).trim()).filter(Boolean);
};

const isValidId = (value) => mongoose.Types.ObjectId.isValid(value);

/**
 * Translates the query string into a Mongo filter (FR-10).
 *
 * The caller's visibility rule goes in first and everything is combined with
 * `$and`, so no combination of query parameters can widen what a user sees.
 */
const buildIncidentFilter = (req) => {
    const { search, assignedTo, reportedBy, overdue, dateFrom, dateTo } = req.query;

    const conditions = [permissions.visibilityFilter(req.user)];

    const statuses = toArray(req.query.status).filter((s) => STATUS_VALUES.includes(s));
    if (statuses.length) conditions.push({ status: { $in: statuses } });

    const priorities = toArray(req.query.priority).filter((p) =>
        PRIORITY_VALUES.includes(p)
    );
    if (priorities.length) conditions.push({ priority: { $in: priorities } });

    const categories = toArray(req.query.category).filter(isValidId);
    if (categories.length) conditions.push({ category: { $in: categories } });

    if (assignedTo === "me") {
        conditions.push({ assignedTo: req.user._id });
    } else if (assignedTo === "unassigned") {
        conditions.push({ assignedTo: null });
    } else if (assignedTo && isValidId(assignedTo)) {
        conditions.push({ assignedTo });
    }

    if (reportedBy === "me") {
        conditions.push({ reportedBy: req.user._id });
    } else if (reportedBy && isValidId(reportedBy)) {
        conditions.push({ reportedBy });
    }

    if (overdue === "true") conditions.push(slaService.overdueFilter());

    // "open" is the convenience bucket behind the dashboard tiles.
    if (req.query.open === "true") {
        conditions.push({ status: { $nin: TERMINAL_STATUSES } });
    }

    if (dateFrom || dateTo) {
        const range = {};
        if (dateFrom && !Number.isNaN(Date.parse(dateFrom))) {
            range.$gte = new Date(dateFrom);
        }
        if (dateTo && !Number.isNaN(Date.parse(dateTo))) {
            // Inclusive of the whole end day.
            const end = new Date(dateTo);
            end.setHours(23, 59, 59, 999);
            range.$lte = end;
        }
        if (Object.keys(range).length) conditions.push({ createdAt: range });
    }

    if (search && String(search).trim()) {
        const pattern = containsPattern(search);
        conditions.push({
            $or: [
                { title: pattern },
                { description: pattern },
                { incidentNumber: pattern },
            ],
        });
    }

    return conditions.length === 1 ? conditions[0] : { $and: conditions };
};

const buildSort = (query) => {
    const field = SORTABLE_FIELDS[query.sortBy] || "createdAt";
    const direction = query.sortOrder === "asc" ? 1 : -1;

    // A secondary key keeps pagination stable when primary values tie.
    return field === "createdAt"
        ? { createdAt: direction }
        : { [field]: direction, createdAt: -1 };
};

/** Adds the SLA fields that are computed rather than stored. */
const decorate = (incident) => ({
    ...incident,
    isOverdue: slaService.isOverdue(incident),
    slaState: slaService.slaState(incident),
});

const POPULATE = [
    { path: "category", select: "name isActive" },
    { path: "reportedBy", select: "name email role" },
    { path: "assignedTo", select: "name email role" },
];

/**
 * GET /api/v1/incidents
 * The main list screen: search, filter, sort and paginate (FR-10).
 */
const listIncidents = asyncHandler(async (req, res) => {
    const filter = buildIncidentFilter(req);
    const { page, limit, skip } = getPagination(req.query, { defaultLimit: 10 });

    const [incidents, total] = await Promise.all([
        Incident.find(filter)
            .populate(POPULATE)
            .sort(buildSort(req.query))
            .skip(skip)
            .limit(limit)
            .lean(),
        Incident.countDocuments(filter),
    ]);

    return paginatedResponse(res, "Incidents retrieved", incidents.map(decorate), {
        page,
        limit,
        total,
    });
});

/**
 * GET /api/v1/incidents/:id
 *
 * Returns the incident plus everything the detail screen renders, so the page
 * needs a single round trip instead of five.
 */
const getIncident = asyncHandler(async (req, res) => {
    const incident = await Incident.findById(req.params.id).populate(POPULATE);

    if (!incident) throw ApiError.notFound("Incident not found");

    if (!permissions.canView(req.user, incident)) {
        throw ApiError.forbidden("You do not have access to this incident");
    }

    // Internal notes are hidden from the reporter.
    const commentFilter = { incident: incident._id };
    if (!permissions.canUseInternalNotes(req.user)) commentFilter.isInternal = false;

    const [rca, comments, activity, attachments, childCount] = await Promise.all([
        RootCauseAnalysis.findOne({ incident: incident._id }).populate("author reviewedBy", "name email role").lean(),
        Comment.find(commentFilter)
            .populate("author", "name email role")
            .sort({ createdAt: 1 })
            .lean(),
        activityService.listForIncident(incident._id),
        Attachment.find({ incident: incident._id })
            .populate("uploadedBy", "name email")
            .sort({ uploadedAt: -1 })
            .lean(),
        IncidentLink.countDocuments({ toIncidentId: incident._id, relationshipType: "Child-Of" }),
    ]);

    return successResponse(res, 200, "Incident retrieved", {
        incident: decorate(incident.toObject()),
        comments,
        activity,
        attachments,
        correlation: { childCount, isMajorIncident: incident.isMajorIncident || childCount > 0 },
        rca,
        // Lets the UI enable/disable controls using the same rules the API enforces.
        permissions: {
            canEdit: permissions.canEditDetails(req.user, incident),
            canChangeStatus: permissions.canChangeStatus(req.user, incident),
            canAssign: permissions.canAssign(req.user, incident),
            canDelete: permissions.canDelete(req.user),
            canManageLinks: permissions.canManageLinks(req.user),
            canUseInternalNotes: permissions.canUseInternalNotes(req.user),
        },
    });
});

/**
 * POST /api/v1/incidents  (FR-03)
 * Any signed-in user may raise an incident; it is always attributed to them.
 */
const createIncident = asyncHandler(async (req, res) => {
    const { title, description, category, priority } = req.body;

    const categoryDoc = await Category.findById(category);

    if (!categoryDoc || !categoryDoc.isActive) {
        throw ApiError.badRequest("Please choose an active category");
    }

    const incident = await Incident.create({
        title,
        description,
        category: categoryDoc._id,
        priority,
        // Never read from the body: the reporter is whoever is signed in.
        reportedBy: req.user._id,
        status: STATUS.NEW,
    });

    await activityService.record({
        incident: incident._id,
        action: ACTIVITY_ACTIONS.CREATED,
        performedBy: req.user._id,
        note: `Incident raised with ${PRIORITY_LABELS[incident.priority]} priority`,
    });

    logger.event("incident_created", {
        incidentId: incident.id,
        number: incident.incidentNumber,
        by: req.user.id,
    });

    // Everyone who triages new work should hear about it.
    const staff = await User.find({
        role: { $in: [ROLES.ADMIN, ROLES.AGENT] },
        isActive: true,
    })
        .select("name email isActive")
        .lean();

    // Deliberately not awaited: the reporter should not wait on SMTP for a 201.
    notificationService.notifyIncidentCreated({
        incident,
        reporter: req.user,
        recipients: staff,
    });

    const created = await Incident.findById(incident._id).populate(POPULATE).lean();

    return successResponse(res, 201, "Incident created successfully", {
        incident: decorate(created),
    });
});

/**
 * PATCH /api/v1/incidents/:id
 *
 * Edits the descriptive fields. Status and assignment have their own endpoints
 * because they carry workflow rules and notifications of their own.
 */
const updateIncident = asyncHandler(async (req, res) => {
    const { title, description, category, priority } = req.body;

    const incident = await Incident.findById(req.params.id).populate(POPULATE);
    if (!incident) throw ApiError.notFound("Incident not found");

    if (!permissions.canEditDetails(req.user, incident)) {
        throw ApiError.forbidden(
            "You can only edit this incident while it is unassigned or still New"
        );
    }

    const auditEntries = [];

    if (title !== undefined && title !== incident.title) {
        auditEntries.push({
            incident: incident._id,
            action: ACTIVITY_ACTIONS.UPDATED,
            performedBy: req.user._id,
            field: "title",
            oldValue: incident.title,
            newValue: title,
        });
        incident.title = title;
    }

    if (description !== undefined && description !== incident.description) {
        auditEntries.push({
            incident: incident._id,
            action: ACTIVITY_ACTIONS.UPDATED,
            performedBy: req.user._id,
            field: "description",
            note: "Description updated",
        });
        incident.description = description;
    }

    if (category !== undefined && String(category) !== String(incident.category._id)) {
        const categoryDoc = await Category.findById(category);
        if (!categoryDoc || !categoryDoc.isActive) {
            throw ApiError.badRequest("Please choose an active category");
        }

        auditEntries.push({
            incident: incident._id,
            action: ACTIVITY_ACTIONS.CATEGORY_CHANGED,
            performedBy: req.user._id,
            field: "category",
            oldValue: incident.category.name,
            newValue: categoryDoc.name,
        });
        incident.category = categoryDoc._id;
    }

    if (priority !== undefined && priority !== incident.priority) {
        // Only staff may re-prioritise: it moves the SLA deadline.
        if (req.user.role === ROLES.USER) {
            throw ApiError.forbidden("Only support staff can change the priority");
        }

        auditEntries.push({
            incident: incident._id,
            action: ACTIVITY_ACTIONS.PRIORITY_CHANGED,
            performedBy: req.user._id,
            field: "priority",
            oldValue: PRIORITY_LABELS[incident.priority],
            newValue: PRIORITY_LABELS[priority],
        });
        // The model's pre-save hook recomputes dueBy and priorityWeight.
        incident.priority = priority;
    }

    if (!auditEntries.length) {
        throw ApiError.badRequest("No changes were supplied");
    }

    await incident.save();
    await activityService.recordMany(auditEntries);

    logger.event("incident_updated", { incidentId: incident.id, by: req.user.id });

    const updated = await Incident.findById(incident._id).populate(POPULATE).lean();

    return successResponse(res, 200, "Incident updated", {
        incident: decorate(updated),
    });
});

/**
 * PATCH /api/v1/incidents/:id/status  (FR-06)
 *
 * The transition itself is validated against the workflow table, so an
 * illegal jump is rejected here even if the UI would have allowed it.
 */
const updateStatus = asyncHandler(async (req, res) => {
    const { status, resolutionNote, updateLinkedChildren } = req.body;

    const incident = await Incident.findById(req.params.id).populate(POPULATE);
    if (!incident) throw ApiError.notFound("Incident not found");

    if (!permissions.canChangeStatus(req.user, incident)) {
        throw ApiError.forbidden(
            "Only an admin, or the agent this incident is assigned to, can change its status"
        );
    }

    const oldStatus = incident.status;
    permissions.assertValidTransition(oldStatus, status);

    if (status === STATUS.CLOSED && [PRIORITY.HIGH, PRIORITY.CRITICAL].includes(incident.priority)) {
        const approvedRca = await RootCauseAnalysis.exists({ incident: incident._id, status: "approved" });
        if (!approvedRca) throw ApiError.badRequest("High and Critical incidents require an approved RCA before closing");
    }
    // Work cannot be marked done while nobody owns it.
    if (
        TERMINAL_STATUSES.includes(status) &&
        !incident.assignedTo &&
        req.user.role !== ROLES.ADMIN
    ) {
        throw ApiError.badRequest(
            "Assign the incident to yourself before resolving or closing it"
        );
    }

    incident.status = status;

    if (status === STATUS.RESOLVED) {
        incident.resolvedAt = new Date();
        if (resolutionNote) incident.resolutionNote = resolutionNote;
    }

    if (status === STATUS.CLOSED) {
        incident.closedAt = new Date();
        if (!incident.resolvedAt) incident.resolvedAt = new Date();
    }

    // Reopening clears the completion stamps so SLA reporting stays honest.
    const isReopen = TERMINAL_STATUSES.includes(oldStatus) && status === STATUS.IN_PROGRESS;
    if (isReopen) {
        incident.resolvedAt = null;
        incident.closedAt = null;
    }

    await incident.save();
    // A major incident can explicitly propagate its terminal status to children.
    if (updateLinkedChildren && TERMINAL_STATUSES.includes(status)) {
        const childLinks = await IncidentLink.find({ toIncidentId: incident._id, relationshipType: "Child-Of" }).select("fromIncidentId").lean();
        const childIds = childLinks.map((link) => link.fromIncidentId);
        if (childIds.length) {
            const update = { status };
            if (status === STATUS.RESOLVED) update.resolvedAt = new Date();
            if (status === STATUS.CLOSED) { update.closedAt = new Date(); update.resolvedAt = new Date(); }
            await Incident.updateMany({ _id: { $in: childIds }, status: { $nin: TERMINAL_STATUSES } }, { $set: update });
            await Promise.all(childIds.map((childId) => activityService.record({ incident: childId, action: ACTIVITY_ACTIONS.STATUS_CHANGED, performedBy: req.user._id, field: "status", newValue: STATUS_LABELS[status], note: `Updated with parent ${incident.incidentNumber}` })));
        }
    }

    await activityService.record({
        incident: incident._id,
        action: isReopen ? ACTIVITY_ACTIONS.REOPENED : ACTIVITY_ACTIONS.STATUS_CHANGED,
        performedBy: req.user._id,
        field: "status",
        oldValue: STATUS_LABELS[oldStatus],
        newValue: STATUS_LABELS[status],
        note: resolutionNote || null,
    });

    logger.event("incident_status_changed", {
        incidentId: incident.id,
        from: oldStatus,
        to: status,
        by: req.user.id,
    });

    notificationService.notifyStatusChanged({
        incident,
        oldStatus,
        newStatus: status,
        changedBy: req.user,
    });

    const updated = await Incident.findById(incident._id).populate(POPULATE).lean();

    return successResponse(res, 200, `Status changed to ${STATUS_LABELS[status]}`, {
        incident: decorate(updated),
    });
});

/**
 * PATCH /api/v1/incidents/:id/assign  (FR-05)
 * Pass assignedTo: null to return the incident to the unassigned queue.
 */
const assignIncident = asyncHandler(async (req, res) => {
    const { assignedTo } = req.body;

    const incident = await Incident.findById(req.params.id).populate(POPULATE);
    if (!incident) throw ApiError.notFound("Incident not found");

    if (!permissions.canAssign(req.user, incident)) {
        throw ApiError.forbidden(
            "You can only reassign incidents that are unassigned or assigned to you"
        );
    }

    const previous = incident.assignedTo;
    const previousId = previous ? String(previous._id) : null;

    // Unassign.
    if (!assignedTo) {
        if (!previousId) throw ApiError.badRequest("This incident is already unassigned");

        incident.assignedTo = null;
        await incident.save();
    await activityService.record({
            incident: incident._id,
            action: ACTIVITY_ACTIONS.UNASSIGNED,
            performedBy: req.user._id,
            field: "assignedTo",
            oldValue: previous.name,
            newValue: "Unassigned",
        });

        const cleared = await Incident.findById(incident._id).populate(POPULATE).lean();

        return successResponse(res, 200, "Incident returned to the unassigned queue", {
            incident: decorate(cleared),
        });
    }

    if (previousId === String(assignedTo)) {
        throw ApiError.badRequest("This incident is already assigned to that user");
    }

    const assignee = await User.findById(assignedTo);

    if (!assignee || !assignee.isActive) {
        throw ApiError.badRequest("The selected user is not available for assignment");
    }

    // Only staff can carry incidents.
    if (![ROLES.ADMIN, ROLES.AGENT].includes(assignee.role)) {
        throw ApiError.badRequest("Incidents can only be assigned to an agent or admin");
    }

    incident.assignedTo = assignee._id;

    // Picking up brand-new work moves it into progress in one step.
    if (incident.status === STATUS.NEW) incident.status = STATUS.IN_PROGRESS;

    await incident.save();
    await activityService.record({
        incident: incident._id,
        action: previousId ? ACTIVITY_ACTIONS.REASSIGNED : ACTIVITY_ACTIONS.ASSIGNED,
        performedBy: req.user._id,
        field: "assignedTo",
        oldValue: previous ? previous.name : "Unassigned",
        newValue: assignee.name,
    });

    logger.event("incident_assigned", {
        incidentId: incident.id,
        to: assignee.id,
        by: req.user.id,
    });

    notificationService.notifyIncidentAssigned({
        incident,
        assignee,
        assignedBy: req.user,
    });

    const updated = await Incident.findById(incident._id).populate(POPULATE).lean();

    return successResponse(res, 200, `Incident assigned to ${assignee.name}`, {
        incident: decorate(updated),
    });
});

/**
 * DELETE /api/v1/incidents/:id  (Admin only)
 * Removes the incident and everything that hangs off it.
 */
const deleteIncident = asyncHandler(async (req, res) => {
    const incident = await Incident.findById(req.params.id);
    if (!incident) throw ApiError.notFound("Incident not found");

    if (!permissions.canDelete(req.user)) {
        throw ApiError.forbidden("Only an administrator can delete an incident");
    }

    const ActivityLog = require("../models/ActivityLog");
    const { removeFile } = require("../middleware/upload");

    // Delete the files from disk before the rows that point at them, otherwise
    // the stored names are lost and the uploads folder leaks.
    const attachments = await Attachment.find({ incident: incident._id }).lean();
    attachments.forEach((attachment) => removeFile(attachment.storedName));

    await Promise.all([
        Comment.deleteMany({ incident: incident._id }),
        ActivityLog.deleteMany({ incident: incident._id }),
        Attachment.deleteMany({ incident: incident._id }),
        IncidentLink.deleteMany({
            $or: [{ fromIncidentId: incident._id }, { toIncidentId: incident._id }],
        }),
    ]);

    await incident.deleteOne();

    logger.event("incident_deleted", {
        incidentId: req.params.id,
        number: incident.incidentNumber,
        by: req.user.id,
    });

    return successResponse(res, 200, `${incident.incidentNumber} was deleted`);
});

/**
 * GET /api/v1/incidents/export/csv  (FR-12)
 *
 * Exports whatever the current filters select, so "export" always matches what
 * the user is looking at on screen.
 */
const exportIncidents = asyncHandler(async (req, res) => {
    const filter = buildIncidentFilter(req);

    // Bounded so an export cannot pull an unbounded result set into memory.
    const incidents = await Incident.find(filter)
        .populate(POPULATE)
        .sort(buildSort(req.query))
        .limit(5000)
        .lean();

    const rows = incidents.map((incident) => ({
        incidentNumber: incident.incidentNumber,
        title: incident.title,
        category: incident.category ? incident.category.name : "",
        priority: PRIORITY_LABELS[incident.priority],
        status: STATUS_LABELS[incident.status],
        reportedBy: incident.reportedBy ? incident.reportedBy.name : "",
        assignedTo: incident.assignedTo ? incident.assignedTo.name : "Unassigned",
        createdAt: new Date(incident.createdAt).toISOString(),
        dueBy: incident.dueBy ? new Date(incident.dueBy).toISOString() : "",
        resolvedAt: incident.resolvedAt ? new Date(incident.resolvedAt).toISOString() : "",
        isOverdue: slaService.isOverdue(incident) ? "Yes" : "No",
        slaState: slaService.slaState(incident),
    }));

    const csv = toCsv(rows, [
        { label: "Incident No", value: "incidentNumber" },
        { label: "Title", value: "title" },
        { label: "Category", value: "category" },
        { label: "Priority", value: "priority" },
        { label: "Status", value: "status" },
        { label: "Reported By", value: "reportedBy" },
        { label: "Assigned To", value: "assignedTo" },
        { label: "Created At", value: "createdAt" },
        { label: "Due By", value: "dueBy" },
        { label: "Resolved At", value: "resolvedAt" },
        { label: "Overdue", value: "isOverdue" },
        { label: "SLA", value: "slaState" },
    ]);

    logger.event("incidents_exported", { count: rows.length, by: req.user.id });

    const stamp = new Date().toISOString().slice(0, 10);
    return sendCsv(res, `incidents-${stamp}.csv`, csv);
});

module.exports = {
    listIncidents,
    getIncident,
    createIncident,
    updateIncident,
    updateStatus,
    assignIncident,
    deleteIncident,
    exportIncidents,
    // Exported for reuse by the dashboard controller.
    buildIncidentFilter,
};
