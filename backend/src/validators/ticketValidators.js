const { body, param, query } = require("express-validator");
const { PRIORITY_VALUES } = require("../constants");


const stamp = `Ticket`;

const objectIdParam = (field = "id") =>
    param(field).isMongoId().withMessage("Not a valid id");

const ticketValidators = {
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
        body("subject")
            .trim()
            .isLength({ min: 5, max: 140 })
            .withMessage(`${stamp} subject must be between 5 and 140 characters`),
        body("description")
            .trim()
            .isLength({ min: 10, max: 5000 })
            .withMessage(
                `${stamp} description must be between 10 and 5000 characters`
            ),
        body("category").isMongoId().withMessage("Please select a category"),
        body("priority")
            .optional()
            .isIn(PRIORITY_VALUES)
            .withMessage(`Priority must be one of: ${PRIORITY_VALUES.join(", ")}`),
    ],

    /**
     * Shared by PUT and PATCH. Only supported descriptive fields are editable
     * here; status/assignment/department have their own workflow endpoints and
     * are intentionally not accepted through /tickets.
     */
    update: [
        objectIdParam("id"),
        body("subject")
            .optional()
            .trim()
            .isLength({ min: 5, max: 140 })
            .withMessage(`${stamp} subject must be between 5 and 140 characters`),
        body("description")
            .optional()
            .trim()
            .isLength({ min: 10, max: 5000 })
            .withMessage(
                `${stamp} description must be between 10 and 5000 characters`
            ),
        body("category")
            .optional()
            .isMongoId()
            .withMessage("Please select a valid category"),
        body("priority")
            .optional()
            .isIn(PRIORITY_VALUES)
            .withMessage(`Priority must be one of: ${PRIORITY_VALUES.join(", ")}`),
    ],
};

module.exports = { ticketValidators };
