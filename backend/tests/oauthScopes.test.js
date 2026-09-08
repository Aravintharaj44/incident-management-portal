const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const jwt = require("jsonwebtoken");
const { env } = require("../src/config/env");
const { issueAccessToken } = require("../src/services/oauthService");
const { DEMO_OAUTH } = require("../src/seed/oauthDemoData");

/**
 * End-to-end tests for FR5-03 - Scoped Access Control for OAuth 2.0 tokens.
 *
 *   1. npm run seed        (creates the demo OAuth clients with scopes)
 *   2. npm start           (in another terminal)
 *   3. npm test
 *
 * The demo clients are seeded with specific scope configurations:
 *
 *   demo-oauth-client        -> tickets.READ, tickets.WRITE, tickets.ALL
 *   read-only-oauth-client   -> tickets.READ
 *   contacts-read-oauth-     -> contacts.READ
 *   revoked-oauth-client     -> tickets.READ, tickets.WRITE (inactive)
 *
 * The active demo client is bound to the admin service account so that
 * DELETE (admin-only) can be tested through the scope layer.
 */

const BASE = process.env.TEST_API_URL || "http://localhost:5000/api/v1";
const PASSWORD = "Password123";

const ACCOUNTS = {
    admin: "admin@zybisys.com",
};

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
    try { parsed = JSON.parse(text); } catch { parsed = text; }
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

const requestToken = async ({
    clientId,
    clientSecret,
    grantType = "client_credentials",
    scope,
} = {}) => {
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
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: response.status, body };
};

// Shared state between the ordered tests.
const ctx = {};

// Refresh the admin portal token and capture a real seeded category id.
test("FR5-03 setup: admin login and fetch a category id", async () => {
    ctx.portalToken = await login(ACCOUNTS.admin);

    const categories = await api("/categories", { token: ctx.portalToken });
    assert.equal(categories.status, 200, JSON.stringify(categories.body));
    const network = categories.body.data.categories.find(
        (category) => category.name === "Network"
    );
    assert.ok(network, "Network category not found in the seeded data");
    ctx.categoryId = network._id;
});

// ------------------------------------------------------------------
// Token scope tests
// ------------------------------------------------------------------

test("FR5-03: client requests an allowed single scope", async () => {
    const { status, body } = await requestToken({
        clientId: DEMO_OAUTH.active.clientId,
        clientSecret: DEMO_OAUTH.active.clientSecret,
        scope: "tickets.READ",
    });

    assert.equal(status, 200, JSON.stringify(body));
    assert.ok(body.access_token);
    assert.equal(body.token_type, "Bearer");
    assert.equal(body.scope, "tickets.READ");

    ctx.readToken = body.access_token;
});

test("FR5-03: client requests multiple allowed scopes", async () => {
    const { status, body } = await requestToken({
        clientId: DEMO_OAUTH.active.clientId,
        clientSecret: DEMO_OAUTH.active.clientSecret,
        scope: "tickets.READ tickets.WRITE",
    });

    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.scope, "tickets.READ tickets.WRITE");

    ctx.readWriteToken = body.access_token;
});

test("FR5-03: client requests tickets.ALL scope", async () => {
    const { status, body } = await requestToken({
        clientId: DEMO_OAUTH.active.clientId,
        clientSecret: DEMO_OAUTH.active.clientSecret,
        scope: "tickets.ALL",
    });

    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.scope, "tickets.ALL");

    ctx.allToken = body.access_token;
});

test("FR5-03: client requests unauthorized scope -> invalid_scope", async () => {
    const { status, body } = await requestToken({
        clientId: DEMO_OAUTH.active.clientId,
        clientSecret: DEMO_OAUTH.active.clientSecret,
        scope: "contacts.READ",
    });

    assert.equal(status, 400, JSON.stringify(body));
    assert.equal(body.error, "invalid_scope");
    assert.ok(!body.access_token);
});

test("FR5-03: client requests unknown scope -> invalid_scope", async () => {
    const { status, body } = await requestToken({
        clientId: DEMO_OAUTH.active.clientId,
        clientSecret: DEMO_OAUTH.active.clientSecret,
        scope: "bogus.SCOPE",
    });

    assert.equal(status, 400, JSON.stringify(body));
    assert.equal(body.error, "invalid_scope");
});

test("FR5-03: client requests mixed allowed and unauthorized scope -> invalid_scope (no partial grant)", async () => {
    const { status, body } = await requestToken({
        clientId: DEMO_OAUTH.active.clientId,
        clientSecret: DEMO_OAUTH.active.clientSecret,
        scope: "tickets.READ contacts.READ",
    });

    assert.equal(status, 400, JSON.stringify(body));
    assert.equal(body.error, "invalid_scope");
});

test("FR5-03: no scope requested -> default = all client scopes", async () => {
    const { status, body } = await requestToken({
        clientId: DEMO_OAUTH.active.clientId,
        clientSecret: DEMO_OAUTH.active.clientSecret,
    });

    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.scope, "tickets.READ tickets.WRITE tickets.ALL");

    ctx.defaultToken = body.access_token;
});

test("FR5-03: empty scope string -> invalid_scope", async () => {
    const { status, body } = await requestToken({
        clientId: DEMO_OAUTH.active.clientId,
        clientSecret: DEMO_OAUTH.active.clientSecret,
        scope: "   ",
    });

    assert.equal(status, 400, JSON.stringify(body));
    assert.equal(body.error, "invalid_scope");
});

test("FR5-03: token contains granted scopes in JWT claim", async () => {
    const { status, body } = await requestToken({
        clientId: DEMO_OAUTH.active.clientId,
        clientSecret: DEMO_OAUTH.active.clientSecret,
        scope: "tickets.READ tickets.WRITE",
    });

    assert.equal(status, 200, JSON.stringify(body));
    const claims = jwt.decode(body.access_token);
    assert.equal(claims.scope, "tickets.READ tickets.WRITE");
});

test("FR5-03: read-only client can only request its assigned scopes", async () => {
    // Requesting tickets.READ (allowed) works
    const { status: s1, body: b1 } = await requestToken({
        clientId: DEMO_OAUTH.readOnly.clientId,
        clientSecret: DEMO_OAUTH.readOnly.clientSecret,
        scope: "tickets.READ",
    });
    assert.equal(s1, 200, JSON.stringify(b1));
    assert.equal(b1.scope, "tickets.READ");
    ctx.readOnlyToken = b1.access_token;

    // Requesting tickets.WRITE (not allowed) fails
    const { status: s2, body: b2 } = await requestToken({
        clientId: DEMO_OAUTH.readOnly.clientId,
        clientSecret: DEMO_OAUTH.readOnly.clientSecret,
        scope: "tickets.WRITE",
    });
    assert.equal(s2, 400, JSON.stringify(b2));
    assert.equal(b2.error, "invalid_scope");
});

// ------------------------------------------------------------------
// Ticket authorization tests
// ------------------------------------------------------------------

test("FR5-03: tickets.READ token -> GET /tickets succeeds", async () => {
    const { status, body } = await api("/tickets?limit=5", { token: ctx.readToken });
    assert.equal(status, 200, JSON.stringify(body));
    assert.ok(Array.isArray(body.data.tickets));
    ctx.firstTicketId = body.data.tickets[0].id;
});

test("FR5-03: tickets.READ token -> GET /tickets/:id succeeds", async () => {
    const { status, body } = await api(`/tickets/${ctx.firstTicketId}`, { token: ctx.readToken });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.data.ticket.id, ctx.firstTicketId);
});

test("FR5-03: tickets.READ token -> POST /tickets rejected (403)", async () => {
    const { status, body } = await api("/tickets", {
        method: "POST",
        token: ctx.readToken,
        body: {
            subject: "Should not be created",
            description: "This request should be rejected by scope check.",
            category: ctx.categoryId,
        },
    });

    assert.equal(status, 403, JSON.stringify(body));
    assert.equal(body.error, "insufficient_scope");
});

test("FR5-03: tickets.READ token -> PATCH /tickets/:id rejected (403)", async () => {
    const { status, body } = await api(`/tickets/${ctx.firstTicketId}`, {
        method: "PATCH",
        token: ctx.readToken,
        body: { subject: "Should not be updated" },
    });

    assert.equal(status, 403, JSON.stringify(body));
    assert.equal(body.error, "insufficient_scope");
});

test("FR5-03: tickets.READ token -> DELETE /tickets/:id rejected (403)", async () => {
    const { status, body } = await api(`/tickets/${ctx.firstTicketId}`, {
        method: "DELETE",
        token: ctx.readToken,
    });

    assert.equal(status, 403, JSON.stringify(body));
    assert.equal(body.error, "insufficient_scope");
});

test("FR5-03: tickets.WRITE token -> POST /tickets succeeds", async () => {
    const { status, body } = await api("/tickets", {
        method: "POST",
        token: ctx.readWriteToken,
        body: {
            subject: "FR5-03 scope WRITE test ticket",
            description: "Created by a token with tickets.WRITE scope only.",
            category: ctx.categoryId,
        },
    });

    assert.equal(status, 201, JSON.stringify(body));
    assert.ok(body.data.ticket);
    ctx.writeCreatedId = body.data.ticket.id;
});

test("FR5-03: tickets.WRITE token -> PATCH /tickets/:id succeeds", async () => {
    const { status, body } = await api(`/tickets/${ctx.writeCreatedId}`, {
        method: "PATCH",
        token: ctx.readWriteToken,
        body: { subject: "FR5-03 scope WRITE test ticket (patched)" },
    });

    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.data.ticket.subject, "FR5-03 scope WRITE test ticket (patched)");
});

test("FR5-03: tickets.WRITE token -> DELETE /tickets/:id succeeds (admin-bound client)", async () => {
    const { status, body } = await api(`/tickets/${ctx.writeCreatedId}`, {
        method: "DELETE",
        token: ctx.readWriteToken,
    });

    assert.equal(status, 200, JSON.stringify(body));
});

test("FR5-03: tickets.WRITE token -> GET /tickets rejected (403)", async () => {
    // A dedicated WRITE-only token (no tickets.READ scope).
    const { status: s, body: b } = await requestToken({
        clientId: DEMO_OAUTH.active.clientId,
        clientSecret: DEMO_OAUTH.active.clientSecret,
        scope: "tickets.WRITE",
    });
    assert.equal(s, 200, JSON.stringify(b));
    assert.equal(b.scope, "tickets.WRITE");

    const { status, body } = await api("/tickets?limit=5", { token: b.access_token });
    assert.equal(status, 403, JSON.stringify(body));
    assert.equal(body.error, "insufficient_scope");
});

test("FR5-03: tickets.ALL token -> GET /tickets succeeds", async () => {
    const { status, body } = await api("/tickets?limit=5", { token: ctx.allToken });
    assert.equal(status, 200, JSON.stringify(body));
    assert.ok(Array.isArray(body.data.tickets));
});

test("FR5-03: tickets.ALL token -> GET /tickets/:id succeeds", async () => {
    const { status, body } = await api(`/tickets/${ctx.firstTicketId}`, { token: ctx.allToken });
    assert.equal(status, 200, JSON.stringify(body));
});

test("FR5-03: tickets.ALL token -> POST /tickets succeeds", async () => {
    const { status, body } = await api("/tickets", {
        method: "POST",
        token: ctx.allToken,
        body: {
            subject: "FR5-03 scope ALL test ticket",
            description: "Created by a token with tickets.ALL scope.",
            category: ctx.categoryId,
        },
    });

    assert.equal(status, 201, JSON.stringify(body));
    ctx.allCreatedId = body.data.ticket.id;
});

test("FR5-03: tickets.ALL token -> PATCH /tickets/:id succeeds", async () => {
    const { status, body } = await api(`/tickets/${ctx.allCreatedId}`, {
        method: "PATCH",
        token: ctx.allToken,
        body: { subject: "FR5-03 scope ALL test ticket (patched)" },
    });

    assert.equal(status, 200, JSON.stringify(body));
});

test("FR5-03: tickets.ALL token -> DELETE /tickets/:id succeeds", async () => {
    const { status, body } = await api(`/tickets/${ctx.allCreatedId}`, {
        method: "DELETE",
        token: ctx.allToken,
    });

    assert.equal(status, 200, JSON.stringify(body));
});

test("FR5-03: valid token with unrelated scope (contacts.READ) -> rejected on ticket endpoints", async () => {
    const { status, body } = await requestToken({
        clientId: DEMO_OAUTH.contactsRead.clientId,
        clientSecret: DEMO_OAUTH.contactsRead.clientSecret,
        scope: "contacts.READ",
    });

    assert.equal(status, 200, JSON.stringify(body));
    const contactsToken = body.access_token;

    const r1 = await api("/tickets?limit=5", { token: contactsToken });
    assert.equal(r1.status, 403, JSON.stringify(r1.body));
    assert.equal(r1.body.error, "insufficient_scope");

    const r2 = await api("/tickets", {
        method: "POST",
        token: contactsToken,
        body: { subject: "Should fail", description: "Unrelated scope.", category: ctx.categoryId },
    });
    assert.equal(r2.status, 403, JSON.stringify(r2.body));
    assert.equal(r2.body.error, "insufficient_scope");
});

// ------------------------------------------------------------------
// Authentication failure tests (should still be 401, not 403)
// ------------------------------------------------------------------

test("FR5-03: missing bearer token -> 401 (not 403)", async () => {
    const { status } = await api("/tickets");
    assert.equal(status, 401);
});

test("FR5-03: invalid bearer token -> 401 (not 403)", async () => {
    const { status } = await api("/tickets", { token: "not-a-jwt" });
    assert.equal(status, 401);
});

test("FR5-03: expired access token -> 401 (not 403)", async () => {
    const expired = issueAccessToken({
        client: { clientId: DEMO_OAUTH.active.clientId },
        scope: "tickets.READ",
        expiresIn: -60,
    });

    const { status } = await api("/tickets", { token: expired });
    assert.equal(status, 401);
});

// ------------------------------------------------------------------
// Portal JWT backward compatibility
// ------------------------------------------------------------------

test("FR5-03: portal JWT still works and is not subject to scope checks", async () => {
    const portalToken = await login(ACCOUNTS.admin);

    const r1 = await api("/tickets?limit=5", { token: portalToken });
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assert.ok(Array.isArray(r1.body.data.tickets));

    // Portal JWT can still do POST without OAuth scopes
    const r2 = await api("/tickets", {
        method: "POST",
        token: portalToken,
        body: {
            subject: "FR5-03 portal JWT backward compat ticket",
            description: "Created with a portal JWT, no scope checks.",
            category: ctx.categoryId,
        },
    });
    assert.equal(r2.status, 201, JSON.stringify(r2.body));
});

// ------------------------------------------------------------------
// Default scope behavior
// ------------------------------------------------------------------

test("FR5-03: default token (all scopes) can access all operations", async () => {
    const { status, body } = await api("/tickets?limit=5", { token: ctx.defaultToken });
    assert.equal(status, 200, JSON.stringify(body));
    assert.ok(Array.isArray(body.data.tickets));
});
