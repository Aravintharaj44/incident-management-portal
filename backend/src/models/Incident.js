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

        department: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Department",
            default: null,
            index: true,
        },

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

        // On-call acknowledgement & escalation tracking (FR4-23/FR4-24)
        acknowledgedAt: {
            type: Date,
            default: null,
            index: true,
        },
        acknowledgedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        isAcknowledged: {
            type: Boolean,
            default: false,
        },
        escalationLevel: {
            type: Number,
            default: 1,
        },
        lastEscalatedAt: {
            type: Date,
            default: null,
        },
        ackWindowMinutes: {
            type: Number,
            default: 15,
        },

        problemId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Problem",
            default: null,
            index: true,
        },

        resolutionNote: {
            type: String,
            trim: true,
            maxlength: [2000, "Resolution note cannot exceed 2000 characters"],
            default: "",
        },

        commentCount: { type: Number, default: 0 },
        attachmentCount: { type: Number, default: 0 },

        isMajorIncident: { type: Boolean, default: false, index: true },

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

incidentSchema.index({ status: 1, priority: 1, createdAt: -1 });
incidentSchema.index({ assignedTo: 1, status: 1, createdAt: -1 });
incidentSchema.index({ assignedDepartment: 1, status: 1, createdAt: -1 });
incidentSchema.index({ reportedBy: 1, createdAt: -1 });

incidentSchema.virtual("isOverdue").get(function isOverdue() {
    if (!this.dueBy) return false;
    if (TERMINAL_STATUSES.includes(this.status)) return false;
    return this.dueBy.getTime() < Date.now();
});

incidentSchema.virtual("hoursToDue").get(function hoursToDue() {
    if (!this.dueBy) return null;
    return Math.round((this.dueBy.getTime() - Date.now()) / 36e5);
});

incidentSchema.virtual("attachments", {
    ref: "Attachment",
    localField: "_id",
    foreignField: "incident",
});

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
        this.dueBy = this.constructor.calculateDueBy(this.priority, this.createdAt);
    }
});

module.exports = mongoose.model("Incident", incidentSchema);