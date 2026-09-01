require("dotenv").config();

const app = require("./src/app");
const { env, validateEnv } = require("./src/config/env");
const { connectDB, disconnectDB } = require("./src/config/db");
const logger = require("./src/utils/logger");
const {
    startOverdueIncidentJob,
} = require("./src/cron/overdueIncidentJob");
const {
    startOverdueActionItemJob,
} = require("./src/cron/overdueActionItemJob");

/**
 * Process bootstrap.
 *
 * Configuration is validated and the database connection is established before
 * the HTTP listener opens, so the server never accepts a request it cannot
 * actually serve.
 */
const startServer = async () => {
    try {
        validateEnv();
        await connectDB();
        // startOverdueIncidentJob()
        // startOverdueActionItemJob()
    } catch (error) {
        logger.error(`Startup failed: ${error.message}`);
        process.exit(1);
    }

    const server = app.listen(env.port, () => {
        logger.info(`API listening on http://localhost:${env.port} (${env.nodeEnv})`);
        logger.info(`Allowed client origins: ${env.clientUrls.join(", ")}`);
    });

    /**
     * Graceful shutdown: stop accepting new connections, let in-flight
     * requests finish, then close the database handle.
     */
    const shutdown = async (signal) => {
        logger.info(`${signal} received, shutting down`);

        server.close(async () => {
            await disconnectDB();
            logger.info("Shutdown complete");
            process.exit(0);
        });

        // Do not hang forever on a stuck connection.
        setTimeout(() => {
            logger.error("Forced shutdown after timeout");
            process.exit(1);
        }, 10000).unref();
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    // A rejected promise nobody handled leaves the process in an unknown
    // state - log it loudly and restart rather than limping on.
    process.on("unhandledRejection", (reason) => {
        logger.error("Unhandled promise rejection", reason);
        shutdown("unhandledRejection");
    });

    process.on("uncaughtException", (error) => {
        logger.error("Uncaught exception", error.stack);
        process.exit(1);
    });
};

startServer();
