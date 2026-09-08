const slaService = require("../services/slaService");

const idOf = (value) => {
    if (!value) return null;
    return String(value._id ?? value);
};

/** An id, or a populated object reduced to { id, name, email, role }. */
const userRef = (user, includeId = true) => {
    if (!user) return null;
    if (typeof user === "object" && user._id && user.name) {
        return {
            ...(includeId ? { id: idOf(user) } : {}),
            name: user.name,
            email: user.email,
            role: user.role,
        };
    }
    // Unpopulated: expose only the id (or null).
    return includeId ? { id: idOf(user) } : null;
};

/** A populated category reduced to { id, name }; falls back to an id-only ref. */
const categoryRef = (category) => {
    if (!category) return null;
    if (typeof category === "object" && category._id && category.name) {
        return { id: idOf(category), name: category.name };
    }
    return { id: idOf(category) };
};

/** A populated department reduced to { id, title }. */
const departmentRef = (department) => {
    if (!department) return null;
    if (typeof department === "object" && department._id && department.title) {
        return { id: idOf(department), title: department.title };
    }
    return { id: idOf(department) };
};

/**
 * Convert an Incident (raw lean doc or Mongoose doc) into the public Ticket
 * representation. Population of category/reportedBy/assignedTo/department is
 * expected but not required - unpopulated references degrade gracefully.
 */
const incidentToTicket = (incident) => {
    if (!incident) return null;

    return {
        id: idOf(incident),
        ticketNumber: incident.incidentNumber || null,
        subject: incident.title,
        description: incident.description,
        status: incident.status,
        priority: incident.priority,
        requester: userRef(incident.reportedBy),
        assignee: userRef(incident.assignedTo),
        category: categoryRef(incident.category),
        department: departmentRef(incident.department),
        dueTime: incident.dueBy || null,
        slaState: slaService.slaState(incident),
        isOverdue: slaService.isOverdue(incident),
        resolutionNote: incident.resolutionNote || "",
        resolvedAt: incident.resolvedAt || null,
        closedAt: incident.closedAt || null,
        commentCount: incident.commentCount || 0,
        attachmentCount: incident.attachmentCount || 0,
        isMajorIncident: Boolean(incident.isMajorIncident),
        createdTime: incident.createdAt || null,
        modifiedTime: incident.updatedAt || null,
    };
};

module.exports = { incidentToTicket, idOf, userRef, categoryRef, departmentRef };
