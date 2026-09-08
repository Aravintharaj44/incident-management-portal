const express = require("express");
const oauthProtect = require("../middleware/oauth");
const requireOAuthScope = require("../middleware/oauthScope");
const { OAUTH_SCOPES } = require("../constants");
const { listTeams, getTeamById } = require("../controllers/teamController");
const {
    listTeamsValidator,
    getTeamByIdValidator,
} = require("../validators/teamValidator");

const router = express.Router();

// Enforce OAuth Bearer Token protection for all endpoints in this router
router.use(oauthProtect);

/**
 * GET /api/v1/teams
 * FR5-06 - requires 'departments.READ' scope
 */
router.get(
    "/",
    requireOAuthScope(OAUTH_SCOPES.DEPARTMENTS_READ),
    listTeamsValidator,
    listTeams
);

/**
 * GET /api/v1/teams/:team_id
 * FR5-06 - requires 'departments.READ' scope
 */
router.get(
    "/:team_id",
    requireOAuthScope(OAUTH_SCOPES.DEPARTMENTS_READ),
    getTeamByIdValidator,
    getTeamById
);

module.exports = router;