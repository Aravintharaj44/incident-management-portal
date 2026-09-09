const ApiUsage = require("../models/ApiUsage");
const asyncHandler = require("../utils/asyncHandler");
const { env } = require("../config/env");

/**
 * Returns the current UTC date as "YYYY-MM-DD".
 */
const getUtcDate = () => {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
};

/**
 * Returns the number of seconds from now until the next UTC midnight.
 */
const secondsUntilNextUtcDay = () => {
    const now = new Date();
    const tomorrow = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0, 0, 0, 0
    ));
    return Math.ceil((tomorrow.getTime() - now.getTime()) / 1000);
};

/**
 * FR5-09 - Daily API credit / rate-limit middleware for the public OAuth REST
 * API.
 *
 * This middleware:
 *   1. Skips entirely for portal JWT requests (no req.oauth).
 *   2. Identifies the authenticated OAuth client by clientId.
 *   3. Atomically increments today's usage counter via MongoDB upsert.
 *   4. Rejects with HTTP 429 if the daily limit has been reached.
 *   5. Sets X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
 *      headers on the response.
 *
 * The compound unique index on ApiUsage (clientId, date) ensures concurrent
 * requests cannot bypass the limit: the upsert either increments an existing
 * document or atomically creates a new one, and the unique index prevents
 * duplicate records for the same client and day.
 *
 * Place AFTER authenticate (which sets req.oauth) and BEFORE requireOAuthScope.
 */
const requireRateLimit = asyncHandler(async (req, res, next) => {
    // Portal JWT requests bypass rate limiting entirely.
    if (!req.oauth) return next();

    const clientId = req.oauth.clientId;
    const today = getUtcDate();
    const limit = env.publicApiDailyCredits;
    const resetSeconds = secondsUntilNextUtcDay();

    // Atomic upsert: increment count by 1. If no document exists for this
    // client+day, one is created with count: 1. The unique index guarantees
    // this operation is safe under concurrent requests.
    const usage = await ApiUsage.findOneAndUpdate(
        { clientId, date: today },
        {
            $inc: { count: 1 },
            $setOnInsert: { clientId, date: today },
        },
        {
            returnDocument: "after",
            upsert: true,
        }
    );

    const remaining = Math.max(0, limit - usage.count);

    // Set rate-limit headers on every response from this point forward.
    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(resetSeconds));

    if (usage.count > limit) {
        res.setHeader("Retry-After", String(resetSeconds));
        return res.status(429).json({
            success: false,
            message: "Daily API rate limit exceeded",
        });
    }

    next();
});

module.exports = requireRateLimit;
module.exports.requireRateLimit = requireRateLimit;
module.exports.getUtcDate = getUtcDate;
module.exports.secondsUntilNextUtcDay = secondsUntilNextUtcDay;
