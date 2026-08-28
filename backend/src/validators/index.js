const { body, param, query } = require("express-validator");
const {
    ROLE_VALUES,
    STATUS_VALUES,
    PRIORITY_VALUES,
} = require("../constants");

/**
 * Request validation rules (BRD s17: "Validate all inputs on the backend, even
 * if the frontend also validates").
 *
 * Rules live here rather than in the controllers so a route's contract can be
 * read in one place, and so the same rule can be reused across endpoints.
 */

/**
 * Strips angle brackets from short, display-only fields.
 *
 * Note this is defence in depth, not the primary XSS control: values are
 * stored raw and escaped at render time (React escapes all interpolated text),
 * which is why free-text fields like an incident description are deliberately
 * left untouched - they legitimately contain characters like "<".
 */
const stripTags = (value) =>
    typeof value === "string" ? value.replace(/[<>]/g, "") : value;

const objectId = (field, location = param) =>
    location(field).isMongoId().withMessage("Not a valid id");

const password = (field = "password") =>
    body(field)
        .isString()
        .isLength({ min: 6, max: 72 })
        .withMessage("Password must be between 6 and 72 characters")
        // bcrypt silently truncates beyond 72 bytes, so the upper bound is a
        // real constraint rather than an arbitrary one.
        .matches(/[A-Za-z]/)
        .withMessage("Password must contain at least one letter")
        .matches(/[0-9]/)
        .withMessage("Password must contain at least one number");

const authValidators = {
    register: [
        body("name")
            .trim()
            .isLength({ min: 2, max: 80 })
            .withMessage("Name must be between 2 and 80 characters")
            .customSanitizer(stripTags),
        body("email")
            .trim()
            .isEmail()
            .withMessage("Please provide a valid email address")
            .normalizeEmail({ gmail_remove_dots: false }),
        password(),
    ],

    login: [
        body("email").trim().isEmail().withMessage("Please provide a valid email address"),
        body("password").notEmpty().withMessage("Password is required"),
    ],

    updateProfile: [
        body("name")
            .trim()
            .isLength({ min: 2, max: 80 })
            .withMessage("Name must be between 2 and 80 characters")
            .customSanitizer(stripTags),
    ],

    changePassword: [
        body("currentPassword").notEmpty().withMessage("Your current password is required"),
        password("newPassword"),
    ],
};

const userValidators = {
    create: [
        body("name")
            .trim()
            .isLength({ min: 2, max: 80 })
            .withMessage("Name must be between 2 and 80 characters")
            .customSanitizer(stripTags),
        body("email")
            .trim()
            .isEmail()
            .withMessage("Please provide a valid email address")
            .normalizeEmail({ gmail_remove_dots: false }),
        password(),
        body("role")
            .optional()
            .isIn(ROLE_VALUES)
            .withMessage(`Role must be one of: ${ROLE_VALUES.join(", ")}`),
    ],

    update: [
        objectId("id"),
        body("name")
            .optional()
            .trim()
            .isLength({ min: 2, max: 80 })
            .withMessage("Name must be between 2 and 80 characters")
            .customSanitizer(stripTags),
        body("role")
            .optional()
            .isIn(ROLE_VALUES)
            .withMessage(`Role must be one of: ${ROLE_VALUES.join(", ")}`),
        body("isActive").optional().isBoolean().withMessage("isActive must be true or false"),
    ],

    resetPassword: [objectId("id"), password("newPassword")],

    byId: [objectId("id")],
};

const categoryValidators = {
    create: [
        body("name")
            .trim()
            .isLength({ min: 2, max: 60 })
            .withMessage("Category name must be between 2 and 60 characters")
            .customSanitizer(stripTags),
        body("description")
            .optional()
            .trim()
            .isLength({ max: 200 })
            .withMessage("Description cannot exceed 200 characters")
            .customSanitizer(stripTags),
    ],

    update: [
        objectId("id"),
        body("name")
            .optional()
            .trim()
            .isLength({ min: 2, max: 60 })
            .withMessage("Category name must be between 2 and 60 characters")
            .customSanitizer(stripTags),
        body("description")
            .optional()
            .trim()
            .isLength({ max: 200 })
            .withMessage("Description cannot exceed 200 characters")
            .customSanitizer(stripTags),
        body("isActive").optional().isBoolean().withMessage("isActive must be true or false"),
    ],

    byId: [objectId("id")],
};

const incidentValidators = {
    create: [
        body("title")
            .trim()
            .isLength({ min: 5, max: 140 })
            .withMessage("Title must be between 5 and 140 characters"),
        body("description")
            .trim()
            .isLength({ min: 10, max: 5000 })
            .withMessage("Description must be between 10 and 5000 characters"),
        body("category").isMongoId().withMessage("Please select a category"),
        body("priority")
            .optional()
            .isIn(PRIORITY_VALUES)
            .withMessage(`Priority must be one of: ${PRIORITY_VALUES.join(", ")}`),
    ],

    update: [
        objectId("id"),
        body("title")
            .optional()
            .trim()
            .isLength({ min: 5, max: 140 })
            .withMessage("Title must be between 5 and 140 characters"),
        body("description")
            .optional()
            .trim()
            .isLength({ min: 10, max: 5000 })
            .withMessage("Description must be between 10 and 5000 characters"),
        body("category").optional().isMongoId().withMessage("Please select a valid category"),
        body("priority")
            .optional()
            .isIn(PRIORITY_VALUES)
            .withMessage(`Priority must be one of: ${PRIORITY_VALUES.join(", ")}`),
    ],

    updateStatus: [
        objectId("id"),
        body("status")
            .isIn(STATUS_VALUES)
            .withMessage(`Status must be one of: ${STATUS_VALUES.join(", ")}`),
        body("resolutionNote")
            .optional()
            .trim()
            .isLength({ max: 2000 })
            .withMessage("Resolution note cannot exceed 2000 characters"),
    ],

    assign: [
        objectId("id"),
        // null is a valid value here - it returns the incident to the queue.
        body("assignedTo")
            .optional({ nullable: true })
            .custom((value) => value === null || /^[a-f\d]{24}$/i.test(String(value)))
            .withMessage("Please select a valid user to assign to"),
    ],

    byId: [objectId("id")],

    list: [
        query("page").optional().isInt({ min: 1 }).withMessage("Page must be 1 or more"),
        query("limit")
            .optional()
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
};

const commentValidators = {
    create: [
        param("incidentId").isMongoId().withMessage("Not a valid incident id"),
        body("message")
            .trim()
            .isLength({ min: 1, max: 2000 })
            .withMessage("Comment must be between 1 and 2000 characters"),
        body("isInternal").optional().isBoolean().withMessage("isInternal must be a boolean"),
    ],

    update: [
        objectId("id"),
        body("message")
            .trim()
            .isLength({ min: 1, max: 2000 })
            .withMessage("Comment must be between 1 and 2000 characters"),
    ],

    byIncidentId: [param("incidentId").isMongoId().withMessage("Not a valid incident id")],

    byId: [objectId("id")],
};

//linked incident 
const incidentLinkValidator = {
    create: [
        param("id")
            .isMongoId()
            .withMessage("Invalid incident ID"),

        body("toIncidentId")
            .isMongoId()
            .withMessage("Invalid target incident ID"),

        body("relationshipType")
            .isIn([
                "Related",
                "Duplicate",
                "Caused-By",
            ])
            .withMessage(
                "Relationship type must be Related, Duplicate, or Caused-By"
            ),
    ],

    byIncidentId: [
        param("id")
            .isMongoId()
            .withMessage("Invalid incident ID"),
    ],

    remove: [
        param("id")
            .isMongoId()
            .withMessage("Invalid incident ID"),

        param("linkId")
            .isMongoId()
            .withMessage("Invalid link ID"),
    ]
}
module.exports = {
    authValidators,
    userValidators,
    categoryValidators,
    incidentValidators,
    commentValidators,
    objectId,
    incidentLinkValidator
};
