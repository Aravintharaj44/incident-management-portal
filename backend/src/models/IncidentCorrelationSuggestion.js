const mongoose = require("mongoose");

const incidentCorrelationSuggestionSchema = new mongoose.Schema({
    incidentId: { type: mongoose.Schema.Types.ObjectId, ref: "Incident", required: true, index: true },
    suggestedIncidentId: { type: mongoose.Schema.Types.ObjectId, ref: "Incident", required: true },
    score: { type: Number, required: true },
    status: { type: String, enum: ["pending", "accepted", "dismissed"], default: "pending", index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

incidentCorrelationSuggestionSchema.index({ incidentId: 1, suggestedIncidentId: 1 }, { unique: true });
module.exports = mongoose.model("IncidentCorrelationSuggestion", incidentCorrelationSuggestionSchema);