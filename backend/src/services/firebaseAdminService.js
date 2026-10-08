const fs = require("fs");
const path = require("path");
const { initializeApp, getApps, deleteApp, cert } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const { env } = require("../config/env");
const logger = require("../utils/logger");

/**
 * Centralised Firebase Admin singleton (FCM web push).
 *
 * Credentials are resolved in priority order:
 *   1. Environment variables (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL /
 *      FIREBASE_PRIVATE_KEY) - the preferred path on Vercel/serverless.
 *   2. A local service-account JSON file (gitignored) - local development only.
 *
 * When neither is available the service reports itself as "not configured" and
 * every caller degrades to a no-op, so push notifications being unconfigured
 * never takes the rest of the application down.
 *
 * Credential *values* are never logged.
 */

const SERVICE_ACCOUNT_FILENAME = "incident-management-firebase.json";

let messaging = null;
let initAttempted = false;
let configured = null; // memoised isConfigured() result

const readServiceAccountFile = () => {
    const explicitPath = env.firebase.serviceAccountPath;
    const candidates = explicitPath
        ? [path.resolve(explicitPath)]
        : [
              path.join(__dirname, "..", "..", SERVICE_ACCOUNT_FILENAME),
              path.join(process.cwd(), SERVICE_ACCOUNT_FILENAME),
          ];

    for (const file of candidates) {
        try {
            if (!fs.existsSync(file)) continue;
            const raw = JSON.parse(fs.readFileSync(file, "utf8"));
            if (!raw.project_id || !raw.client_email || !raw.private_key) continue;
            return {
                projectId: raw.project_id,
                clientEmail: raw.client_email,
                privateKey: raw.private_key,
            };
        } catch (error) {
            // Never include file contents or key material in the log line.
            logger.warn(`firebaseAdminService: could not read service-account file (${error.message})`);
        }
    }
    return null;
};

const resolveCredentials = () => {
    const candidates = [];

    const { projectId, clientEmail, privateKey } = env.firebase;
    if (projectId && clientEmail && privateKey) {
        candidates.push({ projectId, clientEmail, privateKey, source: "env" });
    }

    const fromFile = readServiceAccountFile();
    if (fromFile) candidates.push({ ...fromFile, source: "file" });

    return candidates;
};

const isConfigured = () => {
    if (configured === null) configured = resolveCredentials().length > 0;
    return configured;
};

const buildApp = (credentials) => {
    const credential = cert({
        projectId: credentials.projectId,
        clientEmail: credentials.clientEmail,
        privateKey: credentials.privateKey,
    });

    const existing = getApps()[0];
    const app = existing || initializeApp({ credential, projectId: credentials.projectId });

    try {
        return { app, messaging: getMessaging(app) };
    } catch (error) {
        // Roll back so the next credential candidate can start clean.
        if (!existing) deleteApp(app).catch(() => {});
        throw error;
    }
};

const getFirebaseMessaging = () => {
    if (messaging) return messaging;
    if (initAttempted) return null;
    if (!isConfigured()) return null;

    initAttempted = true;

    // Try environment credentials first (serverless/Vercel), then the local
    // service-account file. A bad/placeholder env key must not prevent the
    // file-based fallback from working during local development.
    for (const credentials of resolveCredentials()) {
        try {
            const built = buildApp(credentials);
            messaging = built.messaging;
            // Only the credential *source* is safe to log - never the values.
            logger.info(`firebaseAdminService: initialised (credentials from ${credentials.source})`);
            return messaging;
        } catch (error) {
            logger.warn(`firebaseAdminService: init from ${credentials.source} credentials failed (${error.message})`);
        }
    }

    logger.warn("firebaseAdminService: Firebase Messaging unavailable - push notifications disabled");
    return null;
};

module.exports = { isConfigured, getFirebaseMessaging };
