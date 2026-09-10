const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");

const { env } = require("../src/config/env");
const OAuthClient = require("../src/models/OAuthClient");
const { DEMO_OAUTH } = require("../src/seed/oauthDemoData");

/**
 * End-to-end tests for FR5-10 - admin OAuth client management at
 * /api/v1/oauth/clients (list, get, create, update, revoke).
 *
 *   1. npm run seed        (creates the demo OAuth clients + accounts)
 *   2. npm start           (in another terminal)
 *   3. npm test
 *
 * The client-management endpoints are private and admin-only, so everything
 * here authenticates with a portal admin JWT - an OAuth bearer token must NOT
 * work on them. Created clients are removed again via a direct DB round-trip
 * in the final test (oauth.test.js precedent).
 */

const BASE = process.env.TEST_API_URL || "http://localhost:5000/api/v1";
const PASSWORD = "Password123";

const ACCOUNTS = {
    admin: "admin@zybisys.com",
    agent: "rahul.agent@zybisys.com",
    user: "karthik@zybisys.com",
};

/** fetch wrapper returning { status, body }. */
const api = async (pathName, { method = "GET", token, body } = {}) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers["Content-Type"] = "application/json";

    const response = await fetch(`${BASE}${pathName}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
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
    return body.data;
};

const basicAuth = (clientId, clientSecret) =>
    `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;

const requestToken = async ({ clientId, clientSecret } = {}) => {
    const response = await fetch(`${BASE}/oauth/token`, {
        method: "POST",
        headers: {
            Authorization: basicAuth(clientId, clientSecret),
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
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
const ctx = { created: [] };

// Direct-DB helper used only for cleanup (there is intentionally no DELETE
// endpoint - clients are revoked, never removed, over HTTP).
const withDb = async (fn) => {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
    try {
        return await fn();
    } finally {
        await mongoose.disconnect();
    }
};

test("FR5-10 setup: log in as an admin, an agent and a regular user", async () => {
    const admin = await login(ACCOUNTS.admin);
    ctx.adminToken = admin.token;
    ctx.adminId = admin.user.id;

    const agent = await login(ACCOUNTS.agent);
    ctx.agentToken = agent.token;

    const user = await login(ACCOUNTS.user);
    ctx.userToken = user.token;
    ctx.userId = user.user.id;
});

test("FR5-10: admin can list OAuth clients", async () => {
    const { status, body } = await api("/oauth/clients", { token: ctx.adminToken });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.success, true);

    const { items, pagination } = body.data;
    assert.ok(Array.isArray(items));
    assert.equal(pagination.page, 1);

    // The seeded demo clients must be present.
    const clientIds = items.map((item) => item.clientId);
    assert.ok(clientIds.includes(DEMO_OAUTH.active.clientId), JSON.stringify(clientIds));

    // No secret material may ever leak from the list.
    const raw = JSON.stringify(body);
    assert.ok(!raw.includes(DEMO_OAUTH.active.clientSecret));
    assert.ok(!raw.includes("clientSecretHash"));
});

test("FR5-10: list search matches clientId", async () => {
    const { status, body } = await api(
        `/oauth/clients?search=${encodeURIComponent(DEMO_OAUTH.active.clientId)}`,
        { token: ctx.adminToken }
    );
    assert.equal(status, 200, JSON.stringify(body));
    const ids = body.data.items.map((item) => item.clientId);
    assert.ok(ids.includes(DEMO_OAUTH.active.clientId));
});

test("FR5-10: list isActive filter returns revoked clients", async () => {
    const { status, body } = await api("/oauth/clients?isActive=false", {
        token: ctx.adminToken,
    });
    assert.equal(status, 200, JSON.stringify(body));
    const ids = body.data.items.map((item) => item.clientId);
    assert.ok(ids.includes(DEMO_OAUTH.revoked.clientId));
    assert.ok(!ids.includes(DEMO_OAUTH.active.clientId));
});

test("FR5-10: admin can fetch a single client", async () => {
    const { status, body: listBody } = await api("/oauth/clients", { token: ctx.adminToken });
    assert.equal(status, 200, JSON.stringify(listBody));

    // Get the demo active client by its id.
    const demo = listBody.data.items.find(
        (item) => item.clientId === DEMO_OAUTH.active.clientId
    );
    assert.ok(demo, "demo active client not found in list");

    const { status: getStatus, body } = await api(`/oauth/clients/${demo.id}`, {
        token: ctx.adminToken,
    });
    assert.equal(getStatus, 200, JSON.stringify(body));

    const client = body.data.client;
    assert.equal(client.id, demo.id);
    assert.equal(client.clientId, DEMO_OAUTH.active.clientId);
    assert.ok(client.name);
    assert.ok(client.user);
    assert.ok(Array.isArray(client.scopes));
    assert.equal(typeof client.isActive, "boolean");

    const raw = JSON.stringify(body);
    assert.ok(!raw.includes(DEMO_OAUTH.active.clientSecret));
});

test("FR5-10: an agent (non-admin) is forbidden from client management", async () => {
    assert.equal((await api("/oauth/clients", { token: ctx.agentToken })).status, 403);
    assert.equal(
        (await api("/oauth/clients", {
            method: "POST",
            token: ctx.agentToken,
            body: { name: "No", user: ctx.agentToken, scopes: ["tickets.READ"] },
        })).status,
        403
    );
});

test("FR5-10: an OAuth token cannot access client management", async () => {
    const token = await requestToken({
        clientId: DEMO_OAUTH.active.clientId,
        clientSecret: DEMO_OAUTH.active.clientSecret,
    });
    assert.equal(token.status, 200);
    assert.equal((await api("/oauth/clients", { token: token.body.access_token })).status, 401);
});

test("FR5-10: create returns a client and a one-time secret", async () => {
    const { status, body } = await api("/oauth/clients", {
        method: "POST",
        token: ctx.adminToken,
        body: {
            name: `FR5-10 Test Client ${Date.now()}`,
            description: "Created by the FR5-10 test suite",
            user: ctx.adminId,
            scopes: ["tickets.READ", "tickets.WRITE"],
        },
    });
    assert.equal(status, 201, JSON.stringify(body));

    const { client, clientSecret, note } = body.data;
    assert.ok(client.clientId, "expected a generated clientId");
    assert.ok(typeof clientSecret === "string" && clientSecret.length >= 32);
    assert.ok(note);

    // The record itself must not echo the secret.
    assert.ok(!JSON.stringify(client).includes(clientSecret));

    ctx.created.push(client.id);
    ctx.createdClient = { ...client, clientSecret };
});

test("FR5-10: the created client can obtain a token with its one-time secret", async () => {
    const token = await requestToken({
        clientId: ctx.createdClient.clientId,
        clientSecret: ctx.createdClient.clientSecret,
    });
    assert.equal(token.status, 200, JSON.stringify(token.body));
    assert.ok(token.body.access_token);
});

test("FR5-10: create with a non-staff service account is rejected", async () => {
    const { status, body } = await api("/oauth/clients", {
        method: "POST",
        token: ctx.adminToken,
        body: {
            name: "Should Not Persist",
            user: ctx.userId, // karthik is a plain user, not staff
            scopes: ["tickets.READ"],
        },
    });
    assert.equal(status, 400, JSON.stringify(body));
    assert.match(String(body.message).toLowerCase(), /staff|privileges/);
});

test("FR5-10: create with an unknown service account is rejected", async () => {
    const { status, body } = await api("/oauth/clients", {
        method: "POST",
        token: ctx.adminToken,
        body: {
            name: "Should Not Persist Either",
            user: new mongoose.Types.ObjectId().toString(),
            scopes: ["tickets.READ"],
        },
    });
    assert.equal(status, 400, JSON.stringify(body));
});

test("FR5-10: create with invalid scopes is rejected (422)", async () => {
    const { status, body } = await api("/oauth/clients", {
        method: "POST",
        token: ctx.adminToken,
        body: { name: "Bad Scopes", user: ctx.adminId, scopes: ["not.a.real.scope"] },
    });
    assert.equal(status, 422, JSON.stringify(body));
    assert.equal(body.success, false);
    assert.ok(Array.isArray(body.errors));
});

test("FR5-10: create without a name is rejected (422)", async () => {
    const { status, body } = await api("/oauth/clients", {
        method: "POST",
        token: ctx.adminToken,
        body: { user: ctx.adminId, scopes: ["tickets.READ"] },
    });
    assert.equal(status, 422, JSON.stringify(body));
});

test("FR5-10: update changes name, description and scopes", async () => {
    const { status, body } = await api(`/oauth/clients/${ctx.createdClient.id}`, {
        method: "PATCH",
        token: ctx.adminToken,
        body: {
            name: "FR5-10 Test Client (updated)",
            description: "Updated description",
            scopes: ["tickets.READ"],
        },
    });
    assert.equal(status, 200, JSON.stringify(body));

    const client = body.data.client;
    assert.equal(client.name, "FR5-10 Test Client (updated)");
    assert.equal(client.description, "Updated description");
    assert.deepEqual(client.scopes, ["tickets.READ"]);
});

test("FR5-10: update to a non-staff service account is rejected", async () => {
    const { status, body } = await api(`/oauth/clients/${ctx.createdClient.id}`, {
        method: "PATCH",
        token: ctx.adminToken,
        body: { user: ctx.userId },
    });
    assert.equal(status, 400, JSON.stringify(body));
});

test("FR5-10: patching isActive=false revokes, true re-activates", async () => {
    const revoke = await api(`/oauth/clients/${ctx.createdClient.id}`, {
        method: "PATCH",
        token: ctx.adminToken,
        body: { isActive: false },
    });
    assert.equal(revoke.status, 200, JSON.stringify(revoke.body));
    assert.equal(revoke.body.data.client.isActive, false);
    assert.ok(revoke.body.data.client.revokedAt, "expected revokedAt to be recorded");

    // A deactivated client can no longer obtain tokens.
    const denied = await requestToken({
        clientId: ctx.createdClient.clientId,
        clientSecret: ctx.createdClient.clientSecret,
    });
    assert.equal(denied.status, 401, JSON.stringify(denied.body));

    // Re-activating clears revokedAt and restores the ability to get tokens.
    const reactivate = await api(`/oauth/clients/${ctx.createdClient.id}`, {
        method: "PATCH",
        token: ctx.adminToken,
        body: { isActive: true },
    });
    assert.equal(reactivate.status, 200, JSON.stringify(reactivate.body));
    assert.equal(reactivate.body.data.client.isActive, true);
    assert.equal(reactivate.body.data.client.revokedAt, null);

    const allowed = await requestToken({
        clientId: ctx.createdClient.clientId,
        clientSecret: ctx.createdClient.clientSecret,
    });
    assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
});

test("FR5-10: the revoke endpoint records isActive=false + revokedAt", async () => {
    const { status, body } = await api(`/oauth/clients/${ctx.createdClient.id}/revoke`, {
        method: "POST",
        token: ctx.adminToken,
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.data.client.isActive, false);
    assert.ok(body.data.client.revokedAt, "expected revokedAt to be recorded");

    // Revoking is idempotent.
    const again = await api(`/oauth/clients/${ctx.createdClient.id}/revoke`, {
        method: "POST",
        token: ctx.adminToken,
    });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(again.body.data.client.isActive, false);
});

test("FR5-10: an unknown client id returns 404", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    assert.equal((await api(`/oauth/clients/${id}`, { token: ctx.adminToken })).status, 404);
    assert.equal(
        (await api(`/oauth/clients/${id}/revoke`, { method: "POST", token: ctx.adminToken })).status,
        404
    );
});

test("FR5-10: a malformed client id returns 422", async () => {
    assert.equal((await api("/oauth/clients/not-an-object-id", { token: ctx.adminToken })).status, 422);
});

test("FR5-10 cleanup: remove the clients created by this suite", async () => {
    if (ctx.created.length === 0) return;
    await withDb(() => OAuthClient.deleteMany({ _id: { $in: ctx.created } }));
    const remaining = await withDb(() => OAuthClient.countDocuments({ _id: { $in: ctx.created } }));
    assert.equal(remaining, 0);
});