const express = require("express");
const protect = require("../middleware/auth");
const authorize = require("../middleware/roleCheck");
const validate = require("../middleware/validate");
const { userValidators } = require("../validators");
const { ROLES } = require("../constants");
const {
    listUsers,
    listAssignableUsers,
    getUser,
    createUser,
    updateUser,
    resetUserPassword,
    deactivateUser,
} = require("../controllers/userController");

const router = express.Router();

// Everything below requires a signed-in user.
router.use(protect);

// Agents need this to reassign within the team, so it is not admin-only.
router.get("/assignable", authorize(ROLES.ADMIN, ROLES.AGENT), listAssignableUsers);

// User administration (FR-13) is admin-only.
router.use(authorize(ROLES.ADMIN));

router.route("/").get(listUsers).post(userValidators.create, validate, createUser);

router
    .route("/:id")
    .get(userValidators.byId, validate, getUser)
    .patch(userValidators.update, validate, updateUser)
    .delete(userValidators.byId, validate, deactivateUser);

router.patch(
    "/:id/password",
    userValidators.resetPassword,
    validate,
    resetUserPassword
);

module.exports = router;
