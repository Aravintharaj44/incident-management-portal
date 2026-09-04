const OnCallSchedule = require("../models/OnCallSchedule");
const Incident = require("../models/Incident");
const activityService = require("./activityService");
const { sendIncidentEscalated } = require("./emailService");
const logger = require("../utils/logger");
const { PRIORITY, STATUS, ACTIVITY_ACTIONS } = require("../constants");

/**
 * FR4-22: Automatically assigns Critical/High incidents to active Level 1 on-call agent.
 */
const autoAssignOnCall = async (incident) => {
    try {
        if (![PRIORITY.HIGH, PRIORITY.CRITICAL].includes(incident.priority)) {
            return;
        }

        const now = new Date();
        const schedule = await OnCallSchedule.findOne({
            department: incident.department,
            startTime: { $lte: now },
            endTime: { $gte: now },
            isActive: true,
        }).populate("escalationChain.user");

        if (!schedule || !schedule.escalationChain.length) {
            logger.info(`No active on-call roster found for department ${incident.department}`);
            return;
        }

        const primaryStep = schedule.escalationChain.find((c) => c.step === 1);
        if (!primaryStep || !primaryStep.user) return;

        incident.assignedTo = primaryStep.user._id;
        incident.status = STATUS.IN_PROGRESS;
        incident.escalationLevel = 1;
        incident.lastEscalatedAt = now;
        await incident.save();

        await activityService.record({
            incident: incident._id,
            action: ACTIVITY_ACTIONS.ASSIGNED,
            performedBy: primaryStep.user._id,
            note: `Auto-assigned to Level 1 on-call responder (${primaryStep.user.name})`,
        });

        await sendIncidentEscalated({
            to: primaryStep.user.email,
            incident,
            stepName: "Level 1 On-Call Responder",
        });
    } catch (err) {
        logger.error(`Auto-assign on-call failure: ${err.message}`);
    }
};

/**
 * FR4-23 & FR4-24: Escalates unacknowledged High/Critical incidents to the next level.
 */
const processUnacknowledgedEscalations = async () => {
  console.log("=== RUNNING ESCALATION CRON CHECK ===");
  
  const now = new Date();
  
  // 1. Unacknowledged மற்றும் Critical Incident-களை கண்டறிதல்
  const overdueIncidents = await Incident.find({
    status: { $in: ["New", "Open", "new", "open"] },
    priority: { $regex: /^critical$/i }, // Case-insensitive matching
    acknowledgedAt: null,
  });

  console.log(`Found ${overdueIncidents.length} unacknowledged critical incidents.`);

  for (const incident of overdueIncidents) {
    const ackWindow = incident.ackWindowMinutes || 15;
    const deadline = new Date(incident.createdAt.getTime() + ackWindow * 60000);

    console.log(`Incident ${incident.incidentNumber} Deadline:`, deadline, "Current Time:", now);

    if (now > deadline) {
      console.log(`Escalating Incident ${incident.incidentNumber} to Level 2...`);
      
      // Level 2 Shift Schedule-ஐ எடுத்தல்
      const schedule = await OnCallSchedule.findOne({ department: incident.department });

      if (schedule && schedule.escalationChain?.length > 1) {
        const level2User = schedule.escalationChain.find(e => e.step === 2)?.user;

        if (level2User) {
          incident.assignedTo = level2User;
          incident.escalationLevel = 2;
          await incident.save();

          console.log(`SUCCESS: Escalated ${incident.incidentNumber} to User ID: ${level2User}`);
        }
      }
    }
  }
};

module.exports = {
    autoAssignOnCall,
    processUnacknowledgedEscalations,
};