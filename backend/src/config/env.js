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

    // FR5-02 - OAuth 2.0 client-credentials flow for the public REST API.
    // Access tokens are signed with a *separate* secret from the portal JWTs so
    // the two token types cannot satisfy each other. In development the OAuth
    // secret falls back to JWT_SECRET; in production it must be set to its own
    // long random value (enforced in validateEnv below).
    oauth: {
        accessTokenExpiresIn: toInt(process.env.OAUTH_ACCESS_TOKEN_EXPIRES_IN, 3600),
        issuer: process.env.OAUTH_TOKEN_ISSUER || "incident-portal-api",
        audience: process.env.OAUTH_TOKEN_AUDIENCE || "incident-portal-api",
        accessTokenSecret:
            process.env.OAUTH_ACCESS_TOKEN_SECRET || process.env.JWT_SECRET || "",
    },

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

    // FR5-09: daily API credit limit per OAuth client for the public REST API.
    publicApiDailyCredits: toInt(process.env.PUBLIC_API_DAILY_CREDITS, 1000),

    // Set to false to stop the seed script from wiping existing collections.
    seedResetsData: toBool(process.env.SEED_RESET, true),

    // FR4-29: CSAT rating below this threshold flags the incident for manager follow-up.
    csatFollowupThreshold: toInt(process.env.CSAT_FOLLOWUP_THRESHOLD, 3),
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

    // FR5-02: in production the OAuth signing secret must be its own long
    // random value, so an OAuth access token cannot be forged with the portal
    // secret and vice versa.
    if (env.isProduction) {
        const oauthSecret = env.oauth.accessTokenSecret;
        if (!oauthSecret || oauthSecret === "" || oauthSecret.length < 32) {
            throw new Error(
                "OAUTH_ACCESS_TOKEN_SECRET must be at least 32 characters long in production."
            );
        }
        if (oauthSecret === env.jwtSecret) {
            throw new Error(
                "OAUTH_ACCESS_TOKEN_SECRET must be different from JWT_SECRET in production " +
                "so OAuth tokens and portal tokens cannot be interchanged."
            );
        }
    }

    if (env.oauth.accessTokenExpiresIn < 60) {
        throw new Error(
            "OAUTH_ACCESS_TOKEN_EXPIRES_IN must be at least 60 seconds."
        );
    }

    if (env.mail.enabled && (!env.mail.host || !env.mail.user || !env.mail.pass)) {
        throw new Error(
            "MAIL_ENABLED requires SMTP_HOST, SMTP_USER and SMTP_PASS."
        );
    }
};

module.exports = { env, validateEnv };
