const express = require("express");

const authenticate = require("../middleware/authenticate");
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

/**
 * FR5-01 - Zoho Desk-compatible REST Ticket API.
 *
 * Authentication accepts either an existing portal JWT (must be obtained via
 * POST /api/v1/auth/login) OR an OAuth 2.0 access token (FR5-02, obtained via
 * POST /api/v1/oauth/token). `authenticate` picks the right verifier from the
 * token payload, so both styles work without rewriting the handlers below.
 *
 * FR5-03 - OAuth tokens are additionally checked for the required scope.
 * Portal JWTs bypass scope checks (their authorization is role-based).
 */
router.use(authenticate);

/**
 * GET    /api/v1/tickets          -> list incidents as tickets (limit/from)
 * POST   /api/v1/tickets          -> create an incident from a ticket
 */
router
    .route("/")
    .get(requireOAuthScope(OAUTH_SCOPES.TICKETS_READ), ticketValidators.list, validate, listTickets)
    .post(requireOAuthScope(OAUTH_SCOPES.TICKETS_WRITE), ticketValidators.create, validate, createTicket);

/**
 * GET    /api/v1/tickets/:id      -> one ticket
 * PUT    /api/v1/tickets/:id      -> full replacement of supported fields
 * PATCH  /api/v1/tickets/:id      -> partial update of supported fields
 * DELETE /api/v1/tickets/:id      -> admin-only delete (reuses incident rules)
 */
router
    .route("/:id")
    .get(requireOAuthScope(OAUTH_SCOPES.TICKETS_READ), ticketValidators.byId, validate, getTicket)
    .put(requireOAuthScope(OAUTH_SCOPES.TICKETS_WRITE), ticketValidators.update, validate, updateTicket)
    .patch(requireOAuthScope(OAUTH_SCOPES.TICKETS_WRITE), ticketValidators.update, validate, patchTicket)
    .delete(requireOAuthScope(OAUTH_SCOPES.TICKETS_WRITE), ticketValidators.byId, validate, deleteTicket);

module.exports = router;
