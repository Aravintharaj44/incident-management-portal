const express = require("express");
const { body } = require("express-validator");
const protect = require("../middleware/auth");
const validate = require("../middleware/validate");
const { message } = require("../controllers/chatbotController");
const router = express.Router();
router.use(protect);
router.post("/message", [body("message").optional().isString().trim().isLength({ max: 5000 }), body("action").optional().isString().trim().isLength({ max: 200 }), body("conversationId").optional().isUUID()], validate, message);
module.exports = router;
