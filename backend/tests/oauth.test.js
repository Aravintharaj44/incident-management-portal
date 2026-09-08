const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const { env } = require("../src/config/env");
const OAuthClient = require("../src/models/OAuthClient");
const { issueAccessToken } = require("../src/services/oauthService");
const { DEMO_OAUTH } = require("../src/seed/oauthDemoData");

/**
 * End-to-end tests for FR5-02 - OAuth 2.0 client-credentials authentication
 * for the public REST API.
 *
 *   1. npm run seed        (creates the demo OAuth clients)
 *   2. npm start           (in another terminal)
 *   3. npm test
 *
 * Most cases are plain HTTP against the running server, mirroring
 * tickets.test.js. Two cases need machinery the server does not expose over
 * HTTP - an *expired* token (signed here with the same production service so
 * the only difference is its lifetime) and a check that the client secret is
 * not stored in plaintext (a direct DB round-trip, kb.test.js precedent).
 */

const BASE = process.env.TEST_API_URL || "http://localhost:5000/api/v1";
const PASSWORD = "Password123";

const ACCOUNTS = {
    admin: "admin@zybisys.com",
    agent: "rahul.agent@zybisys.com",
};

/** Thin fetch wrapper returning { status, body } so tests can assert on both. */
const api = async (path, { method = "GET", token, body, raw } = {}) => {
    const headers = {};
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

    return { status: response.status, body: parsed };
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

/**
 * Calls POST /oauth/token. By default credentials go via HTTP Basic and
 * `grant_type` via a urlencoded form body; use `credsInBody: true` to send the
 * credentials as form fields instead.
 */
const requestToken = async ({
    clientId,
    clientSecret,
    grantType = "client_credentials",
    credsInBody = false,
} = {}) => {
    const headers = { "Content-Type": "application/x-www-form-urlencoded" };
    if (!credsInBody && clientId !== undefined) headers.Authorization = basicAuth(clientId, clientSecret);

    const params = new URLSearchParams();
    if (grantType) params.set("grant_type", grantType);
    if (credsInBody && clientId !== undefined) {
        params.set("client_id", clientId);
        params.set("client_secret", clientSecret);
    }

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
    return { status: response.status, body };
};

// Shared state between the ordered tests below.
const ctx = {};

test("FR5-02: valid client credentials issue a bearer token", async () => {
    const { status, body } = await requestToken({
        clientId: DEMO_OAUTH.active.clientId,
        clientSecret: DEMO_OAUTH.active.clientSecret,
    });

    assert.equal(status, 200, JSON.stringify(body));

    // RFC 6749 token response shape.
    assert.ok(typeof body.access_token === "string" && body.access_token.length > 20);
    assert.equal(body.token_type, "Bearer");
    assert.ok(Number.isInteger(body.expires_in) && body.expires_in > 0);

    // The plaintext secret must never be echoed anywhere in the response.
    assert.ok(!JSON.stringify(body).includes(DEMO_OAUTH.active.clientSecret));

    ctx.accessToken = body.access_token;
});

test("FR5-02: credentials also work in the request body", async () => {
    const { status, body } = await requestToken({
        clientId: DEMO_OAUTH.active.clientId,
        clientSecret: DEMO_OAUTH.active.clientSecret,
        credsInBody: true,
    });

    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.token_type, "Bearer");
    ctx.bodyToken = body.access_token;
});

test("FR5-02: unknown client id is rejected", async () => {
    const { status, body } = await requestToken({
        clientId: "no-such-client",
        clientSecret: DEMO_OAUTH.active.clientSecret,
    });

    assert.equal(status, 401);
    assert.equal(body.error, "invalid_client");
    assert.ok(!JSON.stringify(body).includes(DEMO_OAUTH.active.clientSecret));
});

test("FR5-02: wrong client secret is rejected", async () => {
    const { status, body } = await requestToken({
        clientId: DEMO_OAUTH.active.clientId,
        clientSecret: "definitely-wrong-secret",
    });

    assert.equal(status, 401);
    assert.equal(body.error, "invalid_client");
    // Same generic message as an unknown client - nothing is revealed.
    assert.ok(!JSON.stringify(body).includes("client_secret"));
});

test("FR5-02: missing credentials are rejected", async () => {
    const { status, body } = await requestToken({});
    assert.equal(status, 401);
    assert.equal(body.error, "invalid_client");
});

test("FR5-02: missing grant_type is an invalid_request", async () => {
    const { status, body } = await requestToken({
        clientId: DEMO_OAUTH.active.clientId,
        clientSecret: DEMO_OAUTH.active.clientSecret,
        grantType: null, // leaves the form field out entirely
    });

    assert.equal(status, 400);
    assert.equal(body.error, "invalid_request");
});

test("FR5-02: unsupported grant_type is refused", async () => {
    const { status, body } = await requestToken({
        clientId: DEMO_OAUTH.active.clientId,
        clientSecret: DEMO_OAUTH.active.clientSecret,
        grantType: "authorization_code",
    });

    assert.equal(status, 400);
    assert.equal(body.error, "unsupported_grant_type");
});

test("FR5-02: access token lists tickets", async () => {
    const { status, body } = await api("/tickets?limit=100", { token: ctx.accessToken });

    assert.equal(status, 200, JSON.stringify(body));
    assert.ok(Array.isArray(body.data.tickets));
    assert.ok(body.data.tickets.length >= 5, "expected the seeded ticket queue");

    ctx.firstTicketId = body.data.tickets[0].id;
});

test("FR5-02: access token fetches a single ticket", async () => {
    const { status, body } = await api(`/tickets/${ctx.firstTicketId}`, {
        token: ctx.accessToken,
    });

    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.data.ticket.id, ctx.firstTicketId);
});

test("FR5-02: tickets reject missing Authorization", async () => {
    assert.equal((await api("/tickets")).status, 401);
});

test("FR5-02: tickets reject a malformed/non-Bearer header", async () => {
    const response = await fetch(`${BASE}/tickets`, {
        headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });
    assert.equal(response.status, 401);

    const emptyBearer = await fetch(`${BASE}/tickets`, {
        headers: { Authorization: "Bearer " },
    });
    assert.equal(emptyBearer.status, 401);
});

test("FR5-02: tickets reject a garbage bearer token", async () => {
    assert.equal((await api("/tickets", { token: "not-a-jwt" })).status, 401);
});

test("FR5-02: an expired access token is rejected", async () => {
    // The server never issues expired tokens, so one is signed here with the
    // exact production service/config - the only difference is the lifetime.
    const expired = issueAccessToken({
        client: { clientId: DEMO_OAUTH.active.clientId },
        expiresIn: -60,
    });

    const { status } = await api("/tickets", { token: expired });
    assert.equal(status, 401);
});

test("FR5-02: a tampered access token is rejected", async () => {
    const tampered = `${ctx.accessToken.slice(0, -1)}${
        ctx.accessToken.endsWith("a") ? "b" : "a"
    }`;

    assert.notEqual(tampered, ctx.accessToken);
    const { status } = await api("/tickets", { token: tampered });
    assert.equal(status, 401);
});

test("FR5-02: a revoked client cannot obtain new tokens", async () => {
    const { status, body } = await requestToken({
        clientId: DEMO_OAUTH.revoked.clientId,
        clientSecret: DEMO_OAUTH.revoked.clientSecret,
    });

    assert.equal(status, 401);
    assert.equal(body.error, "invalid_client");
});

test("FR5-02: portal login still works and its JWT still authenticates", async () => {
    ctx.adminToken = await login(ACCOUNTS.admin);

    // Portal JWT still works on the shared ticket endpoints...
    assert.equal((await api("/tickets", { token: ctx.adminToken })).status, 200);
    assert.equal((await api("/incidents", { token: ctx.adminToken })).status, 200);

    // ...and on its own portal-only surface.
    assert.equal((await api("/auth/me", { token: ctx.adminToken })).status, 200);
});

test("FR5-02: incidents are unaffected by OAuth", async () => {
    const { status, body } = await api("/incidents", { token: ctx.adminToken });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.data.items));
});

test("FR5-02: an OAuth token cannot access portal-only resources", async () => {
    // /incidents is protected by the portal JWT verifier only. An OAuth access
    // token is signed with the separate OAuth secret, so it must be refused.
    assert.equal((await api("/incidents", { token: ctx.accessToken })).status, 401);
});

test("FR5-02: the client secret is never stored in plaintext (DB round-trip)", async () => {
    // Single direct-DB case: HTTP alone cannot observe what the model persisted.
    // kb.test.js already establishes this pattern of a DB-connected test.
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });

    const plaintext = `seed-test-${crypto.randomBytes(8).toString("hex")}`;

    const created = await OAuthClient.create({
        clientId: `test-${crypto.randomBytes(8).toString("hex")}`,
        clientSecretHash: plaintext,
        name: "OAuth e2e check",
        user: new mongoose.Types.ObjectId(),
        isActive: true,
    });

    try {
        const stored = await OAuthClient.findById(created._id).select("+clientSecretHash");

        assert.ok(stored, "client should exist");
        assert.notEqual(stored.clientSecretHash, plaintext);
        assert.match(stored.clientSecretHash, /^\$2[a-z]?\$/);
        assert.equal(await bcrypt.compare(plaintext, stored.clientSecretHash), true);
    } finally {
        await OAuthClient.deleteOne({ _id: created._id });
        await mongoose.disconnect();
    }
});