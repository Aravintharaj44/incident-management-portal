/**
 * Error type carrying an HTTP status code.
 *
 * Controllers throw these; the centralized error handler turns them into a
 * consistent JSON response. Anything thrown that is *not* an ApiError is
 * treated as an unexpected 500 and its details are hidden from the client.
 */
class ApiError extends Error {
    constructor(statusCode, message, errors = null) {
        super(message);
        this.statusCode = statusCode;
        this.errors = errors;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }

    static badRequest(message = "Bad request", errors = null) {
        return new ApiError(400, message, errors);
    }

    static unauthorized(message = "Authentication required") {
        return new ApiError(401, message);
    }

    static forbidden(message = "You do not have permission to perform this action") {
        return new ApiError(403, message);
    }

    static notFound(message = "Resource not found") {
        return new ApiError(404, message);
    }

    static conflict(message = "Resource already exists") {
        return new ApiError(409, message);
    }

    static unprocessable(message = "Request could not be processed", errors = null) {
        return new ApiError(422, message, errors);
    }
}

module.exports = ApiError;
