const express = require("express");
const protect = require("../middleware/auth");
const validate = require("../middleware/validate");
const { authValidators } = require("../validators");
const {
    register,
    login,
    getMe,
    updateProfile,
    changePassword,
} = require("../controllers/authController");

const router = express.Router();

// Public
router.post("/register", authValidators.register, validate, register);
router.post("/login", authValidators.login, validate, login);

// Authenticated
router.get("/me", protect, getMe);
router.patch("/me", protect, authValidators.updateProfile, validate, updateProfile);
router.patch(
    "/me/password",
    protect,
    authValidators.changePassword,
    validate,
    changePassword
);

module.exports = router;
