const OnCallSchedule = require("../models/OnCallSchedule");

/**
 * Retrieves an array of unique user IDs (as strings) who are 
 * currently on an active on-call schedule.
 */
const getActiveOnCallUserIds = async () => {
    const now = new Date();

    // Query active schedules where current time falls between startTime and endTime
    const activeSchedules = await OnCallSchedule.find({
        isActive: true,
        startTime: { $lte: now },
        endTime: { $gte: now },
    }).lean();

    const onCallUserIds = new Set();

    activeSchedules.forEach((schedule) => {
        if (Array.isArray(schedule.escalationChain)) {
            schedule.escalationChain.forEach((step) => {
                if (step.user) {
                    onCallUserIds.add(step.user.toString());
                }
            });
        }
    });

    return Array.from(onCallUserIds);
};

module.exports = {
    getActiveOnCallUserIds,
};