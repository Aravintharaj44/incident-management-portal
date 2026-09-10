const express = require("express");

const authenticate = require("../middleware/authenticate");
const requireRateLimit = require("../middleware/rateLimitCredits");
const validate = require("../middleware/validate");
const requireOAuthScope = require("../middleware/oauthScope");

const { contactValidators } = require("../validators/contactValidators");
const { OAUTH_SCOPES } = require("../constants");

const {
    listContacts,
    getContact,
    createContact,
    updateContact,
} = require("../controllers/contactController");

const router = express.Router();

router.use(authenticate);
router.use(requireRateLimit);

/**
 * GET    /api/v1/contacts      -> list End User contacts (from/limit)
 * POST   /api/v1/contacts      -> create a contact
 */
router
    .route("/")
    .get(requireOAuthScope(OAUTH_SCOPES.CONTACTS_READ), contactValidators.list, validate, listContacts)
    .post(requireOAuthScope(OAUTH_SCOPES.CONTACTS_WRITE), contactValidators.create, validate, createContact);

/**
 * GET    /api/v1/contacts/:id  -> one contact
 * PUT    /api/v1/contacts/:id  -> full replacement of supported fields
 */
router
    .route("/:id")
    .get(requireOAuthScope(OAUTH_SCOPES.CONTACTS_READ), contactValidators.byId, validate, getContact)
    .put(requireOAuthScope(OAUTH_SCOPES.CONTACTS_READ), contactValidators.update, validate, updateContact);

module.exports = router;