const { body, param, query } = require("express-validator");
const {
    ROLE_VALUES,
    STATUS_VALUES,
    PRIORITY_VALUES,
    PROBLEM_STATUS_VALUES,
    ACTION_ITEM_STATUS_VALUES,
    KBA_STATUS_VALUE,
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

const departmentValidators = {
    create: [
        body("title").trim().isLength({ min: 5, max: 140 }).withMessage("Title must be between 5 and 140 characters").customSanitizer(stripTags),
        body("description").trim().isLength({ min: 10, max: 5000 }).withMessage("Description must be between 10 and 5000 characters"),
        body("isActive").optional().isBoolean().withMessage("isActive must be true or false"),
        body("headOfDepartment").isMongoId().withMessage("Please select a valid head of department"),
        body("categories").isArray({ min: 1 }).withMessage("Select at least one category"),
        body("categories.*").isMongoId().withMessage("Each category must be a valid id"),
        body("members").isArray({ min: 1 }).withMessage("Select at least one member"),
        body("members.*").isMongoId().withMessage("Each member must be a valid id"),
    ],
    update: [
        objectId("id"),
        body("title").optional().trim().isLength({ min: 5, max: 140 }).withMessage("Title must be between 5 and 140 characters").customSanitizer(stripTags),
        body("description").optional().trim().isLength({ min: 10, max: 5000 }).withMessage("Description must be between 10 and 5000 characters"),
        body("isActive").optional().isBoolean().withMessage("isActive must be true or false"),
        body("headOfDepartment").optional().isMongoId().withMessage("Please select a valid head of department"),
        body("categories").optional().isArray({ min: 1 }).withMessage("Select at least one category"),
        body("categories.*").optional().isMongoId().withMessage("Each category must be a valid id"),
        body("members").optional().isArray({ min: 1 }).withMessage("Select at least one member"),
        body("members.*").optional().isMongoId().withMessage("Each member must be a valid id"),
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
        body("updateLinkedChildren").optional().isBoolean().withMessage("updateLinkedChildren must be a boolean"),
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
        body("department")
            .optional({ nullable: true })
            .custom((value) => value === null || /^[a-f\d]{24}$/i.test(String(value)))
            .withMessage("Please select a valid department"),
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

    linkProblem: [
        objectId("id"),
        body("problemId").isMongoId().withMessage("Please select a valid problem"),
    ],
};


const rcaValidators = {
    save: [
        param("id").isMongoId().withMessage("Invalid incident ID"),
        body("rootCauseCategory").optional().isIn(["people", "process", "technology", "vendor", "security", "other"]),
        body("rootCauseDescription").optional().trim().isLength({ max: 5000 }),
        body("correctiveActions").optional().trim().isLength({ max: 5000 }),
        body("preventiveActions").optional().trim().isLength({ max: 5000 }),
    ],
    byIncident: [param("id").isMongoId().withMessage("Invalid incident ID")],
    review: [param("id").isMongoId().withMessage("Invalid incident ID"), body("status").isIn(["approved", "returned"]), body("reviewComment").optional().trim().isLength({ max: 2000 })],
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
                "Child-Of",
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


    reviewSuggestion: [
        param("id").isMongoId().withMessage("Invalid incident ID"),
        param("suggestionId").isMongoId().withMessage("Invalid suggestion ID"),
        body("action").isIn(["confirm", "dismiss"]).withMessage("Action must be confirm or dismiss"),
        body("relationshipType").optional().isIn(["Related", "Duplicate", "Caused-By"]).withMessage("Invalid relationship type"),
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

// V4 - Problem Management (FR4)
const problemValidators = {
    create: [
        body("title")
            .trim()
            .isLength({ min: 5, max: 140 })
            .withMessage("Title must be between 5 and 140 characters"),
        body("description")
            .trim()
            .isLength({ min: 10, max: 5000 })
            .withMessage("Description must be between 10 and 5000 characters"),
        body("ownerId")
            .optional({ nullable: true })
            .custom((value) => value === null || /^[a-f\d]{24}$/i.test(String(value)))
            .withMessage("Please select a valid owner"),
        body("workaround")
            .optional()
            .trim()
            .isLength({ max: 3000 })
            .withMessage("Workaround cannot exceed 3000 characters"),
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
        body("workaround")
            .optional()
            .trim()
            .isLength({ max: 3000 })
            .withMessage("Workaround cannot exceed 3000 characters"),
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
        query("status")
            .optional()
            .custom((value) => {
                const values = String(value).split(",");
                if (values.length > 1) return true;
                return PROBLEM_STATUS_VALUES.includes(String(value));
            })
            .withMessage(`Status must be one of: ${PROBLEM_STATUS_VALUES.join(", ")}`),
    ],

    updateStatus: [
        objectId("id"),
        body("status")
            .isIn(PROBLEM_STATUS_VALUES)
            .withMessage(`Status must be one of: ${PROBLEM_STATUS_VALUES.join(", ")}`),
    ],

    updateOwner: [
        objectId("id"),
        body("ownerId")
            .isMongoId()
            .withMessage("Please select a valid owner"),
    ],

    linkIncident: [
        objectId("id"),
        body("incidentId")
            .isMongoId()
            .withMessage("Please select a valid incident"),
    ],

    suggest: [param("incidentId").isMongoId().withMessage("Invalid incident ID")],
};

const knownErrorValidators = {
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
    ],

    byId: [objectId("id")],
};

const problemRcaValidators = {
    save: [
        param("id").isMongoId().withMessage("Invalid problem ID"),
        body("rootCauseCategory").optional().isIn(["people", "process", "technology", "vendor", "security", "other"]),
        body("rootCauseDescription").optional().trim().isLength({ max: 5000 }),
        body("correctiveActions").optional().trim().isLength({ max: 5000 }),
        body("preventiveActions").optional().trim().isLength({ max: 5000 }),
    ],
    byProblem: [param("id").isMongoId().withMessage("Invalid problem ID")],
    review: [param("id").isMongoId().withMessage("Invalid problem ID"), body("status").isIn(["approved", "returned"]), body("reviewComment").optional().trim().isLength({ max: 2000 })],
};

// V4 - RCA Action Items (FR4-07..10)
const actionItemValidators = {
    create: [
        body("rcaId").isMongoId().withMessage("Please select a valid RCA"),
        body("description")
            .trim()
            .isLength({ min: 10, max: 5000 })
            .withMessage("Description must be between 10 and 5000 characters"),
        body("ownerId").isMongoId().withMessage("Please select a valid owner"),
        body("dueDate")
            .isISO8601()
            .withMessage("Please provide a valid due date"),
    ],

    update: [
        objectId("id"),
        body("description")
            .optional()
            .trim()
            .isLength({ min: 10, max: 5000 })
            .withMessage("Description must be between 10 and 5000 characters"),
        body("dueDate")
            .optional()
            .isISO8601()
            .withMessage("Please provide a valid due date"),
        body("completionNote")
            .optional({ nullable: true })
            .trim()
            .isLength({ max: 5000 })
            .withMessage("Completion note cannot exceed 5000 characters"),
    ],

    updateStatus: [
        objectId("id"),
        body("status")
            .isIn(ACTION_ITEM_STATUS_VALUES)
            .withMessage(`Status must be one of: ${ACTION_ITEM_STATUS_VALUES.join(", ")}`),
        body("completionNote")
            .optional({ nullable: true })
            .trim()
            .isLength({ max: 5000 })
            .withMessage("Completion note cannot exceed 5000 characters"),
    ],

    updateOwner: [
        objectId("id"),
        body("ownerId").isMongoId().withMessage("Please select a valid owner"),
    ],

    byId: [objectId("id")],

    list: [
        query("page").optional().isInt({ min: 1 }).withMessage("Page must be 1 or more"),
        query("limit")
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage("Limit must be between 1 and 100"),
        query("rcaId").optional().isMongoId().withMessage("Invalid RCA ID"),
        query("incidentId").optional().isMongoId().withMessage("Invalid incident ID"),
        query("problemId").optional().isMongoId().withMessage("Invalid problem ID"),
        // "me" is a supported owner filter - it resolves to the caller.
        query("ownerId")
            .optional()
            .custom((value) => value === "me" || /^[a-f\d]{24}$/i.test(String(value)))
            .withMessage("Invalid owner ID"),
        query("status")
            .optional()
            .custom((value) => {
                const values = String(value).split(",");
                return values.every((item) => ACTION_ITEM_STATUS_VALUES.includes(item));
            })
            .withMessage(`Status must be one of: ${ACTION_ITEM_STATUS_VALUES.join(", ")}`),
        query("sortOrder")
            .optional()
            .isIn(["asc", "desc"])
            .withMessage("sortOrder must be 'asc' or 'desc'"),
    ],
};
const knowledgeBaseArticleValidators = {
    create: [
        body("title")
            .trim()
            .isLength({ min: 3, max: 250 })
            .withMessage("Title must be between 3 and 250 characters")
            .customSanitizer(stripTags),
        body("body")
            .trim()
            .isLength({ min: 10 })
            .withMessage("Body must be at least 10 characters"),
        body("categories")
            .isArray({ min: 1 })
            .withMessage("At least one category is required"),
        body("categories.*")
            .optional()
            .isMongoId()
            .withMessage("Each category must be a valid ID"),
        body("tags")
            .optional()
            .custom((value) => {
                if (value === null || value === undefined) return true;
                if (!Array.isArray(value)) return false;
                return value.every((t) => typeof t === "string" && t.trim().length > 0);
            })
            .withMessage("Tags must be an array of non-empty strings"),
        body("status")
            .optional()
            .isIn(KBA_STATUS_VALUE)
            .withMessage(`Status must be one of: ${KBA_STATUS_VALUE.join(", ")}`),
    ],
    update: [
        objectId("id"),
        body("title")
            .optional()
            .trim()
            .isLength({ min: 3, max: 250 })
            .withMessage("Title must be between 3 and 250 characters")
            .customSanitizer(stripTags),
        body("body")
            .optional()
            .trim()
            .isLength({ min: 10 })
            .withMessage("Body must be at least 10 characters"),
        body("categories")
            .optional()
            .isArray({ min: 1 })
            .withMessage("At least one category is required"),
        body("categories.*")
            .optional()
            .isMongoId()
            .withMessage("Each category must be a valid ID"),
        body("tags")
            .optional()
            .custom((value) => {
                if (value === null || value === undefined) return true;
                if (!Array.isArray(value)) return false;
                return value.every((t) => typeof t === "string" && t.trim().length > 0);
            })
            .withMessage("Tags must be an array of non-empty strings"),
        body("status")
            .optional()
            .isIn(KBA_STATUS_VALUE)
            .withMessage(`Status must be one of: ${KBA_STATUS_VALUE.join(", ")}`),
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
    feedback: [
        objectId("id"),
        body("value")
            .isIn(["helpful", "not_helpful"])
            .withMessage("Value must be 'helpful' or 'not_helpful'"),
    ],
    linkKB: [
        objectId("id"),
        body("kbArticleId")
            .isMongoId()
            .withMessage("Please select a valid KB article"),
    ],
    /** Add a KB article to an incident (multi-article). */
    addKbToIncident: [
        objectId("id"),
        body("kbArticleId")
            .isMongoId()
            .withMessage("Please select a valid KB article"),
    ],
    /** Remove a single KB article from an incident. */
    removeKbFromIncident: [
        objectId("id"),
        param("articleId")
            .isMongoId()
            .withMessage("Invalid KB article ID"),
    ],
    /**
     * List of KB articles searchable for incident linking, always scoped to a
     * category so cross-category articles are never returned.
     */
    listKbForIncident: [
        objectId("id"),
        query("search").optional().trim().isLength({ max: 140 }).withMessage("Search term is too long"),
    ],
};
const submitSurveyValidator =
 [
    body("rating")
        .exists()
        .withMessage("Rating is required")
        .isInt({ min: 1, max: 5 })
        .withMessage("Rating must be between 1 and 5"),

    body("comments")
        .optional({ nullable: true })
        .isString()
        .withMessage("Comments must be a string")
        .trim()
        .isLength({ max: 5000 })
        .withMessage("Comments cannot exceed 5000 characters"),
];
module.exports = {
    authValidators,
    userValidators,
    categoryValidators,
    departmentValidators,
    incidentValidators,
    commentValidators,
    rcaValidators,
    objectId,
    incidentLinkValidator,
    problemValidators,
    knownErrorValidators,
    problemRcaValidators,
    actionItemValidators,
    knowledgeBaseArticleValidators,
    submitSurveyValidator
};

