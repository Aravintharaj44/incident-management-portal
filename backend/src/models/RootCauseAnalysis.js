const mongoose = require("mongoose");

const RCA_STATUSES = ["draft", "in_review", "approved", "returned"];
const RCA_CATEGORIES = ["people", "process", "technology", "vendor", "security", "other"];

const rootCauseAnalysisSchema = new mongoose.Schema({
    // Multi-anchor (FR4-06): an RCA belongs to exactly one Incident OR one
    // Problem. Exactly one field is set; the other stays undefined so the
    // sparse unique index ignores it (explicit null would collide).
    incident: { type: mongoose.Schema.Types.ObjectId, ref: "Incident" },
    problem: { type: mongoose.Schema.Types.ObjectId, ref: "Problem" },
    rootCauseCategory: { type: String, enum: RCA_CATEGORIES, required: true },
    rootCauseDescription: { type: String, trim: true, maxlength: 5000, required: true },
    why1: { type: String, trim: true, maxlength: 1000, default: "" },
    why2: { type: String, trim: true, maxlength: 1000, default: "" },
    why3: { type: String, trim: true, maxlength: 1000, default: "" },
    why4: { type: String, trim: true, maxlength: 1000, default: "" },
    why5: { type: String, trim: true, maxlength: 1000, default: "" },
    contributingFactors: { type: String, trim: true, maxlength: 5000, default: "" },
    correctiveActions: { type: String, trim: true, maxlength: 5000, default: "" },
    preventiveActions: { type: String, trim: true, maxlength: 5000, default: "" },
    status: { type: String, enum: RCA_STATUSES, default: "draft", index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewComment: { type: String, trim: true, maxlength: 2000, default: "" },
}, { timestamps: true });

// Each anchor stays unique-but-nullable (sparse) so a Problem and an Incident
// can each have at most one RCA without colliding with each other.
rootCauseAnalysisSchema.index(
    { incident: 1 },
    { unique: true, sparse: true }
);
rootCauseAnalysisSchema.index(
    { problem: 1 },
    { unique: true, sparse: true }
);

module.exports = mongoose.model("RootCauseAnalysis", rootCauseAnalysisSchema);
module.exports.RCA_STATUSES = RCA_STATUSES;
module.exports.RCA_CATEGORIES = RCA_CATEGORIES;