// api/index.js  — this becomes your Vercel entry point instead of server.js
const app = require("../src/app");
const { connectDB } = require("../src/config/db");
const logger = require("../src/utils/logger");

let isConnected = false;

module.exports = async (req, res) => {
    if (!isConnected) {
        try {
            await connectDB();
            isConnected = true;
        } catch (error) {
            logger.error(`DB connection failed: ${error.message}`);
            return res.status(500).json({ success: false, message: "Database connection failed" });
        }
    }
    return app(req, res);
};