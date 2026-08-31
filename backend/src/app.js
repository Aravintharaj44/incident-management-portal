const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");
const { env } = require("./config/env");
const logger = require("./utils/logger");
const sanitizeRequest = require("./middleware/sanitize");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const routes = require("./routes");
const { STATUS_LABELS, PRIORITY_LABELS, ROLE_LABELS } = require("./constants");
const slaService = require("./services/slaService");

const app = express();

app.set("trust proxy", 1);

app.disable("x-powered-by");

app.use(
    helmet({
        crossOriginResourcePolicy: { policy: "cross-origin" },
    })
);
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

// Swagger UI and the raw OpenAPI spec. The full documentation is defined in
// src/config/swagger.js and simply described here - nothing about how the
// existing routes handle requests is changed.
// app.use(
//     "/api-docs",
//     swaggerUi.serve,
//     swaggerUi.setup(swaggerSpec, {
//         customSiteTitle: "Incident Management API - Swagger",
//     })
// );
app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec)
);

 
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
app.use(notFound);
app.use(errorHandler);

module.exports = app;
