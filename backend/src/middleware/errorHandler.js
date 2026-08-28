const multer = require("multer");
const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");
const { env } = require("../config/env");

/** Catches any request that did not match a route. */
const notFound = (req, _res, next) => {
    next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

/**
 * Translates a driver/library specific error into an ApiError so the client
 * always receives the same response shape with a meaningful status code.
 */
const normalizeError = (error) => {
    if (error instanceof ApiError) return error;

    // Mongoose schema validation
    if (error.name === "ValidationError") {
        const errors = Object.values(error.errors).map((item) => ({
            field: item.path,
            message: item.message,
        }));
        return ApiError.unprocessable("Validation failed", errors);
    }

    // Malformed ObjectId in a path parameter or filter
    if (error.name === "CastError") {
        return ApiError.badRequest(`Invalid value for '${error.path}'`);
    }

    // Unique index violation
    if (error.code === 11000) {
        const field = Object.keys(error.keyValue || {})[0] || "value";
        return ApiError.conflict(`That ${field} is already in use`);
    }

    if (error instanceof multer.MulterError) {
        const message =
            error.code === "LIMIT_FILE_SIZE"
                ? `File is too large (maximum ${env.upload.maxFileSizeMb} MB)`
                : error.code === "LIMIT_FILE_COUNT"
                  ? "Too many files in one upload"
                  : `Upload failed: ${error.message}`;
        return ApiError.badRequest(message);
    }

    // Body parser received malformed JSON
    if (error.type === "entity.parse.failed") {
        return ApiError.badRequest("Request body is not valid JSON");
    }

    return null;
};

/**
 * Centralized error handler - the single place that formats an error response
 * (BRD s17: "one centralized error-handling middleware ... consistent error
 * response shapes").
 */
// eslint-disable-next-line no-unused-vars -- Express identifies this by arity
const errorHandler = (error, req, res, _next) => {
    const normalized = normalizeError(error);

    const statusCode = normalized ? normalized.statusCode : 500;
    const message = normalized
        ? normalized.message
        : "Something went wrong on our side. Please try again.";

    // 5xx means we did not anticipate it: log the stack. 4xx is the client's
    // problem and only worth a debug line.
    if (statusCode >= 500) {
        logger.error(`${req.method} ${req.originalUrl} -> ${statusCode}: ${error.message}`, error.stack);
    } else {
        logger.debug(`${req.method} ${req.originalUrl} -> ${statusCode}: ${message}`);
    }

    const body = {
        success: false,
        message,
        errors: normalized ? normalized.errors : null,
    };

    // Raw stacks are a development aid only - never expose them in production.
    if (!env.isProduction && statusCode >= 500) {
        body.stack = error.stack;
    }

    res.status(statusCode).json(body);
};

module.exports = { errorHandler, notFound };
