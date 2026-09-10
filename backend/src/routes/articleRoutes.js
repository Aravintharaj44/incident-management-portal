const express = require("express");

const authenticate = require("../middleware/authenticate");
const requireRateLimit = require("../middleware/rateLimitCredits");
const validate = require("../middleware/validate");
const requireOAuthScope = require("../middleware/oauthScope");

const { articleValidators } = require("../validators/articleValidators");
const { OAUTH_SCOPES } = require("../constants");

const { listArticles, getArticle } = require("../controllers/articleController");

const router = express.Router();
router.use(authenticate);
router.use(requireRateLimit);

router
    .route("/")
    .get(requireOAuthScope(OAUTH_SCOPES.ARTICLES_READ), articleValidators.list, validate, listArticles);

router
    .route("/:id")
    .get(requireOAuthScope(OAUTH_SCOPES.ARTICLES_READ), articleValidators.byId, validate, getArticle);

module.exports = router;