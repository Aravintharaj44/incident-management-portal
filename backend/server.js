require("dotenv").config();

const app = require("./src/app");
const { validateEnv } = require("./src/config/env");
const { connectDB } = require("./src/config/db");
const logger = require("./src/utils/logger");

let initialized = false;

/**
 * Vercel serverless entry point.
 *
 * Vercel invokes this function for every request.
 * The Express app must NOT call app.listen() here.
 */
const handler = async (req, res) => {
    try {
        /**
         * Initialize environment and database only once
         * for the lifetime of this serverless instance.
         */
        if (!initialized) {
            validateEnv();

            await connectDB();

            initialized = true;

            logger.info("Database connected successfully");
        }

        /**
         * Pass the request to Express.
         */
        return app(req, res);
    } catch (error) {
        logger.error(`Serverless startup failed: ${error.message}`);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

module.exports = handler;