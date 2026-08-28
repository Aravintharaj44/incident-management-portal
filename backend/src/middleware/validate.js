const { validationResult } = require("express-validator");
const ApiError = require("../utils/ApiError");

/**
 * Runs after a chain of express-validator rules and converts any failures into
 * a 422 with a field-by-field breakdown the frontend form can display inline.
 *
 * Every write endpoint validates here, regardless of what the React form
 * already checked - client-side validation is a UX feature, not a control.
 */
const validate = (req, _res, next) => {
    const result = validationResult(req);

    if (result.isEmpty()) return next();

    const errors = result.array().map((error) => ({
        field: error.path || error.param,
        message: error.msg,
    }));

    return next(ApiError.unprocessable("Please correct the highlighted fields", errors));
};

module.exports = validate;
