const mongoose = require("mongoose");
const Counter = require("./Counter");
const {
    STATUS,
    STATUS_VALUES,
    PRIORITY,
    PRIORITY_VALUES,
    TERMINAL_STATUSES,
    SLA_HOURS,
    PRIORITY_WEIGHT,
    INTAKE_SOURCE,          // <-- add this
    INTAKE_SOURCE_VALUES
} = require("../constants");

const incidentSchema = new mongoose.Schema(
    {
        // Human-readable reference shown in the UI and in emails.
        incidentNumber: {
            type: String,
            unique: true,
            index: true,
        },

        title: {
            type: String,
            required: [true, "Title is required"],
            trim: true,
            minlength: [5, "Title must be at least 5 characters"],
            maxlength: [140, "Title cannot exceed 140 characters"],
        },

        description: {
            type: String,
            required: [true, "Description is required"],
            trim: true,
            minlength: [10, "Description must be at least 10 characters"],
            maxlength: [5000, "Description cannot exceed 5000 characters"],
        },

        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            required: [true, "Category is required"],
            index: true,
        },

        priority: {
            type: String,
            enum: PRIORITY_VALUES,
            default: PRIORITY.MEDIUM,
            index: true,
        },

        // Numeric mirror of `priority` so the list screen can sort by severity.
        // Sorting on the enum string alone would order it alphabetically
        // (critical, high, low, medium) rather than by how urgent it is.
        priorityWeight: {
            type: Number,
            default: 2,
            index: true,
        },

        status: {
            type: String,
            enum: STATUS_VALUES,
            default: STATUS.NEW,
            index: true,
        },

        reportedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        assignedDepartment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Department",
            default: null,
            index: true,
        },    
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true,
        },

        // Set during triage; only active members can receive incidents for it.
        department: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Department",
            default: null,
            index: true,
        },

        // Derived from priority via the SLA table; recomputed when priority changes.
        dueBy: {
            type: Date,
            default: null,
            index: true,
        },
        overdueNotifiedAt: {
            type: Date,
            default: null,
            index: true,
        },
        resolvedAt: { type: Date, default: null },
        closedAt: { type: Date, default: null },

        // Optional reference to the Problem this incident belongs to (FR4-04).
        // Nullable so existing incidents continue to work untouched.
        problemId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Problem",
            default: null,
            index: true,
        },

        // Free-text resolution note captured when moving to Resolved.
        resolutionNote: {
            type: String,
            trim: true,
            maxlength: [2000, "Resolution note cannot exceed 2000 characters"],
            default: "",
        },

        commentCount: { type: Number, default: 0 },
        attachmentCount: { type: Number, default: 0 },

        // A major incident is inferred from its Child-Of links; this flag is a display override.
        isMajorIncident: { type: Boolean, default: false, index: true },
                // --- FR4-19 Source Tagging / FR4-18 Deduplication (Section 12) ---
        intakeSource: {
            type: String,
            enum: ['Manual', 'Email', 'Webhook'],
            default: 'Manual',
            index: true,
        },
        dedupeKey: {
            type: String,
            default: null,
            index: true,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

/**
 * Compound indexes matching the list screen's most common query shapes
 * (status + priority filters, and "my queue" sorted newest first), so the
 * 2-second page-load target holds as the collection grows.
 */
incidentSchema.index({ status: 1, priority: 1, createdAt: -1 });
incidentSchema.index({ assignedTo: 1, status: 1, createdAt: -1 });
incidentSchema.index({ assignedDepartment: 1, status: 1, createdAt: -1 });
incidentSchema.index({ reportedBy: 1, createdAt: -1 });

/** True when an unresolved incident has passed its SLA target (FR-14). */
incidentSchema.virtual("isOverdue").get(function isOverdue() {
    if (!this.dueBy) return false;
    if (TERMINAL_STATUSES.includes(this.status)) return false;
    return this.dueBy.getTime() < Date.now();
});

/** Whole hours remaining against the SLA; negative once breached. */
incidentSchema.virtual("hoursToDue").get(function hoursToDue() {
    if (!this.dueBy) return null;
    return Math.round((this.dueBy.getTime() - Date.now()) / 36e5);
});

incidentSchema.virtual("attachments", {
    ref: "Attachment",
    localField: "_id",
    foreignField: "incident",
});

/** Computes the SLA deadline for a priority, measured from `from`. */
incidentSchema.statics.calculateDueBy = function calculateDueBy(
    priority,
    from = new Date()
) {
    const hours = SLA_HOURS[priority] ?? SLA_HOURS[PRIORITY.MEDIUM];
    return new Date(from.getTime() + hours * 60 * 60 * 1000);
};

incidentSchema.pre("save", async function assignNumberAndDueDate() {
    if (this.isNew || this.isModified("priority")) {
        this.priorityWeight =
            PRIORITY_WEIGHT[this.priority] || PRIORITY_WEIGHT[PRIORITY.MEDIUM];
    }

    if (this.isNew) {
        if (!this.incidentNumber) {
            const seq = await Counter.next("incident");
            this.incidentNumber = `INC-${String(seq).padStart(6, "0")}`;
        }

        if (!this.dueBy) {
            this.dueBy = this.constructor.calculateDueBy(this.priority, this.createdAt);
        }
    } else if (this.isModified("priority")) {
        // Re-baseline the SLA from when the incident was raised, not from now,
        // so re-prioritising cannot be used to hide an already-breached SLA.
        this.dueBy = this.constructor.calculateDueBy(this.priority, this.createdAt);
    }
});

module.exports = mongoose.model("Incident", incidentSchema);
