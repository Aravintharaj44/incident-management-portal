const mongoose = require("mongoose");
const OnCallSchedule = require("../models/OnCallSchedule");
const Department = require("../models/Department");
const Incident = require("../models/Incident");
const DepartmentUser = require("../models/DepartmentUser");
const activityService = require("./activityService");
const { sendIncidentEscalated } = require("./emailService");
const logger = require("../utils/logger");
const {
    PRIORITY,
    STATUS,
    ACTIVITY_ACTIONS,
    PRIORITY_VALUES,
    TERMINAL_STATUSES,
    ROLES,
} = require("../constants");

const priorityOrder = [PRIORITY.CRITICAL, PRIORITY.HIGH, PRIORITY.MEDIUM, PRIORITY.LOW];

const chooseLeastLoadedAgent = (agents) => {
    if (!agents.length) return null;

    const sorted = [...agents].sort((a, b) => {
        if (a.total !== b.total) return a.total - b.total;

        for (const priority of priorityOrder) {
            if (a.byPriority[priority] !== b.byPriority[priority]) {
                return a.byPriority[priority] - b.byPriority[priority];
            }
        }

        return 0;
    });

    const best = sorted[0];
    const tied = sorted.filter(
        (agent) =>
            agent.total === best.total &&
            priorityOrder.every(
                (priority) => agent.byPriority[priority] === best.byPriority[priority]
            )
    );

    return tied[Math.floor(Math.random() * tied.length)];
};

const selectL1Assignee = async ({ department, category }) => {
    const departmentId = mongoose.Types.ObjectId.isValid(department)
        ? new mongoose.Types.ObjectId(department)
        : department;
    const categoryId = mongoose.Types.ObjectId.isValid(category)
        ? new mongoose.Types.ObjectId(category)
        : category;
    const departments = departmentId
        ? [{ _id: departmentId }]
        : await Department.find({ categories: categoryId, isActive: true }).select("_id").lean();
    const departmentIds = departments.map(({ _id }) => _id);

    if (!departmentIds.length) return null;

    const now = new Date();
    const schedules = await OnCallSchedule.find({
        department: { $in: departmentIds },
        $or: [{ category: null }, { category: categoryId }],
        startTime: { $lte: now },
        endTime: { $gte: now },
        isActive: true,
    }).populate("escalationChain.user", "name email role isActive");

    const scheduledUserIds = [
        ...new Set(
            schedules.flatMap((schedule) =>
                schedule.escalationChain
                    .filter((step) => step.step === 1 && step.user)
                    .map((step) => String(step.user._id))
            )
        ),
    ];

    const eligibleUserIds = scheduledUserIds.length
        ? scheduledUserIds
        : await DepartmentUser.distinct("user", {
              department: { $in: departmentIds },
              isActive: true,
          });

    if (!eligibleUserIds.length) return null;

    const memberships = await DepartmentUser.find({
        department: { $in: departmentIds },
        user: { $in: eligibleUserIds },
        isActive: true,
    }).populate("user", "name email role isActive");

    const agents = memberships
        .map((membership) => ({
            user: membership.user,
            department: membership.department,
        }))
        .filter(
            (candidate) =>
                candidate.user &&
                candidate.user.isActive &&
                [ROLES.AGENT, ROLES.ADMIN].includes(candidate.user.role)
        );

    if (!agents.length) return null;

    const agentIds = agents.map((agent) => agent.user._id);
    const workload = await Incident.aggregate([
        {
            $match: {
                department: { $in: departmentIds },
                category: categoryId,
                assignedTo: { $in: agentIds },
                status: { $nin: TERMINAL_STATUSES },
            },
        },
        {
            $group: {
                _id: "$assignedTo",
                total: { $sum: 1 },
                priorities: { $push: "$priority" },
            },
        },
    ]);

    const workloadByAgent = new Map(
        workload.map((item) => [
            String(item._id),
            {
                total: item.total,
                byPriority: Object.fromEntries(
                    PRIORITY_VALUES.map((priority) => [
                        priority,
                        item.priorities.filter((value) => value === priority).length,
                    ])
                ),
            },
        ])
    );

    const candidates = agents.map((agent) => ({
        user: agent.user,
        department: agent.department,
        ...(workloadByAgent.get(String(agent.user._id)) || {
            total: 0,
            byPriority: Object.fromEntries(PRIORITY_VALUES.map((priority) => [priority, 0])),
        }),
    }));

    const selected = chooseLeastLoadedAgent(candidates);
    return selected ? { user: selected.user, department: selected.department } : null;
};

const autoAssignOnCall = async (incident) => {
    try {
        if (![PRIORITY.HIGH, PRIORITY.CRITICAL].includes(incident.priority)) {
            return;
        }

        const now = new Date();
        const selectedAssignee = await selectL1Assignee({
            department: incident.department,
            category: incident.category,
        });

        if (!selectedAssignee) {
            logger.info(`No active L1 department member found for department ${incident.department}`);
            return;
        }
        const selectedUser = selectedAssignee.user;
        incident.assignedTo = selectedUser._id;
        incident.status = STATUS.IN_PROGRESS;
        incident.escalationLevel = 1;
        incident.lastEscalatedAt = now;
        const schedule = await OnCallSchedule.findOne({
            department: incident.department,
            $or: [{ category: null }, { category: incident.category }],
            startTime: { $lte: now },
            endTime: { $gte: now },
            isActive: true,
        });
        incident.ackWindowMinutes = schedule?.ackWindowMinutes || 15;
        await incident.save();

        await activityService.record({
            incident: incident._id,
            action: ACTIVITY_ACTIONS.ASSIGNED,
            performedBy: selectedUser._id,
            note: `Auto-assigned to Level 1 on-call responder (${selectedUser.name})`,
        });

        await sendIncidentEscalated({
            to: selectedUser.email,
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
    chooseLeastLoadedAgent,
    selectL1Assignee,
};