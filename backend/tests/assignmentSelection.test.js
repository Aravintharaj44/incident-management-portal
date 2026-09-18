const test = require("node:test");
const assert = require("node:assert/strict");
const OnCallSchedule = require("../src/models/OnCallSchedule");
const DepartmentUser = require("../src/models/DepartmentUser");
const Incident = require("../src/models/Incident");
const { chooseLeastLoadedAgent, selectL1Assignee } = require("../src/services/escalationService");

const workload = (id, total, byPriority = {}) => ({
    user: { _id: id },
    total,
    byPriority: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        ...byPriority,
    },
});

test("selects the only eligible on-call L1 agent", () => {
    assert.equal(chooseLeastLoadedAgent([workload("rahul", 4)]).user._id, "rahul");
});

test("selects the eligible agent with the lowest assigned incident count", () => {
    assert.equal(
        chooseLeastLoadedAgent([workload("rahul", 3), workload("kumar", 5)]).user._id,
        "rahul"
    );
});

test("uses higher-priority workload as the tie-breaker", () => {
    assert.equal(
        chooseLeastLoadedAgent([
            workload("rahul", 3, { critical: 1 }),
            workload("kumar", 3, { high: 1 }),
        ]).user._id,
        "kumar"
    );
});

test("randomly chooses among completely tied agents", () => {
    const originalRandom = Math.random;
    Math.random = () => 0.99;

    try {
        assert.equal(
            chooseLeastLoadedAgent([workload("rahul", 3), workload("kumar", 3)]).user._id,
            "kumar"
        );
    } finally {
        Math.random = originalRandom;
    }
});

test("falls back to active department L1 members without an on-call roster", async () => {
    const originalScheduleFind = OnCallSchedule.find;
    const originalDistinct = DepartmentUser.distinct;
    const originalDepartmentFind = DepartmentUser.find;
    const originalAggregate = Incident.aggregate;
    const members = [
        { _id: "rahul", name: "Rahul", role: "support_agent", isActive: true },
        { _id: "kumar", name: "Kumar", role: "support_agent", isActive: true },
    ];

    OnCallSchedule.find = () => ({ populate: async () => [] });
    DepartmentUser.distinct = async () => members.map((member) => member._id);
    DepartmentUser.find = () => ({
        populate: async () => members.map((user) => ({ user })),
    });
    Incident.aggregate = async () => [];

    try {
        const selected = await selectL1Assignee({ department: "department-1", category: "category-1" });
        assert.ok(["rahul", "kumar"].includes(selected.user._id));
    } finally {
        OnCallSchedule.find = originalScheduleFind;
        DepartmentUser.distinct = originalDistinct;
        DepartmentUser.find = originalDepartmentFind;
        Incident.aggregate = originalAggregate;
    }
});