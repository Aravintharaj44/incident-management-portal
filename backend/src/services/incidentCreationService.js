const Incident = require("../models/Incident");
const User = require("../models/User");
const { selectL1Assignee } = require("./escalationService");
const activityService = require("./activityService");
const notificationService = require("./notificationService");
const { PRIORITY, PRIORITY_LABELS, ROLES, ACTIVITY_ACTIONS } = require("../constants");

const createIncidentForReporter = async ({ title, description, category, priority = "medium", reporter }) => {
  const targetPriority = PRIORITY[String(priority).toUpperCase()] || PRIORITY.MEDIUM;
  const assignedAgent = await selectL1Assignee({ category });
  const department = assignedAgent?.department || null;
  const assignedTo = assignedAgent?.user?._id || null;
  const incident = await Incident.create({ title, description, category, department, assignedDepartment: department, assignedTo, priority: targetPriority, reportedBy: reporter._id, intakeSource: "Manual" });
  await activityService.record({ incident: incident._id, action: ACTIVITY_ACTIONS.CREATED, performedBy: reporter._id, note: `Incident raised with ${PRIORITY_LABELS[incident.priority]} priority` });
  if (assignedTo) { const assignee = await User.findById(assignedTo).select("name").lean(); await activityService.record({ incident: incident._id, action: ACTIVITY_ACTIONS.ASSIGNED, performedBy: reporter._id, field: "assignedTo", oldValue: "Unassigned", newValue: assignee?.name || "Unknown", note: "Auto-assigned based on active L1 department members or an on-call schedule" }); }
  const staff = await User.find({ role: { $in: [ROLES.ADMIN, ROLES.AGENT] }, isActive: true }).select("name email isActive").lean();
  notificationService.notifyIncidentCreated({ incident, reporter, recipients: staff });
  return incident;
};
module.exports = { createIncidentForReporter };
