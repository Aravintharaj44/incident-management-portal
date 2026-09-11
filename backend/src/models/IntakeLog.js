const mongoose = require('mongoose');
const { INTAKE_SOURCE } = require('../constants');

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
      // 'Processed'  — incident created/merged successfully
      // 'Duplicate'  — same Message-ID already handled in a prior poll
      // 'Skipped'    — valid email, but no recipient matched a registered User
      // 'Failed'     — parse/validation error; eligible for retry
      // 'Reviewed'   — operator has reviewed a failure
      // 'Resolved'   — operator has resolved a failure
      enum: [
        'Failed', 'Reviewed', 'Resolved',
        'Processed', 'Duplicate', 'Skipped',
      ],
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

    // --- FR4-16 fix: email identity, for dedup + audit ---
    messageId: {
      type: String,
      trim: true,
      default: null,
      index: true,
      sparse: true,
    },
    fromAddress: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    toAddresses: {
      type: [String],
      default: [],
    },
    subject: {
      type: String,
      trim: true,
      default: null,
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

intakeLogSchema.index({ status: 1, createdAt: -1 });
intakeLogSchema.index({ source: 1, createdAt: -1 });
// Dedup lookup: "has this Message-ID already been handled by this source?"
intakeLogSchema.index({ source: 1, messageId: 1 });

module.exports = mongoose.model('IntakeLog', intakeLogSchema);