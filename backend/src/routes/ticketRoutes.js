const express = require("express");

const authenticate = require("../middleware/authenticate");
const requireRateLimit = require("../middleware/rateLimitCredits");
const validate = require("../middleware/validate");
const requireOAuthScope = require("../middleware/oauthScope");

const { ticketValidators } = require("../validators/ticketValidators");
const { OAUTH_SCOPES } = require("../constants");

const {
    listTickets,
    getTicket,
    createTicket,
    updateTicket,
    patchTicket,
    deleteTicket,
} = require("../controllers/ticketController");

const router = express.Router();

router.use(authenticate);
router.use(requireRateLimit);

router
    .route("/")
    .get(requireOAuthScope(OAUTH_SCOPES.TICKETS_READ), ticketValidators.list, validate, listTickets)
    .post(requireOAuthScope(OAUTH_SCOPES.TICKETS_WRITE), ticketValidators.create, validate, createTicket);

router
    .route("/:id")
    .get(requireOAuthScope(OAUTH_SCOPES.TICKETS_READ), ticketValidators.byId, validate, getTicket)
    .put(requireOAuthScope(OAUTH_SCOPES.TICKETS_WRITE), ticketValidators.update, validate, updateTicket)
    .patch(requireOAuthScope(OAUTH_SCOPES.TICKETS_WRITE), ticketValidators.update, validate, patchTicket)
    .delete(requireOAuthScope(OAUTH_SCOPES.TICKETS_WRITE), ticketValidators.byId, validate, deleteTicket);

module.exports = router;
