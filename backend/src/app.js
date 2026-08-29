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
const { STATUS_LABELS, PRIORITY_LABELS, ROLE_LABELS } = require("./constants");
const slaService = require("./services/slaService");

const app = express();

/**
 * Express application assembly.
 *
 * Order matters: security headers, then CORS, then body parsing, then
 * sanitising, then the routes, and finally the 404 and error handlers - which
 * must be last so they can catch everything above them.
 */

// Behind a reverse proxy (Render, Railway, nginx) this makes req.ip the real
// client address rather than the proxy's, which the rate limiter depends on.
app.set("trust proxy", 1);

app.disable("x-powered-by");

app.use(
    helmet({
        // Attachments are streamed to a different origin (the Vite dev server),
        // which the default same-origin policy would block.
        crossOriginResourcePolicy: { policy: "cross-origin" },
    })
);

/**
 * CORS is limited to the known frontend origins from configuration rather than
 * being opened to "*", because the API is called with credentials.
 */
app.use(
    cors({
        origin: (origin, callback) => {
            // Allow tools with no Origin header (curl, Postman, health checks).
            if (!origin || env.clientUrls.includes(origin)) {
                return callback(null, true);
            }
            return callback(new Error(`Origin ${origin} is not allowed by CORS`));
        },
        credentials: true,
        exposedHeaders: ["Content-Disposition"],
    })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use(sanitizeRequest);

if (!env.isTest) {
    app.use(
        morgan(env.isProduction ? "combined" : "dev", {
            stream: { write: (message) => logger.info(message.trim()) },
        })
    );
}

// A broad ceiling on the whole API...
const apiLimiter = rateLimit({
    windowMs: env.rateLimit.windowMinutes * 60 * 1000,
    max: env.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    // An automated test run legitimately makes hundreds of requests from one
    // address; throttling it would only test the limiter.
    skip: () => env.isTest,
    message: { success: false, message: "Too many requests, please slow down" },
});

// ...and a much tighter one on the endpoints worth brute-forcing.
const authLimiter = rateLimit({
    windowMs: env.rateLimit.windowMinutes * 60 * 1000,
    max: env.rateLimit.authMax,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    skip: () => env.isTest,
    message: {
        success: false,
        message: "Too many login attempts. Please try again in a few minutes.",
    },
});

app.use("/api", apiLimiter);
app.use("/api/v1/auth/login", authLimiter);
app.use("/api/v1/auth/register", authLimiter);

/** Liveness probe - no auth, no database access. */
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
 * Enumerations and SLA targets, so the React app renders labels from the same
 * source of truth as the API instead of hard-coding its own copy.
 */
app.get("/api/v1/meta", (_req, res) => {
    res.json({
        success: true,
        message: "Reference data retrieved",
        data: {
            statuses: Object.entries(STATUS_LABELS).map(([value, label]) => ({
                value,
                label,
            })),
            priorities: Object.entries(PRIORITY_LABELS).map(([value, label]) => ({
                value,
                label,
            })),
            roles: Object.entries(ROLE_LABELS).map(([value, label]) => ({
                value,
                label,
            })),
            slaTargets: slaService.slaTargets(),
            upload: {
                maxFileSizeMb: env.upload.maxFileSizeMb,
                allowedMimeTypes: env.upload.allowedMimeTypes,
            },
        },
    });
});

app.use("/api/v1", routes);

// Must stay last: 404 for unmatched routes, then the central error handler.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
