const test = require("node:test");
const assert = require("node:assert/strict");
const { calculatePriority } = require("../src/services/priorityService");

test("Impact x Urgency produces the centrally configured P1-P4 priorities", () => {
    assert.equal(calculatePriority("high", "high"), "critical");
    assert.equal(calculatePriority("high", "medium"), "high");
    assert.equal(calculatePriority("medium", "medium"), "medium");
    assert.equal(calculatePriority("low", "low"), "low");
});

test("Impact x Urgency rejects incomplete or invalid combinations", () => {
    assert.equal(calculatePriority("high", "urgent"), null);
    assert.equal(calculatePriority(undefined, "high"), null);
});
