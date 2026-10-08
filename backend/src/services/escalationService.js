
const mongoose = require("mongoose");
const OnCallSchedule = require("../models/OnCallSchedule");
const Department = require("../models/Department");
const Incident = require("../models/Incident");
const DepartmentUser = require("../models/DepartmentUser");
const activityService = require("./activityService");
const { sendIncidentEscalated } = require("./emailService");
const { pushIncidentEvent } = require("./notificationService");
const { PUSH_EVENTS } = require("./pushNotificationService");
const logger = require("../utils/logger");

const {
    PRIORITY,
    STATUS,
    ACTIVITY_ACTIONS,
    PRIORITY_VALUES,
    TERMINAL_STATUSES,
    ROLES,
    SUPPORT_AGENT_DESIGNATION,
} = require("../constants");

const priorityOrder = [
    PRIORITY.CRITICAL,
    PRIORITY.HIGH,
    PRIORITY.MEDIUM,
    PRIORITY.LOW,
];

/**
 * Select the least-loaded agent.
 *
 * Workload is compared by:
 * 1. Total open incidents
 * 2. Critical incidents
 * 3. High incidents
 * 4. Medium incidents
 * 5. Low incidents
 */
const chooseLeastLoadedAgent = (agents) => {
    if (!agents.length) return null;

    const sorted = [...agents].sort((a, b) => {
        if (a.total !== b.total) {
            return a.total - b.total;
        }

        for (const priority of priorityOrder) {
            if (a.byPriority[priority] !== b.byPriority[priority]) {
                return (
                    a.byPriority[priority] -
                    b.byPriority[priority]
                );
            }
        }

        return 0;
    });

    const best = sorted[0];

    const tied = sorted.filter(
        (agent) =>
            agent.total === best.total &&
            priorityOrder.every(
                (priority) =>
                    agent.byPriority[priority] ===
                    best.byPriority[priority]
            )
    );

    return tied[Math.floor(Math.random() * tied.length)];
};

/**
 * Find an L1 support agent for an incident.
 *
 * L1 means:
 *   role       = support_agent
 *   designation = L1
 *   isActive   = true
 *
 * The user must also be an active member of the incident's department.
 *
 * On-call step 1 is used as an optional restriction when a valid
 * on-call schedule exists. If no schedule is configured, all active
 * L1 members of the department are considered.
 */
const selectL1Assignee = async ({ department, category }) => {
    const departmentId =
        department &&
        mongoose.Types.ObjectId.isValid(department)
            ? new mongoose.Types.ObjectId(department)
            : department;

    const categoryId =
        category &&
        mongoose.Types.ObjectId.isValid(category)
            ? new mongoose.Types.ObjectId(category)
            : category;

    /*
     * If a department is already known, use it.
     * Otherwise find the active department that owns the category.
     */
    const departments = departmentId
        ? await Department.find({
              _id: departmentId,
              isActive: true,
          })
              .select("_id")
              .lean()
        : await Department.find({
              categories: categoryId,
              isActive: true,
          })
              .select("_id")
              .lean();

    const departmentIds = departments.map(
        ({ _id }) => _id
    );

    if (!departmentIds.length) {
        return null;
    }

    const now = new Date();

    /*
     * First look for an active on-call schedule.
     *
     * Only step 1 users are considered for L1.
     */
    const schedules = await OnCallSchedule.find({
        department: { $in: departmentIds },
        $or: [
            { category: null },
            { category: categoryId },
        ],
        startTime: { $lte: now },
        endTime: { $gte: now },
        isActive: true,
    }).populate(
        "escalationChain.user",
        "name email role designation isActive"
    );

    const scheduledUserIds = [
        ...new Set(
            schedules.flatMap((schedule) =>
                (schedule.escalationChain || [])
                    .filter(
                        (step) =>
                            step.step === 1 &&
                            step.user &&
                            step.user.isActive &&
                            step.user.role === ROLES.AGENT &&
                            step.user.designation ===
                                SUPPORT_AGENT_DESIGNATION.L1
                    )
                    .map((step) =>
                        String(step.user._id)
                    )
            )
        ),
    ];

    /*
     * If an on-call L1 is configured, only those users are eligible.
     *
     * Otherwise fall back to all active L1 members of
     * the department.
     */
    const eligibleUserIds = scheduledUserIds.length
        ? scheduledUserIds
        : await DepartmentUser.distinct("user", {
              department: {
                  $in: departmentIds,
              },
              isActive: true,
          });

    if (!eligibleUserIds.length) {
        return null;
    }

    /*
     * Get active department memberships and populate users.
     *
     * IMPORTANT:
     * Admins are intentionally excluded.
     * Only support_agent + L1 designation can be auto-assigned.
     */
    const memberships = await DepartmentUser.find({
        department: { $in: departmentIds },
        user: { $in: eligibleUserIds },
        isActive: true,
    }).populate(
        "user",
        "name email role designation isActive"
    );

    const agents = memberships
        .map((membership) => ({
            user: membership.user,
            department: membership.department,
        }))
        .filter(
            (candidate) =>
                candidate.user &&
                candidate.user.isActive === true &&
                candidate.user.role === ROLES.AGENT &&
                candidate.user.designation ===
                    SUPPORT_AGENT_DESIGNATION.L1
        );

    if (!agents.length) {
        return null;
    }

    /*
     * Remove duplicate users if a user belongs to more than
     * one matching department.
     */
    const uniqueAgents = [
        ...new Map(
            agents.map((agent) => [
                String(agent.user._id),
                agent,
            ])
        ).values(),
    ];

    const agentIds = uniqueAgents.map(
        (agent) => agent.user._id
    );

    /*
     * Calculate open workload for each L1 agent.
     */
    const workload = await Incident.aggregate([
        {
            $match: {
                department: {
                    $in: departmentIds,
                },
                category: categoryId,
                assignedTo: {
                    $in: agentIds,
                },
                status: {
                    $nin: TERMINAL_STATUSES,
                },
            },
        },
        {
            $group: {
                _id: "$assignedTo",
                total: { $sum: 1 },
                priorities: {
                    $push: "$priority",
                },
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
                        item.priorities.filter(
                            (value) =>
                                value === priority
                        ).length,
                    ])
                ),
            },
        ])
    );

    const candidates = uniqueAgents.map(
        (agent) => ({
            user: agent.user,
            department: agent.department,
            ...(workloadByAgent.get(
                String(agent.user._id)
            ) || {
                total: 0,
                byPriority:
                    Object.fromEntries(
                        PRIORITY_VALUES.map(
                            (priority) => [
                                priority,
                                0,
                            ]
                        )
                    ),
            }),
        })
    );

    const selected =
        chooseLeastLoadedAgent(candidates);

    return selected
        ? {
              user: selected.user,
              department: selected.department,
          }
        : null;
};

/**
 * Automatically assign a high/critical incident to an L1 agent.
 */
const autoAssignOnCall = async (incident) => {
    try {
        if (
            ![
                PRIORITY.HIGH,
                PRIORITY.CRITICAL,
            ].includes(incident.priority)
        ) {
            return;
        }

        const now = new Date();

        const selectedAssignee =
            await selectL1Assignee({
                department: incident.department,
                category: incident.category,
            });

        if (!selectedAssignee) {
            logger.info(
                `No active L1 support agent found for department ${incident.department}`
            );
            return;
        }

        const selectedUser =
            selectedAssignee.user;

        incident.assignedTo = selectedUser._id;
        incident.status = STATUS.IN_PROGRESS;
        incident.escalationLevel = 1;
        incident.lastEscalatedAt = now;

        const schedule =
            await OnCallSchedule.findOne({
                department: incident.department,
                $or: [
                    { category: null },
                    {
                        category:
                            incident.category,
                    },
                ],
                startTime: { $lte: now },
                endTime: { $gte: now },
                isActive: true,
            });

        incident.ackWindowMinutes =
            schedule?.ackWindowMinutes || 15;

        await incident.save();

        await activityService.record({
            incident: incident._id,
            action: ACTIVITY_ACTIONS.ASSIGNED,
            performedBy: selectedUser._id,
            note: `Auto-assigned to L1 support agent (${selectedUser.name})`,
        });

        await sendIncidentEscalated({
            to: selectedUser.email,
            incident,
            stepName: "Level 1 Support Agent",
        });
    } catch (err) {
        logger.error(
            `Auto-assign L1 failure: ${err.message}`
        );
    }
};

/**
 * Escalate an unacknowledged critical incident to L2.
 */
const processUnacknowledgedEscalations = async () => {
    logger.info(
        "Running escalation cron check"
    );

    const now = new Date();

    const overdueIncidents =
        await Incident.find({
            status: {
                $in: [
                    STATUS.NEW,
                    STATUS.OPEN,
                    "New",
                    "Open",
                ],
            },
            priority: {
                $regex: /^critical$/i,
            },
            acknowledgedAt: null,
        });

    logger.info(
        `Found ${overdueIncidents.length} unacknowledged critical incidents.`
    );

    for (const incident of overdueIncidents) {
        const ackWindow =
            incident.ackWindowMinutes || 15;

        const anchor =
            incident.lastEscalatedAt ||
            incident.createdAt;

        const deadline = new Date(
            anchor.getTime() +
                ackWindow * 60000
        );

        if (now <= deadline) {
            continue;
        }

        logger.info(
            `Escalating ${incident.incidentNumber} to Level 2`
        );

        const schedule =
            await OnCallSchedule.findOne({
                department: incident.department,
                $or: [
                    { category: null },
                    {
                        category:
                            incident.category,
                    },
                ],
                isActive: true,
            });

        if (
            !schedule ||
            !schedule.escalationChain?.length
        ) {
            continue;
        }

        /*
         * L2 is deliberately NOT selected as an L1.
         * Step 2 handles escalation.
         */
        const level2User =
            schedule.escalationChain.find(
                (step) => step.step === 2
            )?.user;

        if (!level2User) {
            continue;
        }

        incident.assignedTo = level2User;
        incident.escalationLevel = 2;
        incident.lastEscalatedAt = now;

        await incident.save();

        logger.info(
            `Escalated ${incident.incidentNumber} to Level 2 user ${level2User}`
        );

        // Best-effort web push to the new L2 owner and the reporter
        // (push-only - this path historically had no notification hook).
        await pushIncidentEvent({
            recipients: [level2User, incident.reportedBy],
            incident,
            type: PUSH_EVENTS.INCIDENT_ESCALATED,
            title: `${incident.incidentNumber} escalated to Level 2`,
            body: incident.title,
        });
    }
};

module.exports = {
    autoAssignOnCall,
    processUnacknowledgedEscalations,
    chooseLeastLoadedAgent,
    selectL1Assignee,
};

