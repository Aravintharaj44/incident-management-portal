const express = require("express");
const protect = require("../middleware/auth");
const authorize = require("../middleware/roleCheck");
const validate = require("../middleware/validate");
const { ROLES } = require("../constants");
const controller = require("../controllers/clientController");
const { oauthClientValidators } = require("../validators");
const router = express.Router();

// FR5-10 - OAuth client management. Every route here is admin-only.
router.use(protect, authorize(ROLES.ADMIN));

router.get("/", oauthClientValidators.list, validate, controller.listClients);

router.get("/:id", oauthClientValidators.byId, validate, controller.getClient);

router.post("/", oauthClientValidators.create, validate, controller.createClient);

router.patch("/:id", oauthClientValidators.update, validate, controller.updateClient);

router.post("/:id/revoke", oauthClientValidators.revoke, validate, controller.revokeClient);

module.exports = router;