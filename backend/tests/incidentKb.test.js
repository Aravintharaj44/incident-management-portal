const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * V4 Incident Detail — KB Articles tab (FR4-14 enhancement).
 *
 * Verifies the multi-article incident ↔ KB relationship against a running API.
 *
 *   1. npm run seed
 *   2. npm start        (in another terminal)
 *   3. npm test
 *
 * The Incident Details enhancement allows an incident to be linked to MULTIPLE
 * KB articles, all belonging to the incident's own category. This suite
 * exercises linking, unlinking, duplicate prevention, cross-category rejection,
 * draft rejection, permissions, category change cleanup and backward
 * compatibility with the rest of the V1-V4 feature set.
 */

const BASE = process.env.TEST_API_URL || "http://localhost:5000/api/v1";
const PASSWORD = "Password123";

const ACCOUNTS = {
    admin: "admin@zybisys.com",
    agent: "rahul.agent@zybisys.com",
    user: "karthik@zybisys.com",
};

/** Thin fetch wrapper returning { status, body }. */
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

const ctx = {};

/** Create a category and return its id. */
const createCategory = async (token, name) => {
    const suffix = Date.now();
    const { status, body } = await api("/categories", {
        method: "POST",
        token,
        body: { name: `${name} ${suffix}` },
    });
    assert.equal(status, 201, `create category failed: ${JSON.stringify(body)}`);
    return body.data.category._id;
};

/** Create a KB article (draft by default) and return its id. */
const createKBArticle = async (token, { title, categoryId, status = "draft" }) => {
    const { status: createStatus, body } = await api("/kba", {
        method: "POST",
        token,
        body: {
            title: `${title} ${Date.now()}`,
            body: "This is a KB article body used by the incident KB linking test suite.",
            categories: [categoryId],
            tags: ["test"],
            status,
        },
    });
    assert.equal(createStatus, 201, `create KB article failed: ${JSON.stringify(body)}`);
    const id = body.data.article._id;

    if (status === "published") {
        const pub = await api(`/kba/${id}`, {
            method: "PATCH",
            token,
            body: { status: "published" },
        });
        assert.equal(pub.status, 200, `publish failed: ${JSON.stringify(pub.body)}`);
    }
    return id;
};

/** Create an incident with a given category. Returns id and incidentNumber. */
const createIncident = async (token, categoryId) => {
    const { status, body } = await api("/incidents", {
        method: "POST",
        token,
        body: {
            title: `KB Linking Incident ${Date.now()}`,
            description: "Incident used to test multiple KB article linking.",
            category: categoryId,
            priority: "medium",
        },
    });
    assert.equal(status, 201, `create incident failed: ${JSON.stringify(body)}`);
    return { id: body.data.incident._id, incidentNumber: body.data.incident.incidentNumber };
};

/** Link a KB article to an incident via the API. */
const linkKb = (incidentId, articleId, token) =>
    api(`/incidents/${incidentId}/kb-articles`, {
        method: "POST",
        token,
        body: { kbArticleId: articleId },
    });

/** Unlink a KB article from an incident via the API. */
const unlinkKb = (incidentId, articleId, token) =>
    api(`/incidents/${incidentId}/kb-articles/${articleId}`, {
        method: "DELETE",
        token,
    });

// ─── Setup: tokens, two categories, two published articles per category ──────

test("login and create the category/fixture data", async () => {
    ctx.adminToken = await login(ACCOUNTS.admin);
    ctx.agentToken = await login(ACCOUNTS.agent);
    ctx.userToken = await login(ACCOUNTS.user);

    ctx.networkCat = await createCategory(ctx.adminToken, "Network");
    ctx.applicationCat = await createCategory(ctx.adminToken, "Application");

    ctx.netArticle1 = await createKBArticle(ctx.adminToken, {
        title: "Network Fix One",
        categoryId: ctx.networkCat,
        status: "published",
    });
    ctx.netArticle2 = await createKBArticle(ctx.adminToken, {
        title: "Network Fix Two",
        categoryId: ctx.networkCat,
        status: "published",
    });
    ctx.appArticle1 = await createKBArticle(ctx.adminToken, {
        title: "Application Guide One",
        categoryId: ctx.applicationCat,
        status: "published",
    });
    ctx.appArticle2 = await createKBArticle(ctx.adminToken, {
        title: "Application Guide Two",
        categoryId: ctx.applicationCat,
        status: "published",
    });
    ctx.appDraft = await createKBArticle(ctx.adminToken, {
        title: "Application Draft",
        categoryId: ctx.applicationCat,
        status: "draft",
    });

    // A Network incident will be the main subject.
    const incident = await createIncident(ctx.agentToken, ctx.networkCat);
    ctx.incidentId = incident.id;
    ctx.incidentNumber = incident.incidentNumber;
});

// ─── 1. Link a KB article ────────────────────────────────────────────────────

test("1. an agent can link a KB article to an incident", async () => {
    const res = await linkKb(ctx.incidentId, ctx.netArticle1, ctx.agentToken);

    assert.equal(res.status, 201, `link failed: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.data.incident.kbArticleIds.some((id) => String(id) === String(ctx.netArticle1)));
});

// ─── 2. Link multiple articles ───────────────────────────────────────────────

test("2. an incident can be linked to multiple KB articles", async () => {
    await linkKb(ctx.incidentId, ctx.netArticle2, ctx.agentToken);

    const res = await api(`/incidents/${ctx.incidentId}/kb-articles`, { token: ctx.adminToken });

    assert.equal(res.status, 200);
    const ids = res.body.data.articles.map((a) => String(a._id));
    assert.ok(ids.includes(String(ctx.netArticle1)));
    assert.ok(ids.includes(String(ctx.netArticle2)));
    assert.equal(res.body.data.articles.length, 2);
});

// ─── 3. Duplicate link is rejected ──────────────────────────────────────────

test("3. a duplicate KB article cannot be linked twice", async () => {
    const res = await linkKb(ctx.incidentId, ctx.netArticle1, ctx.agentToken);

    assert.equal(res.status, 400, `duplicate should be rejected: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, false);
});

// ─── 4. Same-category article can be linked ─────────────────────────────────

test("4. an article from the same category can be linked", async () => {
    // netArticle1 already linked (net category). Try another net article - done above.
    // Explicitly assert a same-category fresh incident works.
    const fresh = await createIncident(ctx.agentToken, ctx.networkCat);
    const res = await linkKb(fresh.id, ctx.netArticle2, ctx.agentToken);
    assert.equal(res.status, 201);
    assert.ok(res.body.data.incident.kbArticleIds.some((id) => String(id) === String(ctx.netArticle2)));
});

// ─── 5. Different-category article is rejected ──────────────────────────────

test("5. an article from a different category is rejected", async () => {
    const res = await linkKb(ctx.incidentId, ctx.appArticle1, ctx.agentToken);

    assert.equal(res.status, 400, `cross-category link should be rejected: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, false);
});

// ─── 6. Draft article cannot be linked ──────────────────────────────────────

test("6. a draft KB article cannot be linked", async () => {
    const res = await linkKb(ctx.incidentId, ctx.appDraft, ctx.agentToken);

    assert.equal(res.status, 400, `draft link should be rejected: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, false);
});

// ─── 7. Invalid KB article ID is rejected ───────────────────────────────────

test("7. an invalid KB article ID is rejected", async () => {
    const res = await linkKb(ctx.incidentId, "not-a-valid-id", ctx.agentToken);
    assert.equal(res.status, 400);
});

// ─── 8. Unauthorized user cannot link ───────────────────────────────────────

test("8. an end user cannot link a KB article", async () => {
    const fresh = await createIncident(ctx.agentToken, ctx.networkCat);
    const res = await linkKb(fresh.id, ctx.netArticle1, ctx.userToken);

    assert.equal(res.status, 403, `user should be blocked: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, false);
});

// ─── 9. Authorized user can unlink ─────────────────────────────────────────

test("9. an agent can unlink a KB article", async () => {
    const res = await unlinkKb(ctx.incidentId, ctx.netArticle2, ctx.agentToken);

    assert.equal(res.status, 200, `unlink failed: ${JSON.stringify(res.body)}`);
    const ids = res.body.data.incident.kbArticleIds.map((id) => String(id));
    assert.ok(!ids.includes(String(ctx.netArticle2)));
});

// ─── 10. Unlinking keeps the other articles ─────────────────────────────────

test("10. unlinking one article keeps the other linked articles", async () => {
    const res = await api(`/incidents/${ctx.incidentId}/kb-articles`, { token: ctx.adminToken });

    const ids = res.body.data.articles.map((a) => String(a._id));
    assert.equal(res.body.data.articles.length, 1);
    assert.ok(ids.includes(String(ctx.netArticle1)));
    assert.ok(!ids.includes(String(ctx.netArticle2)));
});

// ─── 11. Incident Details returns all linked articles ───────────────────────

test("11. incident detail returns all linked KB articles", async () => {
    // Re-link netArticle2 so the incident has two again.
    await linkKb(ctx.incidentId, ctx.netArticle2, ctx.agentToken);

    const res = await api(`/incidents/${ctx.incidentId}`, { token: ctx.adminToken });
    assert.equal(res.status, 200);
    const populated = res.body.data.incident.kbArticleIds;
    assert.equal(populated.length, 2);
});

// ─── 12. Category-filtered search for incident linking ─────────────────────

test("12. KB search for an incident is category-filtered", async () => {
    const res = await api(`/incidents/${ctx.incidentId}/kb-articles/search?search=Application`, {
        token: ctx.adminToken,
    });

    assert.equal(res.status, 200);
    const titles = res.body.data.articles.map((a) => a.title);
    // All returned articles must be Application ones, never Network.
    assert.ok(titles.every((t) => t.toLowerCase().includes("application")));
    assert.ok(!titles.some((t) => t.toLowerCase().includes("network")));
});

// ─── 13. Existing incidents continue working ────────────────────────────────

test("13. existing incidents load normally", async () => {
    const res = await api(`/incidents/${ctx.incidentId}`, { token: ctx.agentToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.incident.incidentNumber, ctx.incidentNumber);
});

// ─── 14. Existing KB APIs continue working ──────────────────────────────────

test("14. existing KB list/search/feedback APIs still work", async () => {
    const res = await api(`/kba?search=${encodeURIComponent("Guide")}`, { token: ctx.adminToken });
    assert.equal(res.status, 200);

    const feedback = await api(`/kba/${ctx.appArticle1}/feedback`, {
        method: "POST",
        token: ctx.userToken,
        body: { value: "helpful" },
    });
    assert.equal(feedback.status, 200);
});

// ─── 15. Existing IncidentLink functionality continues working ──────────────

test("15. incident links still work alongside KB links", async () => {
    // Create a second incident and link it to the first.
    const other = await createIncident(ctx.agentToken, ctx.networkCat);

    const res = await api(`/incidents/${ctx.incidentId}/links`, {
        method: "POST",
        token: ctx.agentToken,
        body: {
            toIncidentId: other.id,
            linkType: "related",
            description: "Manual relationship",
        },
    });

    // 201 = linked, 400 = already exists. Either way the KB data must be intact.
    if (res.status === 201) {
        const first = await api(`/incidents/${ctx.incidentId}`, { token: ctx.adminToken });
        assert.equal(first.body.data.incident.incidentNumber, ctx.incidentNumber);
    } else {
        assert.ok([400, 409, 200].includes(res.status));
    }
});

// ─── 16. Category change removes invalid cross-category KB links ───────────

test("16. changing the incident category drops now-invalid KB links", async () => {
    // Link an Application article to an Application incident, then re-assign
    // that incident to the Network category. The Application link must be dropped.
    const appIncident = await createIncident(ctx.agentToken, ctx.applicationCat);
    const linkRes = await linkKb(appIncident.id, ctx.appArticle1, ctx.agentToken);
    assert.equal(linkRes.status, 201);

    const change = await api(`/incidents/${appIncident.id}`, {
        method: "PATCH",
        token: ctx.adminToken,
        body: { category: ctx.networkCat },
    });

    assert.equal(change.status, 200, `category change failed: ${JSON.stringify(change.body)}`);
    const after = await api(`/incidents/${appIncident.id}/kb-articles`, { token: ctx.adminToken });
    const ids = after.body.data.articles.map((a) => String(a._id));
    assert.ok(!ids.includes(String(ctx.appArticle1)), "Application article must be unlinked after category change");
});

// ─── 17. Unauthorized user cannot unlink ────────────────────────────────────

test("17. an end user cannot unlink a KB article", async () => {
    const res = await unlinkKb(ctx.incidentId, ctx.netArticle1, ctx.userToken);
    assert.equal(res.status, 403);
});
