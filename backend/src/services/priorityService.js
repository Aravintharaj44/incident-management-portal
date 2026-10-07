const { PRIORITY } = require("../constants");

// Kept in one place so intake, API and UI consumers never each implement a
// subtly different Impact x Urgency decision table.  Deployments may replace
// this table with PRIORITY_MATRIX_JSON without changing application code.
const DEFAULT_MATRIX = {
    high: { high: PRIORITY.CRITICAL, medium: PRIORITY.HIGH, low: PRIORITY.HIGH },
    medium: { high: PRIORITY.HIGH, medium: PRIORITY.MEDIUM, low: PRIORITY.MEDIUM },
    low: { high: PRIORITY.MEDIUM, medium: PRIORITY.LOW, low: PRIORITY.LOW },
};
const LEVELS = ["low", "medium", "high"];

const matrix = () => {
    try {
        const configured = process.env.PRIORITY_MATRIX_JSON && JSON.parse(process.env.PRIORITY_MATRIX_JSON);
        if (configured && LEVELS.every((impact) => LEVELS.every((urgency) => configured[impact]?.[urgency]))) return configured;
    } catch (_) { /* fall back to the reviewed default */ }
    return DEFAULT_MATRIX;
};

const calculatePriority = (impact, urgency) => {
    if (!LEVELS.includes(impact) || !LEVELS.includes(urgency)) return null;
    return matrix()[impact][urgency];
};

module.exports = { LEVELS, DEFAULT_MATRIX, matrix, calculatePriority };
