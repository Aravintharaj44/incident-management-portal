const { query, param, validationResult } = require("express-validator");

/** Common error validation middleware */
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: "Validation Error",
            errors: errors.array().map((err) => ({
                field: err.path,
                message: err.msg,
            })),
        });
    }
    next();
};

const listTeamsValidator = [
    query("page")
        .optional()
        .isInt({ min: 1 })
        .withMessage("Page must be an integer greater than or equal to 1")
        .toInt(),
    query("limit")
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage("Limit must be an integer between 1 and 100")
        .toInt(),
    query("isActive")
        .optional()
        .isBoolean()
        .withMessage("isActive must be a boolean string (true or false)")
        .toBoolean(),
    query("search")
        .optional()
        .isString()
        .trim()
        .isLength({ max: 100 })
        .withMessage("Search string cannot exceed 100 characters"),
    validate,
];

const getTeamByIdValidator = [
    param("team_id")
        .isMongoId()
        .withMessage("Invalid team ID format"),
    validate,
];

module.exports = {
    listTeamsValidator,
    getTeamByIdValidator,
};