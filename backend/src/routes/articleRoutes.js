const express = require("express");

const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const requireOAuthScope = require("../middleware/oauthScope");

const { articleValidators } = require("../validators/articleValidators");
const { OAUTH_SCOPES } = require("../constants");

const { listArticles, getArticle } = require("../controllers/articleController");

const router = express.Router();

/**
 * FR5-07 - public Knowledge Base Articles API (GET-only).
 *
 * Authentication accepts either an existing portal JWT OR an OAuth 2.0 access
 * token (FR5-02). OAuth tokens are additionally checked for the `articles.READ`
 * scope (FR5-03); portal JWTs bypass scope checks (their authorization is
 * role-based).
 *
 * No create/update/delete endpoints are exposed - only `articles.READ` is
 * currently defined, so the surface is strictly read-only.
 */
router.use(authenticate);

/**
 * GET /api/v1/articles        -> list published articles (search/categoryId)
 * GET /api/v1/articles/:id    -> one published article
 */
router
    .route("/")
    .get(requireOAuthScope(OAUTH_SCOPES.ARTICLES_READ), articleValidators.list, validate, listArticles);

router
    .route("/:id")
    .get(requireOAuthScope(OAUTH_SCOPES.ARTICLES_READ), articleValidators.byId, validate, getArticle);

module.exports = router;