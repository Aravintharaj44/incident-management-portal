const express = require("express");
const oauthProtect = require("../middleware/oauth");
const requireOAuthScope = require("../middleware/oauthScope");
const { OAUTH_SCOPES } = require("../constants");
const { listAgents, getAgentById } = require("../controllers/agentController");
const {
    listAgentsValidator,
    getAgentByIdValidator,
} = require("../validators/agentValidator");

const router = express.Router();

// Enforce OAuth Bearer Token protection for all endpoints in this router
router.use(oauthProtect);

/**
 * GET /api/v1/agents
 * Requires 'agents.READ' scope
 */
router.get(
    "/",
    requireOAuthScope(OAUTH_SCOPES.AGENTS_READ),
    listAgentsValidator,
    listAgents
);

/**
 * GET /api/v1/agents/:agent_id
 * Requires 'agents.READ' scope
 */
router.get(
    "/:agent_id",
    requireOAuthScope(OAUTH_SCOPES.AGENTS_READ),
    getAgentByIdValidator,
    getAgentById
);

module.exports = router;