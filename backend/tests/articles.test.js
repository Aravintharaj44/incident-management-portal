const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { issueAccessToken } = require("../src/services/oauthService");
const { DEMO_OAUTH } = require("../src/seed/oauthDemoData");

/**
 * End-to-end tests for FR5-07 - the public Knowledge Base Articles API
 * (/api/v1/articles).
 *
 *   1. npm run seed        (creates the demo OAuth clients incl. articles.READ)
 *   2. npm start           (in another terminal)
 *   3. npm test
 *
 * Articles reuse the existing KnowledgeBaseArticle model and the existing KB
 * search/visibility behaviour. Only `published` articles are ever returned;
 * drafts, retired, archived and soft-deleted articles return 404 / are excluded
 * from the list. Reads are protected by the `articles.READ` OAuth scope (FR5-02/
 * FR5-03) using the existing middleware.
 */

const BASE = process.env.TEST_API_URL || "http://localhost:5000/api/v1";
const PASSWORD = "Password123";

const ACCOUNTS = {
    admin: "admin@zybisys.com",
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
const suffix = Date.now();
const freshTitle = (label) => `FR5-07 ${label} ${suffix}`;

// ------------------------------------------------------------------
// Setup: obtain the OAuth tokens used across the suite
// ------------------------------------------------------------------

test("FR5-07 setup: articles.READ, tickets.READ and contacts.READ bearer tokens", async () => {
    const articles = await requestToken({
        clientId: DEMO_OAUTH.articlesRead.clientId,
        clientSecret: DEMO_OAUTH.articlesRead.clientSecret,
        scope: "articles.READ",
    });
    assert.equal(articles.status, 200, JSON.stringify(articles.body));
    assert.equal(articles.body.scope, "articles.READ");
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

    ctx.adminToken = await login(ACCOUNTS.admin);

    // Capture a seeded category id (used by the category-filter tests and the
    // fixtures below, which must reference a real Category).
    const categories = await api("/categories", { token: ctx.adminToken });
    assert.equal(categories.status, 200, JSON.stringify(categories.body));
    const network = categories.body.data.categories.find((c) => c.name === "Network");
    assert.ok(network, "Network category not found in the seeded data");
    ctx.categoryId = network._id;

    // Wire a valid signed token carrying ONLY the unrelated agents.READ scope.
    ctx.agentsToken = issueAccessToken({
        client: { clientId: DEMO_OAUTH.articlesRead.clientId },
        scope: "agents.READ",
    });
});

// ------------------------------------------------------------------
// Authentication tests (missing / invalid / expired tokens)
// ------------------------------------------------------------------

test("FR5-07: GET /articles without token -> 401", async () => {
    assert.equal((await api("/articles")).status, 401);
});

test("FR5-07: GET /articles/:id without token -> 401", async () => {
    assert.equal((await api("/articles/64b8f0c2e4a9d1f2a3b4c5d9")).status, 401);
});

test("FR5-07: invalid OAuth token -> 401 (not 403)", async () => {
    assert.equal((await api("/articles", { token: "not-a-jwt" })).status, 401);
});

test("FR5-07: expired OAuth token -> 401 (not 403)", async () => {
    const expired = issueAccessToken({
        client: { clientId: DEMO_OAUTH.articlesRead.clientId },
        scope: "articles.READ",
        expiresIn: -60,
    });
    assert.equal((await api("/articles", { token: expired })).status, 401);
});

// ------------------------------------------------------------------
// Scope tests
// ------------------------------------------------------------------

test("FR5-07: articles.READ token -> GET /articles succeeds and never leaks internals", async () => {
    const { status, body } = await api("/articles?limit=100", { token: ctx.articlesToken });
    assert.equal(status, 200, JSON.stringify(body));
    assert.ok(Array.isArray(body.data.items));
    assert.ok(body.data.items.length >= 5, "expected the seeded published articles");

    const sample = body.data.items[0];
    assert.ok(sample.id);
    assert.ok(sample.title);
    assert.ok(sample.body);
    assert.equal(sample.status, "published");
    assert.ok(Array.isArray(sample.categories));
    assert.ok(sample.author && sample.author.id);
    assert.ok("createdAt" in sample);
    assert.ok("updatedAt" in sample);

    // Internal Mongo/audit/security fields must never leak.
    assert.equal(sample._id, undefined);
    assert.equal(sample.__v, undefined);
    assert.equal(sample.authorID, undefined);
    assert.equal(sample.deletedAt, undefined);

    ctx.firstArticleId = sample.id;
});

test("FR5-07: articles.READ token -> GET /articles/:id succeeds", async () => {
    const { status, body } = await api(`/articles/${ctx.firstArticleId}`, {
        token: ctx.articlesToken,
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.data.article.id, ctx.firstArticleId);
    assert.equal(body.data.article._id, undefined);
    assert.equal(body.data.article.__v, undefined);
    assert.equal(body.data.article.authorID, undefined);
    assert.equal(body.data.article.deletedAt, undefined);
});

test("FR5-07: tokens with only tickets.READ -> /articles rejected (403)", async () => {
    const list = await api("/articles?limit=5", { token: ctx.ticketsToken });
    assert.equal(list.status, 403, JSON.stringify(list.body));
    assert.equal(list.body.error, "insufficient_scope");

    const single = await api(`/articles/${ctx.firstArticleId}`, { token: ctx.ticketsToken });
    assert.equal(single.status, 403, JSON.stringify(single.body));
    assert.equal(single.body.error, "insufficient_scope");
});

test("FR5-07: tokens with only contacts.READ -> /articles rejected (403)", async () => {
    const list = await api("/articles?limit=5", { token: ctx.contactsToken });
    assert.equal(list.status, 403, JSON.stringify(list.body));
    assert.equal(list.body.error, "insufficient_scope");
});

test("FR5-07: tokens with only agents.READ -> /articles rejected (403)", async () => {
    const list = await api("/articles?limit=5", { token: ctx.agentsToken });
    assert.equal(list.status, 403, JSON.stringify(list.body));
    assert.equal(list.body.error, "insufficient_scope");
});

test("FR5-07: token without articles.READ (tickets.ALL client) -> /articles rejected (403)", async () => {
    const { status, body } = await requestToken({
        clientId: DEMO_OAUTH.active.clientId,
        clientSecret: DEMO_OAUTH.active.clientSecret,
        scope: "tickets.ALL",
    });
    assert.equal(status, 200, JSON.stringify(body));

    const list = await api("/articles?limit=5", { token: body.access_token });
    assert.equal(list.status, 403, JSON.stringify(list.body));
    assert.equal(list.body.error, "insufficient_scope");
});

// ------------------------------------------------------------------
// Article behaviour tests
// ------------------------------------------------------------------

test("FR5-07: list returns the article collection with pagination metadata", async () => {
    const { status, body } = await api("/articles?from=0&limit=2", { token: ctx.articlesToken });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.data.from, 0);
    assert.equal(body.data.limit, 2);
    assert.equal(body.data.pagination.from, 0);
    assert.equal(body.data.pagination.limit, 2);
    assert.ok(body.data.items.length <= 2);
    assert.ok(body.data.pagination.total >= body.data.items.length);
});

test("FR5-07: GET /articles/:id -> 404 for a nonexistent published article", async () => {
    const { status, body } = await api("/articles/64b8f0c2e4a9d1f2a3b4c5d0", {
        token: ctx.articlesToken,
    });
    assert.equal(status, 404, JSON.stringify(body));
});

test("FR5-07: GET /articles/:id -> 422 for an invalid id", async () => {
    const { status, body } = await api("/articles/not-an-id", { token: ctx.articlesToken });
    assert.equal(status, 422, JSON.stringify(body));
    assert.ok(Array.isArray(body.errors));
});

test("FR5-07 setup: create a published and a draft article via the internal KB API", async () => {
    const published = await api("/kba", {
        method: "POST",
        token: ctx.adminToken,
        body: {
            title: freshTitle("published article"),
            body: "This is a FR5-07 test article body for the published fixture. Eclipse Aurora.",
            categories: [ctx.categoryId],
            status: "published",
        },
    });
    assert.equal(published.status, 201, JSON.stringify(published.body));
    ctx.publishedArticleId = published.body.data.article._id;

    const draft = await api("/kba", {
        method: "POST",
        token: ctx.adminToken,
        body: {
            title: freshTitle("draft article"),
            body: "This is a FR5-07 test article body for the draft fixture. Unicorn Nebula.",
            categories: [ctx.categoryId],
        },
    });
    assert.equal(draft.status, 201, JSON.stringify(draft.body));
    assert.equal(draft.body.data.article.status, "draft");
    ctx.draftArticleId = draft.body.data.article._id;
});

test("FR5-07: a published test article appears in the public list", async () => {
    const { status, body } = await api(`/articles?search=Eclipse%20Aurora&limit=10`, {
        token: ctx.articlesToken,
    });
    assert.equal(status, 200, JSON.stringify(body));
    const found = body.data.items.some((a) => a.id === ctx.publishedArticleId);
    assert.ok(found, "the published fixture should be visible through the public API");
});

test("FR5-07: a draft article is NOT exposed through the public API", async () => {
    const single = await api(`/articles/${ctx.draftArticleId}`, { token: ctx.articlesToken });
    assert.equal(single.status, 404, JSON.stringify(single.body));

    const list = await api(`/articles?search=Unicorn%20Nebula&limit=10`, { token: ctx.articlesToken });
    assert.equal(list.status, 200, JSON.stringify(list.body));
    const found = list.body.data.items.some((a) => a.id === ctx.draftArticleId);
    assert.equal(found, false, "a draft article leaked into the public list");
});

test("FR5-07: a deleted (archived) article is NOT exposed through the public API", async () => {
    const del = await api(`/kba/${ctx.publishedArticleId}`, {
        method: "DELETE",
        token: ctx.adminToken,
    });
    assert.equal(del.status, 200, JSON.stringify(del.body));

    const single = await api(`/articles/${ctx.publishedArticleId}`, { token: ctx.articlesToken });
    assert.equal(single.status, 404, JSON.stringify(single.body));

    const list = await api(`/articles?search=Eclipse%20Aurora&limit=10`, { token: ctx.articlesToken });
    assert.equal(list.status, 200, JSON.stringify(list.body));
    const found = list.body.data.items.some((a) => a.id === ctx.publishedArticleId);
    assert.equal(found, false, "a deleted article leaked into the public list");
});

test("FR5-07: search matches the seeded article by title and tag", async () => {
    const byTitle = await api(`/articles?search=VPN%20Connection&limit=10`, {
        token: ctx.articlesToken,
    });
    assert.equal(byTitle.status, 200, JSON.stringify(byTitle.body));
    assert.ok(byTitle.body.data.items.length >= 1, "expected a match on the seeded VPN title");
    byTitle.body.data.items.forEach((a) => {
        const hay = `${a.title} ${a.body} ${(a.tags || []).join(" ")}`.toLowerCase();
        assert.ok(hay.includes("vpn") || a.title.toLowerCase().includes("vpn"), `non-matching article: ${a.title}`);
    });

    const byTag = await api(`/articles?search=firewall&limit=10`, { token: ctx.articlesToken });
    assert.equal(byTag.status, 200, JSON.stringify(byTag.body));
    assert.ok(byTag.body.data.items.length >= 1, "expected a match on the firewall tag");
    byTag.body.data.items.forEach((a) => {
        assert.ok((a.tags || []).some((t) => t.toLowerCase().includes("firewall")), `non-matching tag article: ${a.title}`);
    });
});

test("FR5-07: search by body content matches a seeded phrase", async () => {
    const { status, body } = await api(`/articles?search=idle%20timeout&limit=10`, {
        token: ctx.articlesToken,
    });
    assert.equal(status, 200, JSON.stringify(body));
    const found = body.data.items.some((a) => a.body.toLowerCase().includes("idle timeout"));
    assert.ok(found, "expected the body-phrase search to match the VPN article");
});

test("FR5-07: search never bypasses publication/visibility rules", async () => {
    const { status, body } = await api(`/articles?search=Unicorn%20Nebula&limit=10`, {
        token: ctx.articlesToken,
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.data.items.length, 0, "draft-only search term leaked a hidden article");
});

test("FR5-07: category filtering returns only matching articles", async () => {
    const { status, body } = await api(`/articles?categoryId=${ctx.categoryId}&limit=100`, {
        token: ctx.articlesToken,
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.ok(body.data.items.length >= 1, "expected Network articles");
    body.data.items.forEach((a) => {
        assert.ok(
            (a.categories || []).some((c) => c.id === ctx.categoryId),
            `article ${a.title} is not in the Network category`
        );
    });
});

test("FR5-07: a category with no matching articles returns an empty collection", async () => {
    const unused = "64b8f0c2e4a9d1f2a3b4c5d1";
    const { status, body } = await api(`/articles?categoryId=${unused}&limit=100`, {
        token: ctx.articlesToken,
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.data.items.length, 0);
});

test("FR5-07: public response does not expose any internal Mongo/security fields", async () => {
    const { status, body } = await api("/articles?limit=100", { token: ctx.articlesToken });
    assert.equal(status, 200, JSON.stringify(body));
    body.data.items.forEach((article) => {
        assert.equal(article._id, undefined);
        assert.equal(article.__v, undefined);
        assert.equal(article.authorID, undefined);
        assert.equal(article.deletedAt, undefined);
        assert.equal(article.createdBy, undefined);
        (article.categories || []).forEach((c) => {
            assert.equal(c._id, undefined);
            assert.equal(c.isActive, undefined);
        });
        if (article.author) {
            assert.equal(article.author.email, undefined);
            assert.equal(article.author.role, undefined);
        }
    });
});

test("FR5-07: portal JWT still works on /articles and bypasses OAuth scope checks", async () => {
    const list = await api("/articles?limit=5", { token: ctx.adminToken });
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.ok(Array.isArray(list.body.data.items));
});

test("FR5-07: existing KB UI/API (/kba) continues to work unchanged", async () => {
    const list = await api("/kba?limit=5", { token: ctx.adminToken });
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.ok(Array.isArray(list.body.data.items));

    const single = await api(`/kba/${ctx.firstArticleId}`, { token: ctx.adminToken });
    assert.equal(single.status, 200, JSON.stringify(single.body));
    assert.ok(single.body.data.article);
});

// ------------------------------------------------------------------
// Cleanup: remove the test-created draft article via the internal KB API
// ------------------------------------------------------------------

test("FR5-07 cleanup: soft-delete the test-created draft article", async () => {
    const del = await api(`/kba/${ctx.draftArticleId}`, {
        method: "DELETE",
        token: ctx.adminToken,
    });
    assert.equal(del.status, 200, JSON.stringify(del.body));
});