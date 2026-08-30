const mongoose = require("mongoose");
const Incident = require("../models/Incident");
const Category = require("../models/Category");
const RootCauseAnalysis = require("../models/RootCauseAnalysis");
const IncidentLink = require("../models/IncidentLink");
const asyncHandler = require("../utils/asyncHandler");
const { successResponse } = require("../utils/apiResponse");
const permissions = require("../services/permissionService");
const slaService = require("../services/slaService");
const {
    ROLES,
    STATUS,
    STATUS_VALUES,
    STATUS_LABELS,
    PRIORITY_VALUES,
    PRIORITY_LABELS,
    TERMINAL_STATUSES,
} = require("../constants");

/**
 * Dashboard aggregations (FR-11).
 *
 * Every pipeline starts from the caller's visibility filter, so an End User's
 * dashboard counts only their own incidents while an Admin sees the whole
 * organisation - the numbers always match what that user can open.
 */

/** Turns [{_id, count}] into a dense series with zeros for missing buckets. */
const densify = (rows, keys, labels) => {
    const found = new Map(rows.map((row) => [row._id, row.count]));

    return keys.map((key) => ({
        key,
        label: labels[key] || key,
        count: found.get(key) || 0,
    }));
};

/** GET /api/v1/dashboard/summary */
const getSummary = asyncHandler(async (req, res) => {
    const scope = permissions.visibilityFilter(req.user);
    const now = new Date();

    const [
        total,
        statusRows,
        priorityRows,
        overdue,
        unassigned,
        assignedToMe,
        reportedByMe,
        resolutionStats,
    ] = await Promise.all([
        Incident.countDocuments(scope),

        Incident.aggregate([
            { $match: scope },
            { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),

        Incident.aggregate([
            { $match: scope },
            { $group: { _id: "$priority", count: { $sum: 1 } } },
        ]),

        Incident.countDocuments({ ...scope, ...slaService.overdueFilter(now) }),

        // Only meaningful for staff, but cheap enough to always compute.
        Incident.countDocuments({
            ...scope,
            assignedTo: null,
            status: { $nin: TERMINAL_STATUSES },
        }),

        Incident.countDocuments({
            ...scope,
            assignedTo: req.user._id,
            status: { $nin: TERMINAL_STATUSES },
        }),

        Incident.countDocuments({ ...scope, reportedBy: req.user._id }),

        // Mean time to resolve, in hours, over incidents that were resolved.
        Incident.aggregate([
            { $match: { ...scope, resolvedAt: { $ne: null } } },
            {
                $group: {
                    _id: null,
                    avgMs: { $avg: { $subtract: ["$resolvedAt", "$createdAt"] } },
                    count: { $sum: 1 },
                },
            },
        ]),
    ]);

    const byStatus = densify(statusRows, STATUS_VALUES, STATUS_LABELS);
    const byPriority = densify(priorityRows, PRIORITY_VALUES, PRIORITY_LABELS);

    const countOf = (series, key) => {
        const match = series.find((item) => item.key === key);
        return match ? match.count : 0;
    };

    const resolved = countOf(byStatus, STATUS.RESOLVED);
    const closed = countOf(byStatus, STATUS.CLOSED);

    const avgMs = resolutionStats.length ? resolutionStats[0].avgMs : 0;

    return successResponse(res, 200, "Dashboard summary retrieved", {
        counts: {
            total,
            open: total - resolved - closed,
            new: countOf(byStatus, STATUS.NEW),
            inProgress: countOf(byStatus, STATUS.IN_PROGRESS),
            onHold: countOf(byStatus, STATUS.ON_HOLD),
            resolved,
            closed,
            overdue,
            unassigned,
            assignedToMe,
            reportedByMe,
        },
        byStatus,
        byPriority,
        resolution: {
            resolvedCount: resolutionStats.length ? resolutionStats[0].count : 0,
            averageHours: avgMs ? Math.round((avgMs / 3600000) * 10) / 10 : 0,
        },
        slaTargets: slaService.slaTargets(),
    });
});

/**
 * GET /api/v1/dashboard/charts?days=30
 * Series for the dashboard charts: category split and a created/resolved trend.
 */
const getCharts = asyncHandler(async (req, res) => {
    const scope = permissions.visibilityFilter(req.user);

    const days = Math.min(90, Math.max(7, Number.parseInt(req.query.days, 10) || 30));

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const [categoryRows, categories, createdRows, resolvedRows] = await Promise.all([
        Incident.aggregate([
            { $match: scope },
            { $group: { _id: "$category", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]),

        Category.find().select("name").lean(),

        Incident.aggregate([
            { $match: { ...scope, createdAt: { $gte: since } } },
            {
                $group: {
                    _id: {
                        $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                    },
                    count: { $sum: 1 },
                },
            },
        ]),

        Incident.aggregate([
            { $match: { ...scope, resolvedAt: { $gte: since } } },
            {
                $group: {
                    _id: {
                        $dateToString: { format: "%Y-%m-%d", date: "$resolvedAt" },
                    },
                    count: { $sum: 1 },
                },
            },
        ]),
    ]);

    const categoryNames = new Map(
        categories.map((category) => [String(category._id), category.name])
    );

    const byCategory = categoryRows.map((row) => ({
        key: String(row._id),
        label: categoryNames.get(String(row._id)) || "Uncategorised",
        count: row.count,
    }));

    // Build a zero-filled day axis so the trend line has no gaps.
    const createdByDay = new Map(createdRows.map((row) => [row._id, row.count]));
    const resolvedByDay = new Map(resolvedRows.map((row) => [row._id, row.count]));

    const trend = [];
    for (let offset = 0; offset < days; offset += 1) {
        const day = new Date(since);
        day.setDate(since.getDate() + offset);

        const key = day.toISOString().slice(0, 10);

        trend.push(
            { date: key, type: "Created", count: createdByDay.get(key) || 0 },
            { date: key, type: "Resolved", count: resolvedByDay.get(key) || 0 }
        );
    }

    return successResponse(res, 200, "Chart data retrieved", {
        byCategory,
        trend,
        days,
    });
});

/**
 * GET /api/v1/dashboard/workload  (Admin only)
 * Per-agent open workload, so a manager can see who is overloaded.
 */
const getAgentWorkload = asyncHandler(async (_req, res) => {
    const rows = await Incident.aggregate([
        { $match: { assignedTo: { $ne: null } } },
        {
            $group: {
                _id: "$assignedTo",
                total: { $sum: 1 },
                open: {
                    $sum: {
                        $cond: [{ $in: ["$status", TERMINAL_STATUSES] }, 0, 1],
                    },
                },
                overdue: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $not: [{ $in: ["$status", TERMINAL_STATUSES] }] },
                                    { $lt: ["$dueBy", new Date()] },
                                ],
                            },
                            1,
                            0,
                        ],
                    },
                },
            },
        },
        {
            $lookup: {
                from: "users",
                localField: "_id",
                foreignField: "_id",
                as: "agent",
            },
        },
        { $unwind: "$agent" },
        {
            $project: {
                _id: 0,
                agentId: "$_id",
                name: "$agent.name",
                email: "$agent.email",
                role: "$agent.role",
                total: 1,
                open: 1,
                overdue: 1,
            },
        },
        { $sort: { open: -1, total: -1 } },
    ]);

    return successResponse(res, 200, "Agent workload retrieved", { workload: rows });
});

/**
 * GET /api/v1/dashboard/recent
 * The "needs attention" list under the dashboard tiles.
 */
const getRecentIncidents = asyncHandler(async (req, res) => {
    const scope = permissions.visibilityFilter(req.user);
    const limit = Math.min(20, Math.max(1, Number.parseInt(req.query.limit, 10) || 5));

    const populate = [
        { path: "category", select: "name" },
        { path: "reportedBy", select: "name email" },
        { path: "assignedTo", select: "name email" },
    ];

    const [recent, overdue] = await Promise.all([
        Incident.find(scope)
            .populate(populate)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean(),

        Incident.find({ ...scope, ...slaService.overdueFilter() })
            .populate(populate)
            // Longest-breached first: the most urgent thing to look at.
            .sort({ dueBy: 1 })
            .limit(limit)
            .lean(),
    ]);

    const decorate = (incident) => ({
        ...incident,
        isOverdue: slaService.isOverdue(incident),
        slaState: slaService.slaState(incident),
    });

    // An agent's landing page should lead with their own queue.
    const myQueue =
        req.user.role === ROLES.USER
            ? []
            : await Incident.find({
                  assignedTo: req.user._id,
                  status: { $nin: TERMINAL_STATUSES },
              })
                  .populate(populate)
                  .sort({ priorityWeight: -1, dueBy: 1 })
                  .limit(limit)
                  .lean();

    return successResponse(res, 200, "Recent incidents retrieved", {
        recent: recent.map(decorate),
        overdue: overdue.map(decorate),
        myQueue: myQueue.map(decorate),
    });
});


/** Keeps every advanced widget on exactly the same category, priority and date scope. */
const advancedIncidentFilter = (req) => {
    const filter = { ...permissions.visibilityFilter(req.user) };
    const categories = String(req.query.category || "").split(",").filter(mongoose.Types.ObjectId.isValid);
    const priorities = String(req.query.priority || "").split(",").filter((value) => PRIORITY_VALUES.includes(value));

    if (categories.length) filter.category = { $in: categories.map((value) => new mongoose.Types.ObjectId(value)) };
    if (priorities.length) filter.priority = { $in: priorities };

    const dateRange = {};
    if (req.query.dateFrom && !Number.isNaN(Date.parse(req.query.dateFrom))) dateRange.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo && !Number.isNaN(Date.parse(req.query.dateTo))) dateRange.$lte = new Date(req.query.dateTo);
    if (Object.keys(dateRange).length) filter.createdAt = dateRange;

    return filter;
};

const prefixFilter = (filter, prefix) => Object.fromEntries(
    Object.entries(filter).map(([key, value]) => [`${prefix}.${key}`, value])
);

/** GET /api/v1/dashboard/advanced - filter-aware analytics for FR3-14..17. */
const getAdvancedAnalytics = asyncHandler(async (req, res) => {
    const filter = advancedIncidentFilter(req);
    const incidentFilter = prefixFilter(filter, "incident");
    const [trend, rootCauses, majorIncidents, performance] = await Promise.all([
        Incident.aggregate([{ $match: filter }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
        RootCauseAnalysis.aggregate([
            { $match: { status: "approved" } },
            { $lookup: { from: "incidents", localField: "incident", foreignField: "_id", as: "incident" } }, { $unwind: "$incident" },
            { $match: incidentFilter },
            { $group: { _id: "$rootCauseCategory", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 },
        ]),
        IncidentLink.aggregate([
            { $match: { relationshipType: "Child-Of" } },
            { $group: { _id: "$toIncidentId", childCount: { $sum: 1 } } },
            { $lookup: { from: "incidents", localField: "_id", foreignField: "_id", as: "incident" } }, { $unwind: "$incident" },
            { $match: { ...incidentFilter, "incident.status": { $nin: TERMINAL_STATUSES } } },
            { $project: { _id: 0, incidentId: "$incident._id", incidentNumber: "$incident.incidentNumber", title: "$incident.title", status: "$incident.status", childCount: 1 } }, { $sort: { childCount: -1 } }, { $limit: 10 },
        ]),
        Incident.aggregate([
            { $match: { ...filter, assignedTo: { $ne: null }, resolvedAt: { $ne: null } } },
            { $group: { _id: "$assignedTo", resolved: { $sum: 1 }, avgMs: { $avg: { $subtract: ["$resolvedAt", "$createdAt"] } }, slaMet: { $sum: { $cond: [{ $lte: ["$resolvedAt", "$dueBy"] }, 1, 0] } } } },
            { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "agent" } }, { $unwind: "$agent" },
            { $project: { _id: 0, agentId: "$_id", name: "$agent.name", resolved: 1, averageHours: { $round: [{ $divide: ["$avgMs", 3600000] }, 1] }, slaCompliance: { $round: [{ $multiply: [{ $divide: ["$slaMet", "$resolved"] }, 100] }, 1] } } }, { $sort: { resolved: -1 } },
        ]),
    ]);
    return successResponse(res, 200, "Advanced analytics retrieved", { trend: trend.map((row) => ({ date: row._id, count: row.count })), rootCauses: rootCauses.map((row) => ({ category: row._id, count: row.count })), majorIncidents, performance });
});
module.exports = { getSummary, getCharts, getAgentWorkload, getRecentIncidents, getAdvancedAnalytics };
