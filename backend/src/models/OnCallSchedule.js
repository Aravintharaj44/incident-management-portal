const mongoose = require("mongoose");

const escalationStepSchema = new mongoose.Schema(
    {
        step: {
            type: Number,
            required: true, // 1 = Primary On-Call, 2 = Team Lead, 3 = Admin/Manager
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    { _id: false }
);

const onCallScheduleSchema = new mongoose.Schema(
    {
        department: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Department",
            required: true,
        },
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            default: null,
        },
        startTime: {
            type: Date,
            required: true,
        },
        endTime: {
            type: Date,
            required: true,
        },
        // FR4-23: Acknowledgement window in minutes (Default: 15 mins)
        ackWindowMinutes: {
            type: Number,
            default: 15,
            required: true,
        },
        // FR4-24: Escalation chain sequence
        escalationChain: [escalationStepSchema],
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("OnCallSchedule", onCallScheduleSchema);