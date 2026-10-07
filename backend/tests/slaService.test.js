const test = require("node:test");
const assert = require("node:assert/strict");
const sla = require("../src/services/slaService");

test("acknowledgement SLA reports met and breached independently from resolution", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    assert.equal(sla.acknowledgementState({ acknowledgementDueBy: new Date("2026-01-01T11:00:00Z"), acknowledgedAt: new Date("2026-01-01T10:59:00Z") }, now), "met");
    assert.equal(sla.acknowledgementState({ acknowledgementDueBy: new Date("2026-01-01T11:00:00Z") }, now), "breached");
});

test("On Hold pauses SLA breach display", () => {
    const incident = { status: "on_hold", dueBy: new Date("2020-01-01T00:00:00Z"), priority: "high" };
    assert.equal(sla.isOverdue(incident), false);
    assert.equal(sla.slaState(incident), "on_hold");
});
