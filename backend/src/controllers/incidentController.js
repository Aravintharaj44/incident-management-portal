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
const Problem = require("../models/Problem");
const Department = require("../models/Department");
const DepartmentUser = require("../models/DepartmentUser");
const OnCallSchedule  = require("../models/OnCallSchedule");
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
    { path: "department", select: "title categories isActive" },
    { path: "problemId", select: "problemNumber title status workaround" },
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

    // FR4-04: an incident linked to a Problem can reference the Problem's RCA
    // instead of requiring a duplicate one. The problem-scoped RCA is surfaced
    // read-only when the incident has no RCA of its own.
    let effectiveRca = null;
    if (rca) {
        effectiveRca = rca;
    } else if (incident.problemId) {
        effectiveRca = await RootCauseAnalysis.findOne({ problem: incident.problemId._id })
            .populate("author reviewedBy", "name email role")
            .lean();
    }

    return successResponse(res, 200, "Incident retrieved", {
        incident: decorate(incident.toObject()),
        problem: incident.problemId,
        comments,
        activity,
        attachments,
        correlation: { childCount, isMajorIncident: incident.isMajorIncident || childCount > 0 },
        rca: effectiveRca,
        // If a problem RCA is being used because there is no incident RCA, tell
        // the UI where it came from so it can label it.
        rcaSource: !rca && effectiveRca ? "problem" : "incident",
        // Lets the UI enable/disable controls using the same rules the API enforces.
        permissions: {
            canEdit: permissions.canEditDetails(req.user, incident),
            canChangeStatus: permissions.canChangeStatus(req.user, incident),
            canAssign: permissions.canAssign(req.user, incident),
            canDelete: permissions.canDelete(req.user),
            canManageLinks: permissions.canManageLinks(req.user),
            canUseInternalNotes: permissions.canUseInternalNotes(req.user),
            canManageProblems: permissions.canManageProblems(req.user),
        },
    });
});

/**
 * POST /api/v1/incidents  (FR-03)
 * Any signed-in user may raise an incident; it is always attributed to them.
 */
/**
 * POST /api/v1/incidents  (FR-03)
 * Any signed-in user may raise an incident; it is always attributed to them.
 */
// Example Incident Creation Logic (backend)
/**
 * @desc    Create new incident with FR4-22 Auto-Assignment
 * @route   POST /api/incidents
 * @access  Private
 */
const createIncident = async (req, res) => {
  console.log("=== CREATE INCIDENT REQUEST RECEIVED ===");

  try {
    const payload = req.body.incident || req.body;
    let { title, description, category, categoryId, priority } = payload;

    const selectedCategory = category || categoryId;

    if (!selectedCategory) {
      return res.status(400).json({
        success: false,
        message: "Category is required",
      });
    }

    // 1. Normalize priority to lowercase to match PRIORITY_VALUES enum in schema
    const rawPriority = (priority || "medium").toLowerCase();
    
    // Map to exact schema enum values
    const validPriorityMap = {
      critical: PRIORITY?.CRITICAL || "critical",
      high: PRIORITY?.HIGH || "high",
      medium: PRIORITY?.MEDIUM || "medium",
      low: PRIORITY?.LOW || "low",
    };

    const targetPriority = validPriorityMap[rawPriority] || validPriorityMap.medium;

    console.log("Normalized Priority for Schema:", targetPriority);

    // 2. Resolve Department
    const departmentObj = await Department.findOne({ categories: selectedCategory });
    let departmentId = departmentObj ? departmentObj._id : null;
    let assignedTo = null;

    console.log("Resolved Department ID:", departmentId);

    // 3. FR4-22: Auto-Assignment trigger (Checks critical / high)
   // 3. FR4-22: Auto-Assignment trigger
if (departmentId && ["critical", "high"].includes(rawPriority)) {
  const now = new Date();

  let activeShift = await OnCallSchedule.findOne({
    $or: [{ department: departmentId }, { departmentId: departmentId }],
    startTime: { $lte: now },
    endTime: { $gte: now },
  });

  if (!activeShift) {
    activeShift = await OnCallSchedule.findOne({
      $or: [{ department: departmentId }, { departmentId: departmentId }],
    }).sort({ createdAt: -1 });
  }

  console.log("Found Roster Document:", activeShift);

  if (activeShift) {
    // 1. Check escalationChain array for step 1
    if (Array.isArray(activeShift.escalationChain) && activeShift.escalationChain.length > 0) {
      const step1 = activeShift.escalationChain.find((e) => e.step === 1) || activeShift.escalationChain[0];
      assignedTo = step1?.user || step1?.userId || null;
    }

    // 2. Fallback to root property if escalationChain isn't populated
    if (!assignedTo) {
      assignedTo =
        activeShift.level1Responder ||
        activeShift.level1 ||
        activeShift.user ||
        activeShift.assignedUser ||
        null;
    }

    console.log("Assigned Responder User ID:", assignedTo);
  }
}

    // 4. Create Incident matching exact schema enum values
    const newIncident = await Incident.create({
      title,
      description,
      category: selectedCategory,
      department: departmentId,
      assignedDepartment: departmentId,
      assignedTo: assignedTo,
      priority: targetPriority, // Uses lowercase 'critical' required by schema
      reportedBy: req.user._id,
      intakeSource: "Manual",
    });

    const populatedIncident = await Incident.findById(newIncident._id)
      .populate("category", "name")
      .populate("department", "title")
      .populate("assignedDepartment", "title")
      .populate("assignedTo", "name email")
      .populate("reportedBy", "name email");

    return res.status(201).json({
      success: true,
      data: populatedIncident,
    });
  } catch (error) {
    console.error("Error creating incident:", error);
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
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

        // The department must stay valid for the new category. If it no longer
        // applies, return the incident to the unassigned queue so an invalid
        // department/member combination cannot persist.
        const currentDepartment = incident.department;
        if (currentDepartment && currentDepartment.categories) {
            const stillValid =
                currentDepartment.isActive &&
                currentDepartment.categories.some(
                    (id) => String(id) === String(categoryDoc._id)
                );

            if (!stillValid) {
                const previousDepartmentTitle = currentDepartment.title || "Unassigned";
                if (incident.assignedTo) {
                    auditEntries.push({
                        incident: incident._id,
                        action: ACTIVITY_ACTIONS.UNASSIGNED,
                        performedBy: req.user._id,
                        field: "assignedTo",
                        oldValue: incident.assignedTo.name,
                        newValue: "Unassigned",
                        note: "Department no longer applies to the new category",
                    });
                    incident.assignedTo = null;
                }
                auditEntries.push({
                    incident: incident._id,
                    action: ACTIVITY_ACTIONS.DEPARTMENT_CHANGED,
                    performedBy: req.user._id,
                    field: "department",
                    oldValue: previousDepartmentTitle,
                    newValue: "Unassigned",
                    note: "Department not valid for the selected category",
                });
                incident.department = null;
            }
        }
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

/** GET /api/v1/incidents/:id/assignment-options */
const getAssignmentOptions = asyncHandler(async (req, res) => {
    const incident = await Incident.findById(req.params.id).select("category assignedTo department");
    if (!incident) throw ApiError.notFound("Incident not found");
    if (!permissions.canAssign(req.user, incident)) throw ApiError.forbidden("You cannot assign this incident");

const departments = await Department.find({ categories: incident.category, isActive: true })
        .select("title")
        .sort({ title: 1 })
        .lean();

    // Support Agents only ever see the department the incident is already
    // assigned to, and therefore cannot reach another team's members.
    let visibleDepartments = departments;
    if (permissions.isAgent(req.user)) {
        const currentDepartmentId = incident.department
            ? String(incident.department._id ?? incident.department)
            : null;
        visibleDepartments = currentDepartmentId
            ? departments.filter((department) => String(department._id) === currentDepartmentId)
            : [];
    }

    const memberships = await DepartmentUser.find({
        department: { $in: visibleDepartments.map((department) => department._id) },
        isActive: true,
    })
        .populate({ path: "user", match: { isActive: true, role: { $in: [ROLES.ADMIN, ROLES.AGENT] } }, select: "name email role" })
        .lean();
    const membersByDepartment = new Map();
    memberships.forEach((membership) => {
        if (!membership.user) return;
        const key = String(membership.department);
        membersByDepartment.set(key, [...(membersByDepartment.get(key) || []), membership.user]);
    });

    return successResponse(res, 200, "Assignment options retrieved", {
        departments: visibleDepartments.map((department) => ({
            ...department,
            members: membersByDepartment.get(String(department._id)) || [],
        })),
    });
});
/**
 * PATCH /api/v1/incidents/:id/assign  (FR-05)
 * Pass assignedTo: null to return the incident to the unassigned queue.
 */
const assignIncident = asyncHandler(async (req, res) => {
    const { assignedTo, department } = req.body;
    const departmentWasProvided = Object.prototype.hasOwnProperty.call(req.body, "department");
    const assigneeWasProvided = Object.prototype.hasOwnProperty.call(req.body, "assignedTo");
    const incident = await Incident.findById(req.params.id).populate(POPULATE);
    if (!incident) throw ApiError.notFound("Incident not found");
    if (!permissions.canAssign(req.user, incident)) {
        throw ApiError.forbidden("You can only reassign incidents that are unassigned or assigned to you");
    }

    // Only an Admin can decide (or change) which department handles an
    // incident. A Support Agent sending a department id is rejected outright
    // rather than silently ignored, so the department cannot be swapped
    // through the API.
    if (departmentWasProvided && !permissions.canChangeDepartment(req.user)) {
        throw ApiError.forbidden("Only an admin can change the incident department");
    }

    const previous = incident.assignedTo;
    const previousId = previous ? String(previous._id) : null;
    const previousDepartmentTitle = incident.department?.title || "Unassigned";
    const currentDepartmentId = incident.department?._id ? String(incident.department._id) : null;
    let effectiveDepartment = incident.department?._id || null;
    let departmentChanged = false;
    let selectedDepartmentTitle = null;

    if (departmentWasProvided) {
        if (!department) {
            departmentChanged = currentDepartmentId !== null;
            effectiveDepartment = null;
            incident.department = null;
        } else {
            const selectedDepartment = await Department.findOne({
                _id: department,
                categories: incident.category._id || incident.category,
                isActive: true,
            }).select("_id title");
            if (!selectedDepartment) {
                throw ApiError.badRequest("Choose an active department that handles this incident category");
            }
            departmentChanged = currentDepartmentId !== String(selectedDepartment._id);
            effectiveDepartment = selectedDepartment._id;
            incident.department = selectedDepartment._id;
            selectedDepartmentTitle = selectedDepartment.title;
        }
    }

    // Selecting a department is allowed before an assignee is chosen. Changing
    // it returns any existing assignment to the queue so it cannot cross teams.
    if (!assigneeWasProvided) {
        if (departmentChanged && previousId) incident.assignedTo = null;
        await incident.save();
        if (departmentChanged) {
            await activityService.record({
                incident: incident._id,
                action: ACTIVITY_ACTIONS.DEPARTMENT_CHANGED,
                performedBy: req.user._id,
                field: "department",
                oldValue: previousDepartmentTitle,
                newValue: selectedDepartmentTitle || "Unassigned",
            });
        }
        const updated = await Incident.findById(incident._id).populate(POPULATE).lean();
        return successResponse(res, 200, "Department updated", { incident: decorate(updated) });
    }

    if (!assignedTo) {
        if (!previousId && !departmentWasProvided) throw ApiError.badRequest("This incident is already unassigned");
        incident.assignedTo = null;
        await incident.save();
        if (previousId) {
            await activityService.record({
                incident: incident._id, action: ACTIVITY_ACTIONS.UNASSIGNED,
                performedBy: req.user._id, field: "assignedTo",
                oldValue: previous.name, newValue: "Unassigned",
            });
        }
        if (departmentChanged) {
            await activityService.record({
                incident: incident._id,
                action: ACTIVITY_ACTIONS.DEPARTMENT_CHANGED,
                performedBy: req.user._id,
                field: "department",
                oldValue: previousDepartmentTitle,
                newValue: selectedDepartmentTitle || "Unassigned",
            });
        }
        const cleared = await Incident.findById(incident._id).populate(POPULATE).lean();
        return successResponse(res, 200, "Incident returned to the unassigned queue", { incident: decorate(cleared) });
    }

    // A member can only be assigned once a department is in effect. This holds
    // for Admins and Support Agents alike - the frontend enforces it visually,
    // the API enforces it here.
    if (!effectiveDepartment) {
        throw ApiError.badRequest(
            "Admin must assign a department before a member can be assigned."
        );
    }

    if (previousId === String(assignedTo) && !departmentWasProvided) {
        throw ApiError.badRequest("This incident is already assigned to that user");
    }
    const assignee = await User.findById(assignedTo);
    if (!assignee || !assignee.isActive || ![ROLES.ADMIN, ROLES.AGENT].includes(assignee.role)) {
        throw ApiError.badRequest("The selected user is not available for assignment");
    }
    const isMember = await DepartmentUser.exists({
        department: effectiveDepartment, user: assignee._id, isActive: true,
    });
    if (!isMember) throw ApiError.badRequest("The selected user is not an active member of this department");

    incident.assignedTo = assignee._id;
    if (incident.status === STATUS.NEW) incident.status = STATUS.IN_PROGRESS;
    await incident.save();
    if (departmentChanged) {
        await activityService.record({
            incident: incident._id,
            action: ACTIVITY_ACTIONS.DEPARTMENT_CHANGED,
            performedBy: req.user._id,
            field: "department",
            oldValue: previousDepartmentTitle,
            newValue: selectedDepartmentTitle || "Unassigned",
        });
    }
    await activityService.record({
        incident: incident._id,
        action: previousId ? ACTIVITY_ACTIONS.REASSIGNED : ACTIVITY_ACTIONS.ASSIGNED,
        performedBy: req.user._id,
        field: "assignedTo",
        oldValue: previous ? previous.name : "Unassigned",
        newValue: assignee.name,
    });
    logger.event("incident_assigned", { incidentId: incident.id, department: effectiveDepartment, to: assignee.id, by: req.user.id });
    notificationService.notifyIncidentAssigned({ incident, assignee, assignedBy: req.user });
    const updated = await Incident.findById(incident._id).populate(POPULATE).lean();
    return successResponse(res, 200, `Incident assigned to ${assignee.name}`, { incident: decorate(updated) });
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

/**
 * POST /api/v1/incidents/:id/problem (FR4-04)
 * Link this incident to an existing Problem. Staff only; the backend validates
 * both records and audits the change on both timelines.
 */
const linkProblem = asyncHandler(async (req, res) => {
    const incident = await Incident.findById(req.params.id).populate(POPULATE);
    if (!incident) throw ApiError.notFound("Incident not found");
    if (!permissions.canView(req.user, incident)) throw ApiError.forbidden("You do not have access to this incident");
    if (!permissions.canManageProblems(req.user)) throw ApiError.forbidden("Only support staff can link an incident to a problem");

    const { problemId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(problemId)) throw ApiError.badRequest("Invalid problem ID");

    const problem = await Problem.findById(problemId);
    if (!problem) throw ApiError.notFound("Problem not found");

    if (incident.problemId) {
        throw ApiError.badRequest("This incident is already linked to a problem");
    }

    incident.problemId = problem._id;
    await incident.save();

    // Derive the problem category from its first linked incident if it has none.
    if (!problem.category) {
        const firstIncident = await Incident.findOne({ problemId: problem._id }).select("category").lean();
        if (firstIncident && firstIncident.category) {
            problem.category = firstIncident.category;
            await problem.save().catch(() => {});
        }
    }

    await activityService.record({
        incident: incident._id,
        action: ACTIVITY_ACTIONS.INCIDENT_PROBLEM_LINKED,
        performedBy: req.user._id,
        field: "problemId",
        oldValue: "None",
        newValue: problem.problemNumber,
    });
    await activityService.record({
        problem: problem._id,
        action: ACTIVITY_ACTIONS.INCIDENT_PROBLEM_LINKED,
        performedBy: req.user._id,
        note: `Linked to ${incident.incidentNumber}`,
    });

    const populated = await Incident.findById(incident._id).populate(POPULATE).lean();
    return successResponse(res, 200, `Incident linked to ${problem.problemNumber}`, { incident: decorate(populated) });
});

/**
 * DELETE /api/v1/incidents/:id/problem (FR4-04)
 * Unlink this incident from its Problem.
 */
const unlinkProblem = asyncHandler(async (req, res) => {
    const incident = await Incident.findById(req.params.id).populate(POPULATE);
    if (!incident) throw ApiError.notFound("Incident not found");
    if (!permissions.canView(req.user, incident)) throw ApiError.forbidden("You do not have access to this incident");
    if (!permissions.canManageProblems(req.user)) throw ApiError.forbidden("Only support staff can unlink an incident from a problem");

    if (!incident.problemId) throw ApiError.badRequest("This incident is not linked to a problem");

    const problemNumber = incident.problemId?.problemNumber || "a problem";
    await Incident.updateOne({ _id: incident._id }, { $set: { problemId: null } });

    await activityService.record({
        incident: incident._id,
        action: ACTIVITY_ACTIONS.INCIDENT_PROBLEM_UNLINKED,
        performedBy: req.user._id,
        field: "problemId",
        oldValue: problemNumber,
        newValue: "None",
    });
    await activityService.record({
        problem: incident.problemId?._id,
        action: ACTIVITY_ACTIONS.INCIDENT_PROBLEM_UNLINKED,
        performedBy: req.user._id,
        note: `Removed ${incident.incidentNumber}`,
    });

    const updated = await Incident.findById(incident._id).populate(POPULATE).lean();
    return successResponse(res, 200, `Incident removed from ${problemNumber}`, { incident: decorate(updated) });
});

module.exports = {
    listIncidents,
    getIncident,
    createIncident,
    updateIncident,
    updateStatus,
    getAssignmentOptions,
    assignIncident,
    deleteIncident,
    exportIncidents,
    linkProblem,
    unlinkProblem,
    // Exported for reuse by the dashboard controller.
    buildIncidentFilter,
};
