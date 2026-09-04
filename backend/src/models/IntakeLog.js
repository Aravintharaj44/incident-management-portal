const mongoose = require('mongoose');
const { INTAKE_SOURCE } = require('../constants');

/**
 * IntakeLog
 * FR4-20 — Intake Failure Handling
 * Records every malformed/unparseable email or webhook payload so it can be
 * reviewed manually instead of being silently dropped or blindly accepted.
 */
const intakeLogSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      // Only 'email' / 'webhook' can ever fail intake — 'manual' incidents
      // are created directly through the UI, never through this pipeline.
      enum: [INTAKE_SOURCE.EMAIL, INTAKE_SOURCE.WEBHOOK],
      required: true,
    },
    vendor: {
      // e.g. 'datadog' | 'alertmanager' | 'generic' | null for email
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['Failed', 'Reviewed', 'Resolved'],
      default: 'Failed',
    },
    errorReason: {
      type: String,
      required: true,
    },
    // Raw payload kept as-is (string for email, object for webhook JSON)
    rawPayload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    // Set once an admin resolves it, optionally linking the incident that
    // was eventually created manually from this failed intake.
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

intakeLogSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('IntakeLog', intakeLogSchema);
