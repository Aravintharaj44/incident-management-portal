const OnCallSchedule = require("../models/OnCallSchedule");
const Incident = require("../models/Incident");
const activityService = require("./activityService");
const { sendIncidentEscalated } = require("./emailService");
const logger = require("../utils/logger");
const { PRIORITY, STATUS, ACTIVITY_ACTIONS } = require("../constants");

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
        incident.ackWindowMinutes = schedule.ackWindowMinutes || 15;
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

const processUnacknowledgedEscalations = async () => {
    logger.info("Running escalation cron check");

    const now = new Date();

    const overdueIncidents = await Incident.find({
        status: { $in: ["New", "Open", "new", "open"] },
        priority: { $regex: /^critical$/i },
        acknowledgedAt: null,
    });

    logger.info(`Found ${overdueIncidents.length} unacknowledged critical incidents.`);

    for (const incident of overdueIncidents) {
        const ackWindow = incident.ackWindowMinutes || 15;
        const anchor = incident.lastEscalatedAt || incident.createdAt;
        const deadline = new Date(anchor.getTime() + ackWindow * 60000);

        if (now > deadline) {
            logger.info(`Escalating ${incident.incidentNumber} to Level 2`);

            const schedule = await OnCallSchedule.findOne({ department: incident.department });

            if (schedule && schedule.escalationChain?.length > 1) {
                const level2User = schedule.escalationChain.find(e => e.step === 2)?.user;

                if (level2User) {
                    incident.assignedTo = level2User;
                    incident.escalationLevel = 2;
                    incident.lastEscalatedAt = now;
                    await incident.save();

                    logger.info(`Escalated ${incident.incidentNumber} to user ${level2User}`);
                }
            }
        }
    }
};

module.exports = {
    autoAssignOnCall,
    processUnacknowledgedEscalations,
};