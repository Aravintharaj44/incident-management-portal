const express = require("express");
const { start, callback } = require("../controllers/zohoAuthController");

const router = express.Router();

router.get("/", start);
router.get("/callback", callback);

module.exports = router;