const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { issueAccessToken } = require("../src/services/oauthService");
const { DEMO_OAUTH } = require("../src/seed/oauthDemoData");

/**
 * End-to-end tests for FR5-04 - the public Contacts API (/api/v1/contacts).
 *
 *   1. npm run seed        (creates the demo OAuth clients incl. contacts.READ)
 *   2. npm start           (in another terminal)
 *   3. npm test
 *
 * Contacts reuse the existing User model (End Users only, role "user"), so the
 * public contact shape is `{ id, name, email, isActive, createdAt, updatedAt }`
 * and never leaks passwords, roles or login metadata.
 */

const BASE = process.env.TEST_API_URL || "http://localhost:5000/api/v1";
const PASSWORD = "Password123";

const ACCOUNTS = {
    admin: "admin@zybisys.com",
    user: "karthik@zybisys.com",
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
    return { status: response.status, body };
};

// Shared state between the ordered tests below.
const ctx = {};
const freshEmail = (prefix) => `${prefix}-${Date.now()}@zybisys.com`;

test("FR5-04 setup: contacts.READ and tickets.READ bearer tokens", async () => {
    const contacts = await requestToken({
        clientId: DEMO_OAUTH.contactsRead.clientId,
        clientSecret: DEMO_OAUTH.contactsRead.clientSecret,
        scope: "contacts.READ",
    });
    assert.equal(contacts.status, 200, JSON.stringify(contacts.body));
    ctx.contactsToken = contacts.body.access_token;

    const tickets = await requestToken({
        clientId: DEMO_OAUTH.active.clientId,
        clientSecret: DEMO_OAUTH.active.clientSecret,
        scope: "tickets.READ",
    });
    assert.equal(tickets.status, 200, JSON.stringify(tickets.body));
    ctx.ticketsToken = tickets.body.access_token;

    ctx.adminToken = await login(ACCOUNTS.admin);
});

// ------------------------------------------------------------------
// Authentication tests (missing / invalid / expired tokens)
// ------------------------------------------------------------------

test("FR5-04: GET /contacts without token -> 401", async () => {
    assert.equal((await api("/contacts")).status, 401);
});

test("FR5-04: GET /contacts/:id without token -> 401", async () => {
    assert.equal((await api(`/contacts/64b8f0c2e4a9d1f2a3b4c5d9`)).status, 401);
});

test("FR5-04: POST /contacts without token -> 401", async () => {
    const { status } = await api("/contacts", {
        method: "POST",
        body: { name: "No Token", email: freshEmail("no-token") },
    });
    assert.equal(status, 401);
});

test("FR5-04: PUT /contacts/:id without token -> 401", async () => {
    const { status } = await api(`/contacts/64b8f0c2e4a9d1f2a3b4c5d9`, {
        method: "PUT",
        body: { name: "No Token", email: ACCOUNTS.user },
    });
    assert.equal(status, 401);
});

test("FR5-04: invalid OAuth token -> 401 (not 403)", async () => {
    assert.equal((await api("/contacts", { token: "not-a-jwt" })).status, 401);
});

test("FR5-04: expired OAuth token -> 401 (not 403)", async () => {
    const expired = issueAccessToken({
        client: { clientId: DEMO_OAUTH.contactsRead.clientId },
        scope: "contacts.READ",
        expiresIn: -60,
    });

    assert.equal((await api("/contacts", { token: expired })).status, 401);
});

// ------------------------------------------------------------------
// Scope tests (contacts.READ grants access; unrelated scopes do not)
// ------------------------------------------------------------------

test("FR5-04: contacts.READ token -> GET /contacts succeeds", async () => {
    const { status, body } = await api("/contacts?limit=100", { token: ctx.contactsToken });
    assert.equal(status, 200, JSON.stringify(body));
    assert.ok(Array.isArray(body.data.contacts));
    assert.ok(body.data.contacts.length >= 3, "expected the seeded End User contacts");

    const sample = body.data.contacts[0];
    assert.ok(sample.id);
    assert.ok(sample.name);
    assert.ok(sample.email);
    assert.equal(typeof sample.isActive, "boolean");
    assert.ok("createdAt" in sample);
    assert.ok("updatedAt" in sample);

    // Sensitive/internal fields must never leak.
    assert.equal(sample._id, undefined);
    assert.equal(sample.__v, undefined);
    assert.equal(sample.password, undefined);
    assert.equal(sample.role, undefined);
    assert.equal(sample.lastLoginAt, undefined);

    ctx.firstContactId = sample.id;
    ctx.firstContactEmail = sample.email;
});

test("FR5-04: contacts.READ token -> GET /contacts/:id succeeds", async () => {
    const { status, body } = await api(`/contacts/${ctx.firstContactId}`, {
        token: ctx.contactsToken,
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.data.contact.id, ctx.firstContactId);
    assert.equal(body.data.contact.email, ctx.firstContactEmail);
    assert.equal(body.data.contact.password, undefined);
    assert.equal(body.data.contact.role, undefined);
});

test("FR5-04: contacts.READ token -> POST /contacts succeeds", async () => {
    const { status, body } = await api("/contacts", {
        method: "POST",
        token: ctx.contactsToken,
        body: {
            name: "Ravi Krishnan",
            email: freshEmail("scope-post"),
        },
    });
    assert.equal(status, 201, JSON.stringify(body));
    assert.equal(body.data.contact.name, "Ravi Krishnan");
    ctx.createdId = body.data.contact.id;
});

test("FR5-04: contacts.READ token -> PUT /contacts/:id succeeds", async () => {
    const { status, body } = await api(`/contacts/${ctx.createdId}`, {
        method: "PUT",
        token: ctx.contactsToken,
        body: {
            name: "Ravi K. Krishnan",
            email: freshEmail("scope-put"),
        },
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.data.contact.name, "Ravi K. Krishnan");
});

test("FR5-04: tickets.READ-only token -> Contacts API rejected (403)", async () => {
    const list = await api("/contacts", { token: ctx.ticketsToken });
    assert.equal(list.status, 403, JSON.stringify(list.body));
    assert.equal(list.body.error, "insufficient_scope");

    const posted = await api("/contacts", {
        method: "POST",
        token: ctx.ticketsToken,
        body: { name: "Should Fail", email: freshEmail("scope-denied") },
    });
    assert.equal(posted.status, 403, JSON.stringify(posted.body));
    assert.equal(posted.body.error, "insufficient_scope");
});

// ------------------------------------------------------------------
// CRUD behaviour
// ------------------------------------------------------------------

test("FR5-04: list returns the contact collection with pagination metadata", async () => {
    const { status, body } = await api("/contacts?from=0&limit=2", { token: ctx.contactsToken });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.data.from, 0);
    assert.equal(body.data.limit, 2);
    assert.ok(body.data.contacts.length <= 2);
    assert.equal(body.data.pagination.from, body.data.from);
    assert.equal(body.data.pagination.limit, body.data.limit);
    assert.ok(body.data.count >= body.data.contacts.length);
});

test("FR5-04: list search matches name or email", async () => {
    const { status, body } = await api(`/contacts?search=karthik&limit=100`, {
        token: ctx.contactsToken,
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.ok(body.data.contacts.length >= 1);
    body.data.contacts.forEach((contact) => {
        const term = `${contact.name} ${contact.email}`.toLowerCase();
        assert.ok(term.includes("karthik"), `search returned a non-matching contact: ${term}`);
    });
});

test("FR5-04: GET /contacts/:id returns an existing contact", async () => {
    const { status, body } = await api(`/contacts/${ctx.firstContactId}`, {
        token: ctx.contactsToken,
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.data.contact.id, ctx.firstContactId);
});

test("FR5-04: GET /contacts/:id -> 404 for a nonexistent contact", async () => {
    const { status } = await api("/contacts/64b8f0c2e4a9d1f2a3b4c5d0", {
        token: ctx.contactsToken,
    });
    assert.equal(status, 404);
});

test("FR5-04: GET /contacts/:id -> 422 for an invalid id", async () => {
    const { status, body } = await api("/contacts/not-an-id", { token: ctx.contactsToken });
    assert.equal(status, 422);
    assert.ok(Array.isArray(body.errors));
});

test("FR5-04: POST /contacts creates a valid contact", async () => {
    const email = freshEmail("create");
    const { status, body } = await api("/contacts", {
        method: "POST",
        token: ctx.contactsToken,
        body: { name: "Meera Nair", email },
    });
    assert.equal(status, 201, JSON.stringify(body));
    assert.equal(body.data.contact.name, "Meera Nair");
    assert.equal(body.data.contact.email, email);
    assert.equal(body.data.contact.isActive, true);
    ctx.createdValidId = body.data.contact.id;
});

test("FR5-04: POST /contacts with invalid data -> 422", async () => {
    const { status, body } = await api("/contacts", {
        method: "POST",
        token: ctx.contactsToken,
        body: { name: "x", email: "not-an-email" },
    });
    assert.equal(status, 422);
    assert.ok(Array.isArray(body.errors) && body.errors.length);
    const fields = body.errors.map((error) => error.field);
    assert.ok(fields.includes("name"));
    assert.ok(fields.includes("email"));
});

test("FR5-04: POST /contacts with a duplicate email -> 409", async () => {
    const { status, body } = await api("/contacts", {
        method: "POST",
        token: ctx.contactsToken,
        body: { name: "Duplicate", email: ACCOUNTS.user },
    });
    assert.equal(status, 409, JSON.stringify(body));
});

test("FR5-04: POST /contacts ignores role/password spoofing", async () => {
    const { status, body } = await api("/contacts", {
        method: "POST",
        token: ctx.contactsToken,
        body: {
            name: "Spoof Attempt",
            email: freshEmail("spoof"),
            role: "admin",
            password: "hunter2secret",
            lastLoginAt: new Date(0),
        },
    });
    assert.equal(status, 201, JSON.stringify(body));
    assert.equal(body.data.contact.role, undefined);
    assert.equal(body.data.contact.password, undefined);
    assert.equal(body.data.contact.lastLoginAt, undefined);
});

test("FR5-04: a NoSQL operator in the contact body cannot reach the database", async () => {
    const { status } = await api("/contacts", {
        method: "POST",
        token: ctx.contactsToken,
        body: { name: { $ne: null }, email: { $ne: null } },
    });
    assert.notEqual(status, 201, "NoSQL injection succeeded against contact creation");
});

test("FR5-04: PUT /contacts/:id updates an existing contact", async () => {
    const email = freshEmail("updated");
    const { status, body } = await api(`/contacts/${ctx.createdValidId}`, {
        method: "PUT",
        token: ctx.contactsToken,
        body: {
            name: "Meera I. Nair",
            email,
        },
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.data.contact.name, "Meera I. Nair");
    assert.equal(body.data.contact.isActive, true);
    ctx.currentUpdatedEmail = email;
});

test("FR5-04: PUT /contacts/:id -> 404 for a nonexistent contact", async () => {
    const { status } = await api("/contacts/64b8f0c2e4a9d1f2a3b4c5d0", {
        method: "PUT",
        token: ctx.contactsToken,
        body: { name: "Ghost", email: freshEmail("ghost") },
    });
    assert.equal(status, 404);
});

test("FR5-04: PUT requires name and email -> 400", async () => {
    const { status, body } = await api(`/contacts/${ctx.createdValidId}`, {
        method: "PUT",
        token: ctx.contactsToken,
        body: { name: "Only a name" },
    });
    assert.equal(status, 400, JSON.stringify(body));
});

test("FR5-04: PUT with no actual changes -> 400", async () => {
    const { status, body } = await api(`/contacts/${ctx.createdValidId}`, {
        method: "PUT",
        token: ctx.contactsToken,
        body: {
            name: "Meera I. Nair",
            email: ctx.currentUpdatedEmail,
        },
    });
    assert.equal(status, 400, JSON.stringify(body));
});

test("FR5-04: sensitive authentication fields are never returned", async () => {
    const list = await api("/contacts?limit=100", { token: ctx.contactsToken });
    assert.equal(list.status, 200);
    list.body.data.contacts.forEach((contact) => {
        assert.equal(contact.password, undefined);
        assert.equal(contact.passwordHash, undefined);
        assert.equal(contact.role, undefined);
        assert.equal(contact.lastLoginAt, undefined);
        assert.equal(contact._id, undefined);
        assert.equal(contact.__v, undefined);
    });

    const single = await api(`/contacts/${ctx.createdValidId}`, { token: ctx.contactsToken });
    assert.equal(single.status, 200);
    assert.equal(single.body.data.contact.password, undefined);
    assert.equal(single.body.data.contact.passwordHash, undefined);
    assert.equal(single.body.data.contact._id, undefined);
    assert.equal(single.body.data.contact.__v, undefined);
});

// ------------------------------------------------------------------
// Portal JWT backward compatibility
// ------------------------------------------------------------------

test("FR5-04: a portal JWT still works on /contacts and bypasses scope checks", async () => {
    const list = await api("/contacts?limit=5", { token: ctx.adminToken });
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.ok(Array.isArray(list.body.data.contacts));
});

// ------------------------------------------------------------------
// Contact lifecycle cleanup (deactivate the test-created End Users)
// ------------------------------------------------------------------

test("FR5-04 cleanup: deactivate test contacts via the admin user surface", async () => {
    // Contacts created by this suite persist as dormant End Users; deactivate
    // them through the existing admin surface so later runs stay deterministic.
    const ids = [ctx.createdId, ctx.createdValidId];
    for (const id of ids) {
        if (!id) continue;
        const { status, body } = await api(`/users/${id}`, {
            method: "DELETE",
            token: ctx.adminToken,
        });
        assert.equal(status, 200, JSON.stringify(body));
    }
});