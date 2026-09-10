/**
 * Every endpoint answers with the same envelope:
 *   { success, message, data }        on success
 *   { success, message, errors }      on failure
 */

const successResponse = (res, statusCode, message, data = null, extra = {}) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    ...extra,
  });
};

const errorResponse = (res, statusCode, message, errors = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
};

/** Success envelope for paginated list endpoints. */
const paginatedResponse = (res, message, items = [], { page = 1, limit = 20, total = 0 } = {}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 20);
  const totalNum = Math.max(0, parseInt(total, 10) || 0);

  return res.status(200).json({
    success: true,
    message,
    data: {
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalNum,
        totalPages: limitNum > 0 ? Math.ceil(totalNum / limitNum) : 0,
        hasNextPage: pageNum * limitNum < totalNum,
        hasPrevPage: pageNum > 1,
      },
    },
  });
};

// Backward compatibility alias in case legacy code imports apiResponse
const apiResponse = (res, statusCode, data, message = '') => {
  return successResponse(res, statusCode, message, data);
};

module.exports = { 
  successResponse, 
  errorResponse, 
  paginatedResponse,
  apiResponse 
};