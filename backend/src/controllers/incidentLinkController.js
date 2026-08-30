const mongoose = require("mongoose");

const Incident = require("../models/Incident");
const IncidentLink = require("../models/IncidentLink");
const IncidentCorrelationSuggestion = require("../models/IncidentCorrelationSuggestion");

const activityService = require("../services/activityService");
const permissions = require("../services/permissionService");

const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { successResponse } = require("../utils/apiResponse");

const {
    ROLES,
    ACTIVITY_ACTIONS,
} = require("../constants");

const isValidId = (value) =>
    mongoose.Types.ObjectId.isValid(value);

/**
 * ============================================================
 * GET LINKED INCIDENTS
 * ============================================================
 *
 * GET /api/v1/incidents/:id/links
 */
const listIncidentLinks = asyncHandler(async (req, res) => {
    const incidentId = req.params.id;

    if (!isValidId(incidentId)) {
        throw ApiError.badRequest("Invalid incident ID");
    }

    const incident = await Incident.findById(incidentId);

    if (!incident) {
        throw ApiError.notFound("Incident not found");
    }

    if (!permissions.canView(req.user, incident)) {
        throw ApiError.forbidden(
            "You do not have access to this incident"
        );
    }

    const links = await IncidentLink.find({
        $or: [
            { fromIncidentId: incident._id },
            { toIncidentId: incident._id },
        ],
    })
        .populate({
            path: "fromIncidentId",
            select:
                "incidentNumber title status priority assignedTo",
            populate: {
                path: "assignedTo",
                select: "name email role",
            },
        })
        .populate({
            path: "toIncidentId",
            select:
                "incidentNumber title status priority assignedTo",
            populate: {
                path: "assignedTo",
                select: "name email role",
            },
        })
        .populate(
            "linkedBy",
            "name email role"
        )
        .sort({ createdAt: -1 })
        .lean();

    const linkedIncidents = links.map((link) => {
        const isFromCurrent =
            String(link.fromIncidentId._id) ===
            String(incidentId);

        const linkedIncident = isFromCurrent
            ? link.toIncidentId
            : link.fromIncidentId;

        let relationshipType =
            link.relationshipType;

        /**
         * Caused-By is directional.
         *
         * DB:
         *
         * INC-001 Caused-By INC-002
         *
         * If current incident = INC-001:
         *     Caused-By
         *
         * If current incident = INC-002:
         *     Causes
         */
        if (link.relationshipType === "Child-Of") {
            relationshipType = isFromCurrent ? "Child of" : "Child incident";
        } else if (
            link.relationshipType === "Caused-By" &&
            !isFromCurrent
        ) {
            relationshipType = "Causes";
        }

        return {
            linkId: link._id,

            incident: linkedIncident,

            relationshipType,

            /**
             * Keep original value because frontend may
             * need it when deleting/editing.
             */
            originalRelationshipType:
                link.relationshipType,

            linkedBy: link.linkedBy,

            createdAt: link.createdAt,
        };
    });

    return successResponse(
        res,
        200,
        "Linked incidents retrieved",
        {
            links: linkedIncidents,
        }
    );
});


/**
 * ============================================================
 * CREATE INCIDENT LINK
 * ============================================================
 *
 * POST /api/v1/incidents/:id/links
 *
 * Body:
 *
 * {
 *   "toIncidentId": "...",
 *   "relationshipType": "Related"
 * }
 */
const createIncidentLink = asyncHandler(async (req, res) => {
    const fromIncidentId = req.params.id;

    const {
        toIncidentId,
        relationshipType,
    } = req.body;


    /**
     * Validate IDs
     */
    if (!isValidId(fromIncidentId)) {
        throw ApiError.badRequest(
            "Invalid source incident ID"
        );
    }

    if (!isValidId(toIncidentId)) {
        throw ApiError.badRequest(
            "Invalid target incident ID"
        );
    }

    /**
     * Validate relationship type
     */
    if (
        !IncidentLink.RELATIONSHIP_TYPES.includes(
            relationshipType
        )
    ) {
        throw ApiError.badRequest(
            "Relationship type must be Related, Duplicate, or Caused-By"
        );
    }

    /**
     * Prevent:
     *
     * INC-001 -> INC-001
     */
    if (
        String(fromIncidentId) ===
        String(toIncidentId)
    ) {
        throw ApiError.badRequest(
            "An incident cannot be linked to itself"
        );
    }

    /**
     * Get both incidents.
     */
    const [fromIncident, toIncident] =
        await Promise.all([
            Incident.findById(fromIncidentId),
            Incident.findById(toIncidentId),
        ]);

    if (!fromIncident) {
        throw ApiError.notFound(
            "Source incident not found"
        );
    }

    if (!toIncident) {
        throw ApiError.notFound(
            "Target incident not found"
        );
    }

    /**
     * User must be able to view BOTH incidents.
     */
    if (
        !permissions.canView(
            req.user,
            fromIncident
        ) ||
        !permissions.canView(
            req.user,
            toIncident
        )
    ) {
        throw ApiError.forbidden(
            "You do not have access to one or both incidents"
        );
    }

    /**
     * Only Admin and Support Agent can create links.
     */
    if (!permissions.canManageLinks(req.user)) {
        throw ApiError.forbidden(
            "Only administrators and support agents can link incidents"
        );
    }

    /**
     * --------------------------------------------------------
     * Check duplicate relationship
     * --------------------------------------------------------
     *
     * Related and Duplicate are symmetric.
     *
     * So these two are considered the SAME:
     *
     * INC-001 -> INC-002 Related
     * INC-002 -> INC-001 Related
     *
     * Caused-By is directional, so reverse is allowed.
     */
    const existingQuery =
        relationshipType === "Caused-By"
            ? {
                fromIncidentId,
                toIncidentId,
                relationshipType,
            }
            : {
                relationshipType,
                $or: [
                    {
                        fromIncidentId,
                        toIncidentId,
                    },
                    {
                        fromIncidentId:
                            toIncidentId,
                        toIncidentId:
                            fromIncidentId,
                    },
                ],
            };

    const existingLink =
        await IncidentLink.findOne(existingQuery);

    if (existingLink) {
        throw ApiError.conflict(
            "This incident link already exists"
        );
    }

    /**
     * Create link.
     */
    const link = await IncidentLink.create({
        fromIncidentId,
        toIncidentId,
        relationshipType,
        linkedBy: req.user._id,
    });

    if (relationshipType === "Child-Of") {
        await Incident.findByIdAndUpdate(toIncidentId, { $set: { isMajorIncident: true } });
    }

    /**
     * ========================================================
     * ACTIVITY LOG
     * ========================================================
     *
     * Record activity for BOTH incidents because both
     * incidents have been affected.
     */

    await activityService.record({
        incident: fromIncident._id,
        action: ACTIVITY_ACTIONS.LINKED,
        performedBy: req.user._id,
        note: `${relationshipType} with ${toIncident.incidentNumber}`,
    });

    await activityService.record({
        incident: toIncident._id,
        action: ACTIVITY_ACTIONS.LINKED,
        performedBy: req.user._id,
        note: `${relationshipType} with ${fromIncident.incidentNumber}`,
    });

    /**
     * Populate response.
     */
    const populatedLink =
        await IncidentLink.findById(link._id)
            .populate(
                "fromIncidentId",
                "incidentNumber title status priority"
            )
            .populate(
                "toIncidentId",
                "incidentNumber title status priority"
            )
            .populate(
                "linkedBy",
                "name email role"
            )
            .lean();

    return successResponse(
        res,
        201,
        "Incident linked successfully",
        {
            link: populatedLink,
        }
    );
});


/**
 * ============================================================
 * DELETE INCIDENT LINK
 * ============================================================
 *
 * DELETE /api/v1/incidents/:id/links/:linkId
 */
const deleteIncidentLink = asyncHandler(async (req, res) => {
    const {
        id: incidentId,
        linkId,
    } = req.params;

    if (!isValidId(incidentId)) {
        throw ApiError.badRequest(
            "Invalid incident ID"
        );
    }

    if (!isValidId(linkId)) {
        throw ApiError.badRequest(
            "Invalid link ID"
        );
    }

    /**
     * Only Admin and Agent can unlink.
     */
    if (!permissions.canManageLinks(req.user)) {
        throw ApiError.forbidden(
            "Only administrators and support agents can unlink incidents"
        );
    }

    const incident =
        await Incident.findById(incidentId);

    if (!incident) {
        throw ApiError.notFound(
            "Incident not found"
        );
    }

    if (
        !permissions.canView(
            req.user,
            incident
        )
    ) {
        throw ApiError.forbidden(
            "You do not have access to this incident"
        );
    }

    /**
     * Find link.
     */
    const link =
        await IncidentLink.findById(linkId);

    if (!link) {
        throw ApiError.notFound(
            "Incident link not found"
        );
    }

    /**
     * Make sure link belongs to current incident.
     */
    const belongsToIncident =
        String(link.fromIncidentId) ===
            String(incidentId) ||
        String(link.toIncidentId) ===
            String(incidentId);

    if (!belongsToIncident) {
        throw ApiError.badRequest(
            "This link does not belong to the incident"
        );
    }

    /**
     * Get other incident for activity.
     */
    const otherIncidentId =
        String(link.fromIncidentId) ===
        String(incidentId)
            ? link.toIncidentId
            : link.fromIncidentId;

    const otherIncident =
        await Incident.findById(otherIncidentId);

    /**
     * Delete relationship.
     */
    await link.deleteOne();

    /**
     * ========================================================
     * ACTIVITY LOG
     * ========================================================
     */

    if (otherIncident) {
        await activityService.record({
            incident: incident._id,
            action: ACTIVITY_ACTIONS.UNLINKED,
            performedBy: req.user._id,
            note: `${link.relationshipType} removed with ${otherIncident.incidentNumber}`,
        });

        await activityService.record({
            incident: otherIncident._id,
            action: ACTIVITY_ACTIONS.UNLINKED,
            performedBy: req.user._id,
            note: `${link.relationshipType} removed with ${incident.incidentNumber}`,
        });
    }

    return successResponse(
        res,
        200,
        "Incident link removed successfully"
    );
});



const tokenSet = (value = "") => new Set(String(value).toLowerCase().match(/[a-z0-9]{3,}/g) || []);
const similarity = (a, b) => {
    const left = tokenSet(a); const right = tokenSet(b);
    const union = new Set([...left, ...right]);
    if (!union.size) return 0;
    return [...left].filter((token) => right.has(token)).length / union.size;
};

/** GET /api/v1/incidents/:id/correlation-suggestions */
const listCorrelationSuggestions = asyncHandler(async (req, res) => {
    const incident = await Incident.findById(req.params.id);
    if (!incident) throw ApiError.notFound("Incident not found");
    if (!permissions.canView(req.user, incident)) throw ApiError.forbidden("You do not have access to this incident");

    const windowHours = Math.max(1, Number(process.env.CORRELATION_WINDOW_HOURS || 72));
    const from = new Date(incident.createdAt.getTime() - windowHours * 36e5);
    const to = new Date(incident.createdAt.getTime() + windowHours * 36e5);
    const existingLinks = await IncidentLink.find({ $or: [{ fromIncidentId: incident._id }, { toIncidentId: incident._id }] }).lean();
    const excludedIds = existingLinks.map((link) => String(link.fromIncidentId) === String(incident._id) ? link.toIncidentId : link.fromIncidentId);
    const candidates = await Incident.find({ _id: { $nin: [incident._id, ...excludedIds] }, category: incident.category, createdAt: { $gte: from, $lte: to } }).select("incidentNumber title description status priority").lean();

    for (const candidate of candidates) {
        const score = similarity(`${incident.title} ${incident.description}`, `${candidate.title} ${candidate.description}`);
        if (score >= 0.12) await IncidentCorrelationSuggestion.updateOne(
            { incidentId: incident._id, suggestedIncidentId: candidate._id },
            { $setOnInsert: { score, status: "pending" } }, { upsert: true }
        );
    }
    const suggestions = await IncidentCorrelationSuggestion.find({ incidentId: incident._id, status: "pending" })
        .populate("suggestedIncidentId", "incidentNumber title status priority").sort({ score: -1 }).lean();
    return successResponse(res, 200, "Correlation suggestions retrieved", { suggestions });
});

/** PATCH /api/v1/incidents/:id/correlation-suggestions/:suggestionId */
const reviewCorrelationSuggestion = asyncHandler(async (req, res) => {
    if (!permissions.canManageLinks(req.user)) throw ApiError.forbidden("Only administrators and support agents can review suggestions");
    const suggestion = await IncidentCorrelationSuggestion.findOne({ _id: req.params.suggestionId, incidentId: req.params.id });
    if (!suggestion || suggestion.status !== "pending") throw ApiError.notFound("Pending correlation suggestion not found");
    const incident = await Incident.findById(req.params.id);
    const suggested = await Incident.findById(suggestion.suggestedIncidentId);
    if (!incident || !suggested || !permissions.canView(req.user, incident) || !permissions.canView(req.user, suggested)) throw ApiError.forbidden("You do not have access to these incidents");
    if (req.body.action === "dismiss") {
        suggestion.status = "dismissed"; suggestion.reviewedBy = req.user._id; await suggestion.save();
        return successResponse(res, 200, "Correlation suggestion dismissed");
    }
    const relationshipType = req.body.relationshipType || "Related";
    const exists = await IncidentLink.findOne({ relationshipType, $or: [{ fromIncidentId: incident._id, toIncidentId: suggested._id }, { fromIncidentId: suggested._id, toIncidentId: incident._id }] });
    if (!exists) await IncidentLink.create({ fromIncidentId: incident._id, toIncidentId: suggested._id, relationshipType, linkedBy: req.user._id });
    suggestion.status = "accepted"; suggestion.reviewedBy = req.user._id; await suggestion.save();
    await Promise.all([incident, suggested].map((entry) => activityService.record({ incident: entry._id, action: ACTIVITY_ACTIONS.LINKED, performedBy: req.user._id, note: `Suggested ${relationshipType} correlation confirmed` })));
    return successResponse(res, 200, "Correlation suggestion confirmed");
});
module.exports = {
    listIncidentLinks,
    createIncidentLink,
    deleteIncidentLink,
    listCorrelationSuggestions,
    reviewCorrelationSuggestion,
};
