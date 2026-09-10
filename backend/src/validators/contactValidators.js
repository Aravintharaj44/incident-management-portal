const { body, param, query } = require("express-validator");

/**
 * FR5-04 - validation rules for the Contacts API (/api/v1/contacts).
 *
 * Mirror the ticket/incident conventions: whitelist only the supported contact
 * fields. Password, role, lastLoginAt and any unknown field are deliberately
 * not accepted, so a crafted body cannot escalate privileges or touch internal
 * authentication state through /contacts.
 */

const stripTags = (value) =>
    typeof value === "string" ? value.replace(/[<>]/g, "") : value;

const nameRules = (isOptional) => {
    const chain = isOptional ? body("name").optional() : body("name");
    return chain
        .trim()
        .isLength({ min: 2, max: 80 })
        .withMessage("Name must be between 2 and 80 characters")
        .customSanitizer(stripTags);
};

const emailRules = (isOptional) => {
    const chain = isOptional ? body("email").optional() : body("email");
    return chain
        .trim()
        .isEmail()
        .withMessage("Please provide a valid email address")
        .normalizeEmail({ gmail_remove_dots: false });
};

const objectIdParam = (field = "id") =>
    param(field).isMongoId().withMessage("Not a valid id");

const contactValidators = {
    list: [
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
        query("search")
            .optional()
            .trim()
            .isLength({ max: 140 })
            .withMessage("Search term is too long"),
        query("sortOrder")
            .optional()
            .isIn(["asc", "desc"])
            .withMessage("sortOrder must be 'asc' or 'desc'"),
    ],

    byId: [objectIdParam("id")],

    create: [
        nameRules(false),
        emailRules(false),
        body("isActive").optional().isBoolean().withMessage("isActive must be true or false"),
    ],

    /**
     * PUT is a full replacement of the supported contact fields; each supported
     * field may be omitted here so the controller can enforce its own 400 when
     * a required one is missing (mirrors the ticket PUT behaviour).
     */
    update: [
        objectIdParam("id"),
        nameRules(true),
        emailRules(true),
        body("isActive").optional().isBoolean().withMessage("isActive must be true or false"),
    ],
};

module.exports = { contactValidators };