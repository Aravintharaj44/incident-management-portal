const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { issueAccessToken } = require("../src/services/oauthService");
const { DEMO_OAUTH } = require("../src/seed/oauthDemoData");

/**
 * End-to-end tests for FR5-08 - Zoho Desk-style `from` / `limit` pagination on
 * the public API (/api/v1/tickets, /api/v1/contacts, /api/v1/articles).
 *
 *   1. npm run seed        (creates the demo OAuth clients)
 *   2. npm start           (in another terminal)
 *   3. npm test
 *
 * `from` is a zero-based offset, `limit` the page size (default 10, max 100).
 * Pagination is applied AFTER authentication, scope authorisation and filtering,
 * and never bypasses visibility rules. Response pagination metadata is a
 * superset of the earlier envelope ({from, limit, count, totalPages,
 * hasNextPage, hasPrevPage}) plus the Zoho-style {total, hasMore}.
 */

const BASE = process.env.TEST_API_URL || "http://localhost:5000/api/v1";
const PASSWORD = "Password123";

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

// ------------------------------------------------------------------
// Setup: obtain OAuth tokens + capture a seeded category for filters
// ------------------------------------------------------------------

test("FR5-08 setup: read-scoped bearer tokens and a portal JWT", async () => {
    const articles = await requestToken({
        clientId: DEMO_OAUTH.articlesRead.clientId,
        clientSecret: DEMO_OAUTH.articlesRead.clientSecret,
        scope: "articles.READ",
    });
    assert.equal(articles.status, 200, JSON.stringify(articles.body));
    ctx.articlesToken = articles.body.access_token;

    const tickets = await requestToken({
        clientId: DEMO_OAUTH.active.clientId,
        clientSecret: DEMO_OAUTH.active.clientSecret,
        scope: "tickets.READ",
    });
    assert.equal(tickets.status, 200, JSON.stringify(tickets.body));
    ctx.ticketsToken = tickets.body.access_token;

    const contacts = await requestToken({
        clientId: DEMO_OAUTH.contactsRead.clientId,
        clientSecret: DEMO_OAUTH.contactsRead.clientSecret,
        scope: "contacts.READ",
    });
    assert.equal(contacts.status, 200, JSON.stringify(contacts.body));
    ctx.contactsToken = contacts.body.access_token;

    // A valid signed token carrying ONLY an unrelated scope (FR5-03 style).
    ctx.agentsToken = issueAccessToken({
        client: { clientId: DEMO_OAUTH.articlesRead.clientId },
        scope: "agents.READ",
    });

    ctx.adminToken = await login("admin@zybisys.com");

    // Capture a real category id so the article category-filter tests are valid.
    const categories = await api("/categories", { token: ctx.adminToken });
    assert.equal(categories.status, 200, JSON.stringify(categories.body));
    const network = categories.body.data.categories.find((c) => c.name === "Network");
    assert.ok(network, "Network category not found in the seeded data");
    ctx.categoryId = network._id;
});

// ------------------------------------------------------------------
// Basic pagination: defaults, windowing, last page, beyond-total
// ------------------------------------------------------------------

test("FR5-08: no pagination params -> default from=0, limit=10 (tickets)", async () => {
    const { status, body } = await api("/tickets", { token: ctx.ticketsToken });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.data.from, 0);
    assert.equal(body.data.limit, 10);
    assert.equal(body.data.pagination.from, 0);
    assert.equal(body.data.pagination.limit, 10);
    assert.ok(body.data.tickets.length <= 10);
});

test("FR5-08: from=0&limit=10 returns the first 10 tickets", async () => {
    const { status, body } = await api("/tickets?from=0&limit=10", { token: ctx.ticketsToken });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.data.limit, 10);
    assert.ok(body.data.tickets.length <= 10);
    assert.ok("hasMore" in body.data.pagination);
    assert.ok("total" in body.data.pagination);
});

test("FR5-08: from=10&limit=10 is the next, non-overlapping page", async () => {
    const first = await api("/tickets?from=0&limit=10", { token: ctx.ticketsToken });
    const second = await api("/tickets?from=10&limit=10", { token: ctx.ticketsToken });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.ok(second.body.data.tickets.length <= 10);
    if (second.body.data.tickets.length && first.body.data.tickets.length) {
        const firstIds = new Set(first.body.data.tickets.map((t) => t.id));
        for (const t of second.body.data.tickets) {
            assert.ok(!firstIds.has(t.id), "pages from=0 and from=10 overlapped");
        }
    }
});

test("FR5-08: from=20&limit=20 windows correctly and reports hasMore accurately", async () => {
    const { status, body } = await api("/tickets?from=20&limit=20", { token: ctx.ticketsToken });
    assert.equal(status, 200, JSON.stringify(body));
    assert.ok(body.data.tickets.length <= 20);
    assert.equal(body.data.pagination.from, 20);
    assert.equal(body.data.pagination.limit, 20);
    if (body.data.tickets.length) {
        assert.equal(body.data.pagination.count, body.data.pagination.total);
        assert.equal(body.data.pagination.hasMore, 20 + body.data.tickets.length < body.data.pagination.total);
    }
});

test("FR5-08: from beyond the total -> empty items, hasMore false", async () => {
    const { status, body } = await api("/tickets?from=999999&limit=20", { token: ctx.ticketsToken });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.data.tickets.length, 0, "items should be empty past the total");
    assert.equal(body.data.pagination.hasMore, false, "hasMore must be false when past the total");
    assert.ok(body.data.pagination.total > 0, "total should reflect the actual collection size");
    assert.equal(body.data.pagination.count, body.data.pagination.total, "count is total-matching-records, not page count");
});

test("FR5-08: last partial page returns the remainder with hasMore=false", async () => {
    // `total` is read from the very page we assert on so parallel test files
    // writing incidents can't shift the count between our two requests.
    const { status, body } = await api("/tickets?from=0&limit=100", { token: ctx.ticketsToken });
    assert.equal(status, 200, JSON.stringify(body));
    const total = body.data.pagination.total;
    if (total < 2) return; // nothing to meaningfully page back over

    const qs = `from=${total - 1}&limit=10`;
    const lastRes = await api(`/tickets?${qs}`, { token: ctx.ticketsToken });
    assert.equal(lastRes.status, 200, JSON.stringify(lastRes.body));
    assert.equal(lastRes.body.data.pagination.count, lastRes.body.data.pagination.total);
    assert.equal(lastRes.body.data.pagination.hasMore, false, "last page must not claim more results");
});

// ------------------------------------------------------------------
// Validation: out-of-range and malformed from/limit are rejected
// ------------------------------------------------------------------

const badPaginationCases = [
    ["from=-1", 422, "negative from"],
    ["limit=0", 422, "zero limit"],
    ["limit=-1", 422, "negative limit"],
    ["limit=101", 422, "limit above maximum"],
    ["from=abc", 422, "non-numeric from"],
    ["limit=abc", 422, "non-numeric limit"],
    ["from=1.5", 422, "decimal from"],
    ["limit=2.5", 422, "decimal limit"],
    ["limit=20abc", 422, "malformed numeric limit"],
    ["from=1.5&limit=20", 422, "decimal from with valid limit"],
];

test("FR5-08: invalid from/limit are rejected with a validation error", async () => {
    for (const [qs, expected, label] of badPaginationCases) {
        const { status, body } = await api(`/tickets?${qs}`, { token: ctx.ticketsToken });
        assert.equal(status, expected, `${label} (${qs}) should be rejected`);
        assert.ok(Array.isArray(body.errors), `${label} should carry an errors array`);
    }
});

test("FR5-08: duplicate from/limit query params are rejected", async () => {
    for (const qs of ["limit=20&limit=50", "from=0&from=10"]) {
        const { status, body } = await api(`/tickets?${qs}`, { token: ctx.ticketsToken });
        assert.equal(status, 422, `duplicate ${qs} should be rejected`);
        assert.ok(Array.isArray(body.errors), `duplicate ${qs} should carry an errors array`);
    }
});

// ------------------------------------------------------------------
// Response metadata
// ------------------------------------------------------------------

test("FR5-08: list responses return full pagination metadata", async () => {
    const { status, body } = await api("/contacts?from=0&limit=5", { token: ctx.contactsToken });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.data.from, 0);
    assert.equal(body.data.limit, 5);
    assert.equal(body.data.pagination.from, 0);
    assert.equal(body.data.pagination.limit, 5);
    assert.equal(body.data.pagination.count, body.data.pagination.total, "count should equal total");
    assert.equal("hasMore" in body.data.pagination, true);
    assert.ok(Number.isInteger(body.data.pagination.total));
    assert.ok(body.data.contacts.length <= 5, "should return at most limit contacts");
});

// ------------------------------------------------------------------
// Filtering + pagination
// ------------------------------------------------------------------

test("FR5-08: tickets + status filter + pagination stay consistent", async () => {
    const { status, body } = await api("/tickets?status=new&from=0&limit=5", { token: ctx.ticketsToken });
    assert.equal(status, 200, JSON.stringify(body));
    body.data.tickets.forEach((t) => assert.equal(t.status, "new"));
    assert.ok(body.data.tickets.length <= 5);
});

test("FR5-08: contacts + pagination respects the customer-only rule", async () => {
    const { status, body } = await api("/contacts?from=0&limit=20", { token: ctx.contactsToken });
    assert.equal(status, 200, JSON.stringify(body));
    body.data.contacts.forEach((c) => assert.equal(c.role, undefined, "public contact must not expose a role"));
    assert.ok(body.data.contacts.length <= 20);
});

test("FR5-08: articles + search + pagination", async () => {
    const { status, body } = await api("/articles?search=VPN%20Connection&from=0&limit=10", {
        token: ctx.articlesToken,
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.ok(body.data.items.length >= 1, "expected a match on the seeded VPN title");
    assert.ok(body.data.items.length <= 10);
});

test("FR5-08: articles + category filter + pagination", async () => {
    const { status, body } = await api(`/articles?categoryId=${ctx.categoryId}&from=0&limit=20`, {
        token: ctx.articlesToken,
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.ok(body.data.items.length >= 1, "expected Network articles");
    body.data.items.forEach((a) =>
        assert.ok(a.categories.some((c) => c.id === ctx.categoryId), `article ${a.title} not in Network`)
    );
});

test("FR5-08: articles + search + category + pagination", async () => {
    const { status, body } = await api(
        `/articles?search=vpn&categoryId=${ctx.categoryId}&from=0&limit=10`,
        { token: ctx.articlesToken }
    );
    assert.equal(status, 200, JSON.stringify(body));
    body.data.items.forEach((a) => {
        assert.ok(a.categories.some((c) => c.id === ctx.categoryId), `article ${a.title} not in Network`);
        assert.ok(
            `${a.title} ${a.body} ${(a.tags || []).join(" ")}`.toLowerCase().includes("vpn"),
            `article ${a.title} does not match the vpn search`
        );
    });
});

// ------------------------------------------------------------------
// Security: pagination never bypasses authentication or scopes
// ------------------------------------------------------------------

test("FR5-08: missing token -> 401 even with pagination params", async () => {
    const list = await api("/tickets?from=0&limit=20");
    assert.equal(list.status, 401, JSON.stringify(list.body));
    assert.equal(list.body.success, false);
});

test("FR5-08: invalid token -> 401 even with pagination params", async () => {
    const list = await api("/tickets?from=0&limit=20", { token: "not-a-jwt" });
    assert.equal(list.status, 401, JSON.stringify(list.body));
});

test("FR5-08: insufficient scope -> 403 even with valid pagination", async () => {
    // A contacts.READ token has no ticket scope.
    const list = await api("/tickets?from=0&limit=20", { token: ctx.contactsToken });
    assert.equal(list.status, 403, JSON.stringify(list.body));
    assert.equal(list.body.error, "insufficient_scope");
});

test("FR5-08: unrelated scope (agents.READ) cannot paginate articles", async () => {
    const list = await api("/articles?from=0&limit=20", { token: ctx.agentsToken });
    assert.equal(list.status, 403, JSON.stringify(list.body));
    assert.equal(list.body.error, "insufficient_scope");
});

test("FR5-08: correct scope + pagination succeeds on every public list", async () => {
    const tickets = await api("/tickets?from=0&limit=10", { token: ctx.ticketsToken });
    assert.equal(tickets.status, 200, JSON.stringify(tickets.body));

    const contacts = await api("/contacts?from=0&limit=10", { token: ctx.contactsToken });
    assert.equal(contacts.status, 200, JSON.stringify(contacts.body));

    const articles = await api("/articles?from=0&limit=10", { token: ctx.articlesToken });
    assert.equal(articles.status, 200, JSON.stringify(articles.body));
});

test("FR5-08: portal JWT (no OAuth scope) paginates through the same endpoints", async () => {
    const tickets = await api("/tickets?from=1&limit=2", { token: ctx.adminToken });
    assert.equal(tickets.status, 200, JSON.stringify(tickets.body));
    assert.equal(tickets.body.data.from, 1);

    const articles = await api("/articles?from=1&limit=2", { token: ctx.adminToken });
    assert.equal(articles.status, 200, JSON.stringify(articles.body));
    assert.equal(articles.body.data.from, 1);
});