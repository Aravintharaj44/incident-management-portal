const { param, query } = require("express-validator");

/**
 * FR5-07 - validation rules for the public Knowledge Base Articles API
 * (/api/v1/articles).
 *
 * Only read-safe parameters are accepted. `status` is deliberately NOT a
 * public query parameter: the public surface always returns published
 * articles, so a caller cannot use `?status=draft` to bypass visibility.
 */
const articleValidators = {
    list: [
        query("search")
            .optional()
            .trim()
            .isLength({ max: 140 })
            .withMessage("Search term is too long"),
        query("categoryId")
            .optional()
            .isMongoId()
            .withMessage("categoryId must be a valid Mongo ObjectId"),
        query("from")
            .optional()
            .not().isArray()
            .withMessage("from must be provided at most once")
            .isInt({ min: 0 })
            .withMessage("from must be 0 or more"),
        query("limit")
            .optional()
            .not().isArray()
            .withMessage("limit must be provided at most once")
            .isInt({ min: 1, max: 100 })
            .withMessage("Limit must be between 1 and 100"),
        query("sortOrder")
            .optional()
            .isIn(["asc", "desc"])
            .withMessage("sortOrder must be 'asc' or 'desc'"),
    ],

    byId: [
        param("id").isMongoId().withMessage("Not a valid id"),
    ],
};

module.exports = { articleValidators };