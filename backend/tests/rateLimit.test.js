const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");

const { env } = require("../src/config/env");
const { issueAccessToken } = require("../src/services/oauthService");
const { DEMO_OAUTH } = require("../src/seed/oauthDemoData");
const ApiUsage = require("../src/models/ApiUsage");
const { getUtcDate } = require("../src/middleware/rateLimitCredits");

/**
 * End-to-end tests for FR5-09 - daily API credit / rate limiting on the public
 * OAuth REST API (/api/v1/tickets, /api/v1/contacts, /api/v1/articles).
 *
 *   1. npm run seed        (creates the demo OAuth clients)
 *   2. npm start           (in another terminal)
 *   3. npm test
 *
 * Rate limiting applies per OAuth client per UTC day. Portal JWT requests are
 * NOT rate limited. The daily limit is configured via PUBLIC_API_DAILY_CREDITS
 * (default 1000).
 *
 * To keep the suite fast and deterministic regardless of the configured limit,
 * the usage counter is seeded directly through the ApiUsage collection (the
 * same source of truth the middleware reads) using a direct DB connection -
 * the oauth.test.js precedent.
 */

const BASE = process.env.TEST_API_URL || "http://localhost:5000/api/v1";
const PASSWORD = "Password123";

const ACCOUNTS = {
    admin: "admin@zybisys.com",
};

/** fetch wrapper returning { status, body, headers, raw } with http headers. */
const api = async (path, { method = "GET", token, body, raw, headers: extraHeaders = {} } = {}) => {
    const headers = { ...extraHeaders };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body && !raw) headers["Content-Type"] = "application/json";

    const response = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: raw ? body : body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        parsed = text;
    }
    return { status: response.status, body: parsed, headers: response.headers };
};

const login = async (email) => {
    const { status, body } = await api("/auth/login", {
        method: "POST",
        body: { email, password: PASSWORD },
    });
    assert.equal(status, 200, `login failed for ${email}: ${JSON.stringify(body)}`);
    return body.data.token;
};

const basicAuth = (clientId, clientSecret) =>
    `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;

const requestToken = async ({ clientId, clientSecret, grantType = "client_credentials", scope } = {}) => {
    const headers = { "Content-Type": "application/x-www-form-urlencoded" };
    if (clientId !== undefined) headers.Authorization = basicAuth(clientId, clientSecret);

    const params = new URLSearchParams();
    if (grantType) params.set("grant_type", grantType);
    if (scope !== undefined) params.set("scope", scope);

    const response = await fetch(`${BASE}/oauth/token`, {
        method: "POST",
        headers,
        body: params.toString(),
    });

    const text = await response.text();
    let body;
    try {
        body = JSON.parse(text);
    } catch {
        body = text;
    }
    return { status: response.status, body, headers: response.headers };
};

// Shared state.
const ctx = {};

// Connects to Mongo once for the direct-DB seeding helpers, mirroring the
// oauth.test.js pattern. Each helper (re)connects, does its write, disconnects.
const withDb = async (fn) => {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
    try {
        return await fn();
    } finally {
        await mongoose.disconnect();
    }
};

const setUsage = (clientId, date, count) =>
    withDb(() => ApiUsage.findOneAndUpdate(
        { clientId, date },
        { $set: { count } },
        { returnDocument: "after", upsert: true }
    ));

const getUsage = (clientId, date) =>
    withDb(() => ApiUsage.findOne({ clientId, date }));

const clearUsage = (clientId) =>
    withDb(() => ApiUsage.deleteMany({ clientId }));

test("FR5-09 setup: obtain an OAuth access token and a portal JWT", async () => {
    const { status, body } = await requestToken({
        clientId: DEMO_OAUTH.active.clientId,
        clientSecret: DEMO_OAUTH.active.clientSecret,
    });
    assert.equal(status, 200, JSON.stringify(body));
    ctx.oauthToken = body.access_token;

    // A second, independent client (read-only) for the isolation test.
    const readOnly = await requestToken({
        clientId: DEMO_OAUTH.readOnly.clientId,
        clientSecret: DEMO_OAUTH.readOnly.clientSecret,
    });
    assert.equal(readOnly.status, 200, JSON.stringify(readOnly.body));
    ctx.readOnlyToken = readOnly.body.access_token;

    // A contacts-only client with a scope that does NOT include tickets.READ,
    // used to verify scope rejection still works.
    const contacts = await requestToken({
        clientId: DEMO_OAUTH.contactsRead.clientId,
        clientSecret: DEMO_OAUTH.contactsRead.clientSecret,
    });
    assert.equal(contacts.status, 200, JSON.stringify(contacts.body));
    ctx.contactsToken = contacts.body.access_token;

    // Portal JWT for the "not rate limited" checks.
    ctx.adminToken = await login(ACCOUNTS.admin);

    ctx.today = getUtcDate();
});

test("FR5-09: X-RateLimit-Limit is returned and equals the configured daily limit", async () => {
    // Start clean for this client so we get a predictable baseline.
    await clearUsage(DEMO_OAUTH.active.clientId);

    const { status, headers } = await api("/tickets?limit=1", { token: ctx.oauthToken });
    assert.equal(status, 200);

    const limit = Number(headers.get("x-ratelimit-limit"));
    assert.equal(limit, env.publicApiDailyCredits, "X-RateLimit-Limit header");
});

test("FR5-09: X-RateLimit-Remaining decreases as usage increases", async () => {
    await clearUsage(DEMO_OAUTH.active.clientId);

    const first = await api("/tickets?limit=1", { token: ctx.oauthToken });
    assert.equal(first.status, 200);
    const remainingAfterFirst = Number(first.headers.get("x-ratelimit-remaining"));
    assert.equal(remainingAfterFirst, env.publicApiDailyCredits - 1);

    const second = await api("/tickets?limit=1", { token: ctx.oauthToken });
    assert.equal(second.status, 200);
    const remainingAfterSecond = Number(second.headers.get("x-ratelimit-remaining"));
    assert.equal(remainingAfterSecond, env.publicApiDailyCredits - 2);

    // The limit itself never changes.
    assert.equal(Number(second.headers.get("x-ratelimit-limit")), env.publicApiDailyCredits);
});

test("FR5-09: the usage count is persisted in the database", async () => {
    // The two calls above must be reflected in the ApiUsage collection.
    const usage = await getUsage(DEMO_OAUTH.active.clientId, ctx.today);
    assert.ok(usage, "expected a persisted usage record");
    assert.equal(usage.count, 2);
});

test("FR5-09: X-RateLimit-Reset is a positive number of seconds", async () => {
    await clearUsage(DEMO_OAUTH.active.clientId);

    const { status, headers } = await api("/tickets?limit=1", { token: ctx.oauthToken });
    assert.equal(status, 200);

    const reset = Number(headers.get("x-ratelimit-reset"));
    assert.ok(reset > 0, `X-RateLimit-Reset should be positive, got ${reset}`);
    assert.ok(reset <= 86400, `X-RateLimit-Reset should be <= 86400s, got ${reset}`);
});

test("FR5-09: X-RateLimit-Remaining is never negative", async () => {
    // Seed usage exactly at the limit.
    await setUsage(DEMO_OAUTH.active.clientId, ctx.today, env.publicApiDailyCredits);

    const { status, headers } = await api("/tickets?limit=1", { token: ctx.oauthToken });
    // At/over the limit, the request is rejected.
    assert.equal(status, 429);
    const remaining = Number(headers.get("x-ratelimit-remaining"));
    assert.ok(remaining >= 0, `remaining must never be negative, got ${remaining}`);
});

test("FR5-09: hitting the limit returns 429 with Retry-After and the error envelope", async () => {
    // Set usage exactly at the limit, then the next request pushes count over
    // the limit and must be rejected with 429.
    await setUsage(DEMO_OAUTH.active.clientId, ctx.today, env.publicApiDailyCredits);

    const { status, body, headers } = await api("/tickets?limit=1", { token: ctx.oauthToken });
    assert.equal(status, 429);
    assert.equal(body.success, false);
    assert.match(String(body.message).toLowerCase(), /rate limit/);

    const retryAfter = headers.get("retry-after");
    assert.ok(retryAfter, "expected Retry-After header");
    assert.ok(Number(retryAfter) > 0, `Retry-After should be positive, got ${retryAfter}`);

    // The remaining value stays at 0 (never negative) on the 429 too.
    assert.equal(Number(headers.get("x-ratelimit-remaining")), 0);
});

test("FR5-09: a fresh UTC day starts with a fresh allowance", async () => {
    // Write usage for yesterday for the same client; the current day must be
    // unaffected. Simulate yesterday's date string.
    const yesterday = new Date(Date.now() - 86400000);
    const yyyy = yesterday.getUTCFullYear();
    const mm = String(yesterday.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(yesterday.getUTCDate()).padStart(2, "0");
    const yesterdayKey = `${yyyy}-${mm}-${dd}`;

    await clearUsage(DEMO_OAUTH.active.clientId);
    await setUsage(DEMO_OAUTH.active.clientId, yesterdayKey, 999999999);

    // Today still has a full allowance.
    const todayUsage = await getUsage(DEMO_OAUTH.active.clientId, ctx.today);
    assert.equal(todayUsage, null, "today's usage should not inherit yesterday's");

    const { status, headers } = await api("/tickets?limit=1", { token: ctx.oauthToken });
    assert.equal(status, 200);
    assert.equal(Number(headers.get("x-ratelimit-remaining")), env.publicApiDailyCredits - 1);
});

test("FR5-09: two different OAuth clients have independent limits", async () => {
    // Exhaust client A's limit; client B (readOnly) must be unaffected.
    await setUsage(DEMO_OAUTH.active.clientId, ctx.today, env.publicApiDailyCredits);
    await clearUsage(DEMO_OAUTH.readOnly.clientId);

    const exhaustedA = await api("/tickets?limit=1", { token: ctx.oauthToken });
    assert.equal(exhaustedA.status, 429);

    const clientB = await api("/tickets?limit=1", { token: ctx.readOnlyToken });
    assert.equal(clientB.status, 200);
    assert.equal(
        Number(clientB.headers.get("x-ratelimit-remaining")),
        env.publicApiDailyCredits - 1,
        "client B should have its own full allowance"
    );
});

test("FR5-09: invalid OAuth authentication is still rejected (and not rate limited)", async () => {
    // Reset client's usage so a bad token must NOT count against it.
    await clearUsage(DEMO_OAUTH.active.clientId);

    const { status, headers } = await api("/tickets", { token: "definitely-not-a-token" });
    assert.equal(status, 401);
    // No rate-limit headers because the client was never identified.
    assert.equal(headers.get("x-ratelimit-limit"), null);
});

test("FR5-09: missing OAuth scope is still rejected", async () => {
    // The contacts client lacks tickets.READ. Reset usage and make sure the
    // scope failure still 403s and the client is still usable afterwards.
    await clearUsage(DEMO_OAUTH.contactsRead.clientId);

    const { status } = await api("/tickets?limit=1", { token: ctx.contactsToken });
    assert.equal(status, 403);
});

test("FR5-09: portal JWT (internal) requests are NOT rate limited", async () => {
    // A portal JWT accessing the public ticket surface must not consume
    // credits and must not be rate limited - exhaust the active client to
    // prove the two are independent.
    await setUsage(DEMO_OAUTH.active.clientId, ctx.today, env.publicApiDailyCredits);

    const { status, headers } = await api("/tickets?limit=1", { token: ctx.adminToken });
    assert.equal(status, 200);
    // The portal path should not receive rate-limit headers at all.
    assert.equal(headers.get("x-ratelimit-limit"), null);
});

test("FR5-09: internal (non-FR5) APIs are not rate limited", async () => {
    // Portal JWT to an internal endpoint.
    const { status, headers } = await api("/incidents?limit=1", { token: ctx.adminToken });
    assert.equal(status, 200);
    assert.equal(headers.get("x-ratelimit-limit"), null);
    assert.equal(headers.get("x-ratelimit-remaining"), null);
});

test("FR5-09: concurrent requests cannot bypass the daily limit", async () => {
    // Configure a small effective ceiling by seeding usage to limit-k that
    // correspond to the configured limit. Then fire many parallel requests and
    // assert that at most `limit` succeed.
    const limit = env.publicApiDailyCredits;
    // Clear and seed usage to (limit - 1): only ONE more request can pass.
    await clearUsage(DEMO_OAUTH.contactsRead.clientId);
    // Use a read scope available to this client through /contacts.
    await setUsage(DEMO_OAUTH.contactsRead.clientId, ctx.today, limit - 1);

    const requests = Array.from({ length: 10 }, () =>
        api("/contacts?limit=1", { token: ctx.contactsToken })
    );
    const results = await Promise.all(requests);

    const successes = results.filter((r) => r.status === 200).length;
    const rejected = results.filter((r) => r.status === 429).length;

    // Exactly one may succeed (the (limit-1)th + 1 = limit).
    assert.equal(successes, 1, `expected exactly 1 success, got ${successes}`);
    assert.equal(rejected, 9, `expected 9 rejected, got ${rejected}`);
});
