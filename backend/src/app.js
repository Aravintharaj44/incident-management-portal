const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const { env } = require("./config/env");
const logger = require("./utils/logger");
const sanitizeRequest = require("./middleware/sanitize");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const routes = require("./routes");
const {
    STATUS_LABELS,
    PRIORITY_LABELS,
    ROLE_LABELS,
} = require("./constants");
const slaService = require("./services/slaService");

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

/**
 * Security headers
 */
app.use(
    helmet({
        crossOriginResourcePolicy: {
            policy: "cross-origin",
        },
    })
);

/**
 * CORS
 */
app.use(
    cors({
        origin: (origin, callback) => {
            // Allow requests without Origin header
            // e.g. Postman, curl, health checks.
            if (!origin) {
                return callback(null, true);
            }

            if (env.clientUrls.includes(origin)) {
                return callback(null, true);
            }

            return callback(
                new Error(`Origin ${origin} is not allowed by CORS`)
            );
        },
        credentials: true,
        exposedHeaders: ["Content-Disposition"],
    })
);

/**
 * Body parsing
 */
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

/**
 * Request sanitization
 */
app.use(sanitizeRequest);

/**
 * Logging
 */
if (!env.isTest) {
    app.use(
        morgan(env.isProduction ? "combined" : "dev", {
            stream: {
                write: (message) => logger.info(message.trim()),
            },
        })
    );
}

/**
 * General API rate limiter
 */
const apiLimiter = rateLimit({
    windowMs: env.rateLimit.windowMinutes * 60 * 1000,
    max: env.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,

    skip: () => env.isTest,

    message: {
        success: false,
        message: "Too many requests, please slow down",
    },
});

/**
 * Authentication rate limiter
 */
const authLimiter = rateLimit({
    windowMs: env.rateLimit.windowMinutes * 60 * 1000,
    max: env.rateLimit.authMax,
    standardHeaders: true,
    legacyHeaders: false,

    skipSuccessfulRequests: true,
    skip: () => env.isTest,

    message: {
        success: false,
        message:
            "Too many login attempts. Please try again in a few minutes.",
    },
});

app.use("/api", apiLimiter);

app.use("/api/v1/auth/login", authLimiter);
app.use("/api/v1/auth/register", authLimiter);

/**
 * Health check
 */
app.get("/api/health", (_req, res) => {
    res.json({
        success: true,
        message: "Incident Management API is running",
        data: {
            environment: env.nodeEnv,
            uptimeSeconds: Math.round(process.uptime()),
            timestamp: new Date().toISOString(),
        },
    });
});

/**
 * Meta / reference data
 */
app.get("/api/v1/meta", (_req, res) => {
    res.json({
        success: true,
        message: "Reference data retrieved",
        data: {
            statuses: Object.entries(STATUS_LABELS).map(
                ([value, label]) => ({
                    value,
                    label,
                })
            ),

            priorities: Object.entries(PRIORITY_LABELS).map(
                ([value, label]) => ({
                    value,
                    label,
                })
            ),

            roles: Object.entries(ROLE_LABELS).map(
                ([value, label]) => ({
                    value,
                    label,
                })
            ),

            slaTargets: slaService.slaTargets(),

            upload: {
                maxFileSizeMb: env.upload.maxFileSizeMb,
                allowedMimeTypes: env.upload.allowedMimeTypes,
            },
        },
    });
});

/**
 * API routes
 */
app.use("/api/v1", routes);

/**
 * Error handling
 *
 * These must remain last.
 */
app.use(notFound);
app.use(errorHandler);

module.exports = app;