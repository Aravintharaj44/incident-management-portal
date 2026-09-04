const IntakeLog = require('../models/IntakeLog');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const {
  successResponse,
  paginatedResponse,
} = require('../utils/apiResponse');

/**
 * GET /api/v1/intake/failures
 */
const listIntakeFailures = asyncHandler(async (req, res) => {
  const { status, source } = req.query;
  const filter = {};

  if (status) {
    filter.status = status.toLowerCase() === 'failed' ? 'Flagged' : status;
  }

  if (source) {
    filter.source = source;
  }

  const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limitNum = Math.max(1, parseInt(req.query.limit, 10) || 20);
  const skipNum = (pageNum - 1) * limitNum;

  const [items, total] = await Promise.all([
    IntakeLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skipNum)
      .limit(limitNum)
      .lean(),
    IntakeLog.countDocuments(filter),
  ]);

  return paginatedResponse(res, 'Intake failures retrieved.', items, {
    page: pageNum,
    limit: limitNum,
    total,
  });
});

/**
 * GET /api/v1/intake/failures/:id
 */
const getIntakeFailure = asyncHandler(async (req, res) => {
  const log = await IntakeLog.findById(req.params.id).lean();
  if (!log) throw new ApiError(404, 'Intake log not found.');

  return successResponse(res, 200, 'Intake failure retrieved.', log);
});

/**
 * PATCH /api/v1/intake/failures/:id/resolve
 */
const resolveIntakeFailure = asyncHandler(async (req, res) => {
  const { resolvedIncidentId } = req.body;

  const log = await IntakeLog.findById(req.params.id);
  if (!log) throw new ApiError(404, 'Intake log not found.');

  log.status = 'Resolved';
  log.resolvedIncidentId = resolvedIncidentId || null;
  log.reviewedBy = req.user ? req.user._id : null;
  log.reviewedAt = new Date();
  await log.save();

  return successResponse(res, 200, 'Intake failure marked resolved.', log);
});

/**
 * PATCH /api/v1/intake/failures/:id/dismiss
 */
const dismissIntakeFailure = asyncHandler(async (req, res) => {
  const log = await IntakeLog.findById(req.params.id);
  if (!log) throw new ApiError(404, 'Intake log not found.');

  log.status = 'Reviewed';
  log.reviewedBy = req.user ? req.user._id : null;
  log.reviewedAt = new Date();
  await log.save();

  return successResponse(res, 200, 'Intake failure dismissed.', log);
});

module.exports = {
  listIntakeFailures,
  getIntakeFailure,
  resolveIntakeFailure,
  dismissIntakeFailure,
};