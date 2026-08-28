const mongoose = require("mongoose");
const { env } = require("./env");
const logger = require("../utils/logger");

/**
 * Opens the MongoDB connection and wires up connection-level event logging so
 * a dropped database is visible in the logs rather than silently failing on
 * the next query.
 */
const connectDB = async () => {
    // Reject queries against fields that are not in the schema instead of
    // silently ignoring them - catches typos early.
    mongoose.set("strictQuery", true);

    mongoose.connection.on("disconnected", () => {
        logger.warn("MongoDB disconnected");
    });

    mongoose.connection.on("error", (error) => {
        logger.error("MongoDB connection error", error.message);
    });

    const conn = await mongoose.connect(env.mongoUri, {
        serverSelectionTimeoutMS: 10000,
    });

    logger.info(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);

    return conn;
};

const disconnectDB = async () => {
    await mongoose.connection.close();
};

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.disconnectDB = disconnectDB;
