/**
 * Single source of truth for configuration.
 *
 * Everything the app needs from the environment is read here once, defaulted
 * where it is safe to do so, and validated at boot. No other module reads
 * `process.env` directly, so misconfiguration surfaces immediately at startup
 * instead of as a confusing runtime error later.
 */

const path = require("path");

const os = require("os");
const toInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
};

const toBool = (value, fallback = false) => {
    if (value === undefined || value === "") return fallback;
    return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const env = {
    nodeEnv: process.env.NODE_ENV || "development",
    port: toInt(process.env.PORT, 5000),

    mongoUri: process.env.MONGO_URI,

    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",

    // Comma-separated list so more than one frontend origin can be allowed.
    clientUrls: (process.env.CLIENT_URL || "http://localhost:5173")
        .split(",")
        .map((url) => url.trim())
        .filter(Boolean),

    // upload: {
    //     dir: process.env.UPLOAD_DIR
    //         ? path.resolve(process.env.UPLOAD_DIR)
    //         : path.join(__dirname, "..", "..", "uploads"),
    //     maxFileSizeMb: toInt(process.env.MAX_FILE_SIZE_MB, 5),
    //     allowedMimeTypes: (
    //         process.env.ALLOWED_MIME_TYPES ||
    //         "image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain"
    //     )
    //         .split(",")
    //         .map((type) => type.trim())
    //         .filter(Boolean),
    // },

    upload: {
        dir: (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION)
            // Vercel sets VERCEL=1 automatically — force /tmp regardless of UPLOAD_DIR,
            // since /var/task is read-only and nothing outside /tmp is writable.
            ? path.join(os.tmpdir(), "incident-portal-uploads")
            : process.env.UPLOAD_DIR
                ? path.resolve(process.env.UPLOAD_DIR)
                : path.join(__dirname, "..", "..", "uploads"),
        maxFileSizeMb: toInt(process.env.MAX_FILE_SIZE_MB, 5),
        allowedMimeTypes: (
            process.env.ALLOWED_MIME_TYPES ||
            "image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain"
        )
            .split(",")
            .map((type) => type.trim())
            .filter(Boolean),
    },
    mail: {
        enabled: toBool(process.env.MAIL_ENABLED, false),
        host: process.env.SMTP_HOST,
        port: toInt(process.env.SMTP_PORT, 587),
        secure: toBool(process.env.SMTP_SECURE, false),
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.MAIL_FROM || "Incident Portal <no-reply@incident.local>",
    },

    rateLimit: {
        windowMinutes: toInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 15),
        max: toInt(process.env.RATE_LIMIT_MAX, 1000),
        authMax: toInt(process.env.RATE_LIMIT_AUTH_MAX, 30),
    },

    // Set to false to stop the seed script from wiping existing collections.
    seedResetsData: toBool(process.env.SEED_RESET, true),
};

env.isProduction = env.nodeEnv === "production";
env.isTest = env.nodeEnv === "test";

/**
 * Fail fast on missing required configuration. Called from server.js before
 * anything else happens.
 */
const validateEnv = () => {
    const missing = [];

    if (!env.mongoUri) missing.push("MONGO_URI");
    if (!env.jwtSecret) missing.push("JWT_SECRET");

    if (missing.length) {
        throw new Error(
            `Missing required environment variables: ${missing.join(", ")}. ` +
            "Copy backend/.env.example to backend/.env and fill them in."
        );
    }

    if (env.isProduction && env.jwtSecret.length < 32) {
        throw new Error(
            "JWT_SECRET must be at least 32 characters long in production."
        );
    }

    if (env.mail.enabled && (!env.mail.host || !env.mail.user || !env.mail.pass)) {
        throw new Error(
            "MAIL_ENABLED requires SMTP_HOST, SMTP_USER and SMTP_PASS."
        );
    }
};

module.exports = { env, validateEnv };
