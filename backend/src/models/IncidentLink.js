const mongoose = require("mongoose");

const RELATIONSHIP_TYPES = [
    "Related",
    "Duplicate",
    "Caused-By",
];

const incidentLinkSchema = new mongoose.Schema(
    {
        /**
         * Incident from which the relationship was created.
         *
         * Related / Duplicate:
         * Direction is not semantically important.
         *
         * Caused-By:
         * Direction IS important.
         *
         * Example:
         * INC-002 Caused-By INC-001
         *
         * fromIncidentId = INC-002
         * toIncidentId   = INC-001
         */
        fromIncidentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Incident",
            required: [true, "Source incident is required"],
        },

        /**
         * Incident being linked.
         */
        toIncidentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Incident",
            required: [true, "Target incident is required"],
        },

        /**
         * Relationship between incidents.
         */
        relationshipType: {
            type: String,
            enum: {
                values: RELATIONSHIP_TYPES,
                message:
                    "Relationship type must be Related, Duplicate, or Caused-By",
            },
            required: [true, "Relationship type is required"],
        },

        /**
         * User who created the relationship.
         */
        linkedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Linked by user is required"],
        },
    },
    {
        timestamps: true,
    }
);

incidentLinkSchema.index({
    fromIncidentId: 1,
});

incidentLinkSchema.index({
    toIncidentId: 1,
});

incidentLinkSchema.index(
    {
        fromIncidentId: 1,
        toIncidentId: 1,
        relationshipType: 1,
    },
    {
        unique: true,
    }
);

/**
 * Prevent an incident from linking to itself.
 */
incidentLinkSchema.pre("validate", function () {
    if (
        this.fromIncidentId &&
        this.toIncidentId &&
        this.fromIncidentId.equals(this.toIncidentId)
    ) {
        throw new Error("An incident cannot be linked to itself");
    }
});

module.exports = mongoose.model(
    "IncidentLink",
    incidentLinkSchema
);

module.exports.RELATIONSHIP_TYPES = RELATIONSHIP_TYPES;

