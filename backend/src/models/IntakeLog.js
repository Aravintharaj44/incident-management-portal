const mongoose = require('mongoose');
const { INTAKE_SOURCE } = require('../constants');

/**
 * IntakeLog
 * FR4-20 — Intake Failure Handling
 * Records malformed or unparseable email/webhook payloads for manual review.
 */
const intakeLogSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: [
        INTAKE_SOURCE.EMAIL || 'email',
        INTAKE_SOURCE.WEBHOOK || 'webhook',
      ],
      required: true,
      index: true,
    },
    vendor: {
      type: String,
      default: 'generic',
      trim: true,
    },
    status: {
      type: String,
      // Added 'flagged' and lowercase variants to prevent validation errors across services
      enum: ['Failed', 'Reviewed', 'Resolved', 'flagged', 'failed', 'reviewed', 'resolved'],
      default: 'Failed',
      index: true,
    },
    errorReason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    rawPayload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    resolvedIncidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Incident',
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound index for optimized table filtering and pagination in UI
intakeLogSchema.index({ status: 1, createdAt: -1 });
intakeLogSchema.index({ source: 1, createdAt: -1 });

module.exports = mongoose.model('IntakeLog', intakeLogSchema);