const OnCallSchedule = require("../models/OnCallSchedule");
const Incident = require("../models/Incident");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { successResponse } = require("../utils/apiResponse");

const createRoster = asyncHandler(async (req, res) => {
    const { department, category, startTime, endTime, ackWindowMinutes, escalationChain } = req.body;

    if (!department || !startTime || !endTime || !escalationChain?.length) {
        throw ApiError.badRequest("Department, shift window, and escalation chain are required.");
    }

    const schedule = await OnCallSchedule.create({
        department,
        category: category || null,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        ackWindowMinutes: ackWindowMinutes || 15,
        escalationChain,
        createdBy: req.user._id,
    });

    const populated = await OnCallSchedule.findById(schedule._id)
        .populate("department", "name")
        .populate("escalationChain.user", "name email role");

    return successResponse(res, 201, "On-call roster configured successfully", { schedule: populated });
});

const acknowledgeIncident = async (req, res) => {
    try {
        const { id } = req.params;

        const incident = await Incident.findByIdAndUpdate(
            id,
            {
                acknowledgedAt: new Date(),
                acknowledgedBy: req.user._id,
                isAcknowledged: true
            },
            { new: true }
        );

        if (!incident) {
            return res.status(404).json({ message: "Incident not found" });
        }

        if (!incident.acknowledgedAt) {
            return res.status(500).json({
                message: "Acknowledge did not persist — check that acknowledgedAt/acknowledgedBy/isAcknowledged exist on the Incident schema."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Incident acknowledged successfully",
            data: incident
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getCalendarView = asyncHandler(async (req, res) => {
    const { department, start, end } = req.query;
    const query = { isActive: true };

    if (department) query.department = department;

    if (start && end) {
        query.startTime = { $lte: new Date(end) };
        query.endTime = { $gte: new Date(start) };
    }

    const schedules = await OnCallSchedule.find(query)
        .populate("department", "name")
        .populate("category", "name")
        .populate("escalationChain.user", "name email role")
        .sort({ startTime: 1 })
        .lean();

    return successResponse(res, 200, "On-call calendar fetched successfully", { schedules });
});

module.exports = {
    createRoster,
    acknowledgeIncident,
    getCalendarView,
};