const mongoose = require("mongoose");
const Incident = require("../models/Incident");
const Category = require("../models/Category");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");
const { successResponse } = require("../utils/apiResponse");
const { getFromLimit, buildPaginationMeta } = require("../utils/pagination");
const { incidentToTicket } = require("../utils/ticketMapper");
const activityService = require("../services/activityService");
const notificationService = require("../services/notificationService");
const permissions = require("../services/permissionService");
const slaService = require("../services/slaService");
const Attachment = require("../models/Attachment");
const Comment = require("../models/Comment");
const IncidentLink = require("../models/IncidentLink");
const { ROLES, STATUS, ACTIVITY_ACTIONS, PRIORITY_LABELS, WEBHOOK_EVENTS } = require("../constants");
// Outbound webhook subscriptions - fires ticket.created / ticket.updated to
// any external system that has subscribed. Fire-and-forget: never awaited,
// never blocks or fails the ticket request itself. ticket.resolved is NOT
// fired from this file - status changes (including the New -> ... ->
// Resolved transition) are handled elsewhere, since this controller
// deliberately never edits status (see applyTicketUpdate's docs below).
const { triggerTicketEvent } = require("../services/Webhookservice");

// Reuses the exact same populate set and filter builder as the Incident API so
// the two surfaces can never drift apart on visibility or reference fields.
const { buildIncidentFilter } = require("./incidentController");

/** Matches the field set populated by the Incident list/detail endpoints. */
const POPULATE = [
    { path: "category", select: "name isActive" },
    { path: "reportedBy", select: "name email role" },
    { path: "assignedTo", select: "name email role" },
    { path: "department", select: "title categories isActive" },
];

/**
 * GET /api/v1/tickets
 *
 * Returns incidents as tickets, honouring the same visibility and filter rules
 * as the existing incident list. Response uses the ticket envelope with
 * `from`/`limit` pagination metadata (Zoho-style, FR5-08).
 */
const listTickets = asyncHandler(async (req, res) => {
    const filter = buildIncidentFilter(req);
    const { from, limit, skip } = getFromLimit(req.query, { defaultLimit: 10 });

    const [incidents, total] = await Promise.all([
        Incident.find(filter)
            .populate(POPULATE)
            .sort({ createdAt: -1, _id: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Incident.countDocuments(filter),
    ]);

    const tickets = incidents.map(incidentToTicket);

    return successResponse(res, 200, "Tickets retrieved", {
        tickets,
        count: total,
        from,
        limit,
        pagination: buildPaginationMeta({
            from,
            limit,
            total,
            rowCount: tickets.length,
        }),
    });
});

/**
 * GET /api/v1/tickets/:id
 *
 * Returns one incident mapped to a ticket. Reuses permissions.canView so a user
 * can never retrieve an incident they are not allowed to see.
 */
const getTicket = asyncHandler(async (req, res) => {
    const incident = await Incident.findById(req.params.id).populate(POPULATE);

    if (!incident) throw ApiError.notFound("Ticket not found");

    if (!permissions.canView(req.user, incident)) {
        throw ApiError.forbidden("You do not have access to this ticket");
    }

    return successResponse(res, 200, "Ticket retrieved", {
        ticket: incidentToTicket(incident.toObject()),
    });
});

/**
 * POST /api/v1/tickets
 *
 * Creates a new Incident from the ticket representation. The requester is
 * ALWAYS the authenticated user - it is never read from the request body, so a
 * caller cannot spoof another reporter.
 */
const createTicket = asyncHandler(async (req, res) => {
    const { subject, description, category, priority } = req.body;

    // Map ticket -> incident.
    const payload = {
        title: subject,
        description,
        category,
        priority,
    };

    const categoryDoc = await Category.findById(payload.category);
    if (!categoryDoc || !categoryDoc.isActive) {
        throw ApiError.badRequest("Please choose an active category");
    }

    const incident = await Incident.create({
        title: payload.title,
        description: payload.description,
        category: categoryDoc._id,
        priority: payload.priority,
        // Security: the reporter is whoever is signed in - never the body.
        reportedBy: req.user._id,
        status: STATUS.NEW,
    });

    await activityService.record({
        incident: incident._id,
        action: ACTIVITY_ACTIONS.CREATED,
        performedBy: req.user._id,
        note: `Ticket raised with ${PRIORITY_LABELS[incident.priority]} priority`,
    });

    logger.event("ticket_created", {
        incidentId: incident.id,
        number: incident.incidentNumber,
        by: req.user.id,
    });

    // Notify everyone who triages new work, exactly like the incident creation path.
    const staff = await User.find({
        role: { $in: [ROLES.ADMIN, ROLES.AGENT] },
        isActive: true,
    })
        .select("name email isActive")
        .lean();
    notificationService.notifyIncidentCreated({
        incident,
        reporter: req.user,
        recipients: staff,
    });

    const created = await Incident.findById(incident._id).populate(POPULATE).lean();

    // Outbound webhooks - notify any subscribed external system. Fired after
    // everything above has succeeded, never awaited.
    triggerTicketEvent(WEBHOOK_EVENTS.TICKET_CREATED, incidentToTicket(created));

    return successResponse(res, 201, "Ticket created successfully", {
        ticket: incidentToTicket(created),
    });
});

/**
 * Applies shared descriptive-field update logic used by both PUT and PATCH on
 * /tickets/:id. Returns an array of audit entries OR null if nothing changed.
 *
 * It deliberately never edits status, assignment, department or reporter: those
 * are workflow concerns with their own rules and endpoints. Instead it reuses
 * the same business rules as updateIncident (permission gate, active category,
 * category<->department consistency, KB-link cleanup, staff-only priority).
 */
const applyTicketUpdate = async (req, payload, incident) => {
    if (!permissions.canEditDetails(req.user, incident)) {
        throw ApiError.forbidden(
            "You can only edit this ticket while it is unassigned or still New"
        );
    }

    const auditEntries = [];

    if (payload.subject !== undefined && payload.subject !== incident.title) {
        auditEntries.push({
            incident: incident._id,
            action: ACTIVITY_ACTIONS.UPDATED,
            performedBy: req.user._id,
            field: "title",
            oldValue: incident.title,
            newValue: payload.subject,
        });
        incident.title = payload.subject;
    }

    if (
        payload.description !== undefined &&
        payload.description !== incident.description
    ) {
        auditEntries.push({
            incident: incident._id,
            action: ACTIVITY_ACTIONS.UPDATED,
            performedBy: req.user._id,
            field: "description",
            note: "Description updated",
        });
        incident.description = payload.description;
    }

    if (
        payload.category !== undefined &&
        String(payload.category) !== String(incident.category._id)
    ) {
        const categoryDoc = await Category.findById(payload.category);
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

        // Keep the department valid for the new category (mirrors incidents).
        const currentDepartment = incident.department;
        if (currentDepartment && currentDepartment.categories) {
            const stillValid =
                currentDepartment.isActive &&
                currentDepartment.categories.some(
                    (id) => String(id) === String(categoryDoc._id)
                );

            if (!stillValid) {
                const previousDepartmentTitle =
                    currentDepartment.title || "Unassigned";
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

    if (payload.priority !== undefined && payload.priority !== incident.priority) {
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
            newValue: PRIORITY_LABELS[payload.priority],
        });
        // The model's pre-save hook recomputes dueBy and priorityWeight.
        incident.priority = payload.priority;
    }

    return auditEntries;
};

const saveUpdatedTicket = async (req, res, incident, auditEntries, message) => {
    await incident.save();
    await activityService.recordMany(auditEntries);

    logger.event("ticket_updated", { incidentId: incident.id, by: req.user.id });

    const updated = await Incident.findById(incident._id).populate(POPULATE).lean();

    // Outbound webhooks - notify any subscribed external system. Shared by
    // both PUT and PATCH since they both funnel through here.
    triggerTicketEvent(WEBHOOK_EVENTS.TICKET_UPDATED, incidentToTicket(updated));

    return successResponse(res, 200, message, {
        ticket: incidentToTicket(updated),
    });
};

/**
 * PUT /api/v1/tickets/:id
 *
 * Full replacement of the supported descriptive ticket fields. Status,
 * assignment and department are workflow concerns and are deliberately not
 * editable here (see module docs). Unsupported fields are ignored.
 */
const updateTicket = asyncHandler(async (req, res) => {
    const payload = {
        subject: req.body.subject,
        description: req.body.description,
        category: req.body.category,
        priority: req.body.priority,
    };

    const incident = await Incident.findById(req.params.id).populate(POPULATE);
    if (!incident) throw ApiError.notFound("Ticket not found");

    // PUT is a full replacement: each supported field must be supplied.
    const missing = ["subject", "description", "category"].filter(
        (key) => payload[key] === undefined
    );
    if (missing.length) {
        throw ApiError.badRequest(
            `PUT requires: ${missing.join(", ")}`
        );
    }

    const auditEntries = await applyTicketUpdate(req, payload, incident);

    if (!auditEntries.length) {
        throw ApiError.badRequest("No changes were supplied");
    }

    return saveUpdatedTicket(req, res, incident, auditEntries, "Ticket updated");
});

/**
 * PATCH /api/v1/tickets/:id
 *
 * Partial ticket update - only the supplied supported fields change. Never
 * allows arbitrary Mongo fields, _id/createdAt/audit manipulation, reporter
 * spoofing, or assignment/department changes.
 */
const patchTicket = asyncHandler(async (req, res) => {
    const payload = {
        subject: req.body.subject,
        description: req.body.description,
        category: req.body.category,
        priority: req.body.priority,
    };

    const incident = await Incident.findById(req.params.id).populate(POPULATE);
    if (!incident) throw ApiError.notFound("Ticket not found");

    const auditEntries = await applyTicketUpdate(req, payload, incident);

    if (!auditEntries.length) {
        throw ApiError.badRequest("No changes were supplied");
    }

    return saveUpdatedTicket(req, res, incident, auditEntries, "Ticket updated");
});

/**
 * DELETE /api/v1/tickets/:id (Admin only)
 *
 * Reuses the Incident deletion permission (admin) and cleanup behavior, so the
 * ticket surface cannot introduce a weaker deletion rule.
 */
const deleteTicket = asyncHandler(async (req, res) => {
    const incident = await Incident.findById(req.params.id);
    if (!incident) throw ApiError.notFound("Ticket not found");

    if (!permissions.canDelete(req.user)) {
        throw ApiError.forbidden("Only an administrator can delete a ticket");
    }

    const ActivityLog = require("../models/ActivityLog");
    const { removeFile } = require("../middleware/upload");

    // Remove files from disk before the rows that point at them.
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

    logger.event("ticket_deleted", {
        incidentId: req.params.id,
        number: incident.incidentNumber,
        by: req.user.id,
    });

    return successResponse(res, 200, `${incident.incidentNumber} was deleted`);
});

module.exports = {
    listTickets,
    getTicket,
    createTicket,
    updateTicket,
    patchTicket,
    deleteTicket,
};