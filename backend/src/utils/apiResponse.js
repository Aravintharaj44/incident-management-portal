/**
 * Every endpoint answers with the same envelope:
 *   { success, message, data }        on success
 *   { success, message, errors }      on failure
 *
 * The frontend relies on this shape, so it is defined in exactly one place.
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
const paginatedResponse = (res, message, items, { page, limit, total }) => {
    return res.status(200).json({
        success: true,
        message,
        data: {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
                hasNextPage: page * limit < total,
                hasPrevPage: page > 1,
            },
        },
    });
};

module.exports = { successResponse, errorResponse, paginatedResponse };
