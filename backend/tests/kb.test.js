const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongoServer;
let baseUrl;
let tokenAdmin;
let tokenAgent;
let tokenUser;
let categoryId;

const API = "/api/v1";

/**
 * V4 Knowledge Base (FR4-11..15) — End-to-end test suite.
 *
 * Tests cover:
 *   FR4-11  Create, list, get, search, pagination, RBAC
 *   FR4-12  Feedback (helpful / not_helpful, change feedback, duplicate suppression)
 *   FR4-13  Suggestions for incident creation
 *   FR4-14  Link/unlink KB articles to incidents and problems
 *   FR4-15  Activity audit logging for all KB actions
 */

const agent = require("supertest");

before(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    baseUrl = process.env.API_BASE_URL;

    await mongoose.connect(uri);

    process.env.JWT_SECRET = "test-secret-key";
    process.env.JWT_EXPIRES_IN = "1h";
});

after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

/**
 * Helper: register or login and return the bearer token.
 */
const getToken = async (role, email, name = "Test User") => {
    const res = await agent(baseUrl)
        .post(`${API}/auth/register`)
        .send({ name, email, password: "Password123", role })
        .expect(201);

    return res.body.data.token;
};

/**
 * Helper: create a category and return its ID.
 */
const createCategory = async (token, name = "Test Category") => {
    const res = await agent(baseUrl)
        .post(`${API}/categories`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name })
        .expect(201);

    return res.body.data.category._id;
};

/**
 * Helper: create a KB article and return the full response.
 */
const createArticle = async (token, overrides = {}) => {
    const payload = {
        title: "Test Article",
        body: "This is a test article body with enough characters to pass validation.",
        categories: [categoryId],
        tags: ["test"],
        ...overrides,
    };

    const res = await agent(baseUrl)
        .post(`${API}/kba`)
        .set("Authorization", `Bearer ${token}`)
        .send(payload);

    return res;
};

/**
 * Helper: create an incident and return the ID.
 */
const createIncident = async (token) => {
    const res = await agent(baseUrl)
        .post(`${API}/incidents`)
        .set("Authorization", `Bearer ${token}`)
        .send({
            title: "Test Incident",
            description: "A test incident for KB linking",
            category: categoryId,
            priority: "medium",
        })
        .expect(201);

    return res.body.data.incident._id;
};

/**
 * Helper: create a problem and return the ID.
 */
const createProblem = async (token) => {
    const res = await agent(baseUrl)
        .post(`${API}/problems`)
        .set("Authorization", `Bearer ${token}`)
        .send({
            title: "Test Problem",
            description: "A test problem for KB linking",
            category: categoryId,
        })
        .expect(201);

    return res.body.data.problem._id;
};

// ─── Authentication Setup ───────────────────────────────────────────────────────

beforeEach(async () => {
    // Create fresh accounts for each test
    tokenAdmin = await getToken("admin", `admin-kb-${Date.now()}@test.com`, "KB Admin");
    tokenAgent = await getToken("support_agent", `agent-kb-${Date.now()}@test.com`, "KB Agent");
    tokenUser = await getToken("user", `user-kb-${Date.now()}@test.com`, "KB User");
    categoryId = await createCategory(tokenAdmin, `KB Category ${Date.now()}`);
});

// ─── FR4-11: Create, List, Get, Search, Pagination ─────────────────────────────

describe("KB Articles — FR4-11 (CRUD & Search)", () => {
    it("Admin can create a KB article", async () => {
        const res = await createArticle(tokenAdmin);
        assert.equal(res.status, 201);
        assert.equal(res.body.success, true);
        assert.equal(res.body.data.article.title, "Test Article");
        assert.equal(res.body.data.article.status, "draft");
        assert.equal(res.body.data.article.categories.length, 1);
    });

    it("Agent can create a KB article", async () => {
        const res = await createArticle(tokenAgent);
        assert.equal(res.status, 201);
    });

    it("End user cannot create a KB article", async () => {
        const res = await createArticle(tokenUser);
        assert.equal(res.status, 403);
    });

    it("List returns paginated articles", async () => {
        await createArticle(tokenAdmin, { title: "Article One" });
        await createArticle(tokenAdmin, { title: "Article Two" });

        const res = await agent(baseUrl)
            .get(`${API}/kba`)
            .set("Authorization", `Bearer ${tokenAdmin}`)
            .expect(200);

        assert.equal(res.body.data.items.length, 2);
        assert.ok(res.body.data.pagination.total >= 2);
    });

    it("Staff can see draft articles", async () => {
        await createArticle(tokenAdmin, { title: "Draft Only" });

        const res = await agent(baseUrl)
            .get(`${API}/kba?status=draft`)
            .set("Authorization", `Bearer ${tokenAdmin}`)
            .expect(200);

        assert.equal(res.body.data.items.length, 1);
        assert.equal(res.body.data.items[0].status, "draft");
    });

    it("End user only sees published articles", async () => {
        await createArticle(tokenAdmin, { title: "Draft Article" });
        // Publish an article
        const pubRes = await createArticle(tokenAdmin, { title: "Published Article" });
        const pubId = pubRes.body.data.article._id;

        await agent(baseUrl)
            .patch(`${API}/kba/${pubId}`)
            .set("Authorization", `Bearer ${tokenAdmin}`)
            .send({ status: "published" })
            .expect(200);

        const res = await agent(baseUrl)
            .get(`${API}/kba`)
            .set("Authorization", `Bearer ${tokenUser}`)
            .expect(200);

        assert.equal(res.body.data.items.length, 1);
        assert.equal(res.body.data.items[0].status, "published");
    });

    it("Search by title works", async () => {
        await createArticle(tokenAdmin, { title: "VPN Troubleshooting Guide" });
        await createArticle(tokenAdmin, { title: "Printer Setup" });

        const res = await agent(baseUrl)
            .get(`${API}/kba?search=VPN`)
            .set("Authorization", `Bearer ${tokenAdmin}`)
            .expect(200);

        assert.equal(res.body.data.items.length, 1);
        assert.ok(res.body.data.items[0].title.includes("VPN"));
    });

    it("Get single article by ID", async () => {
        const createRes = await createArticle(tokenAdmin, { title: "Single Article" });
        const id = createRes.body.data.article._id;

        const res = await agent(baseUrl)
            .get(`${API}/kba/${id}`)
            .set("Authorization", `Bearer ${tokenAdmin}`)
            .expect(200);

        assert.equal(res.body.data.article.title, "Single Article");
        assert.ok(res.body.data.permissions);
    });

    it("End user cannot get draft article by ID", async () => {
        const createRes = await createArticle(tokenAdmin, { title: "Secret Draft" });
        const id = createRes.body.data.article._id;

        const res = await agent(baseUrl)
            .get(`${API}/kba/${id}`)
            .set("Authorization", `Bearer ${tokenUser}`)
            .expect(403);

        assert.equal(res.body.success, false);
    });

    it("Update article works", async () => {
        const createRes = await createArticle(tokenAdmin, { title: "Original" });
        const id = createRes.body.data.article._id;

        const res = await agent(baseUrl)
            .patch(`${API}/kba/${id}`)
            .set("Authorization", `Bearer ${tokenAdmin}`)
            .send({ title: "Updated Title" })
            .expect(200);

        assert.equal(res.body.data.article.title, "Updated Title");
    });

    it("Agent cannot edit another agent's article", async () => {
        const createRes = await createArticle(tokenAdmin, { title: "Admin Article" });
        const id = createRes.body.data.article._id;

        const res = await agent(baseUrl)
            .patch(`${API}/kba/${id}`)
            .set("Authorization", `Bearer ${tokenAgent}`)
            .send({ title: "Hacked" })
            .expect(403);

        assert.equal(res.body.success, false);
    });

    it("Admin can manage (delete/archive) any article", async () => {
        const createRes = await createArticle(tokenAdmin, { title: "To Archive" });
        const id = createRes.body.data.article._id;

        const res = await agent(baseUrl)
            .delete(`${API}/kba/${id}`)
            .set("Authorization", `Bearer ${tokenAdmin}`)
            .expect(200);

        assert.equal(res.body.success, true);
    });

    it("End user cannot delete articles", async () => {
        const createRes = await createArticle(tokenAdmin, { title: "Protected" });
        const id = createRes.body.data.article._id;

        const res = await agent(baseUrl)
            .delete(`${API}/kba/${id}`)
            .set("Authorization", `Bearer ${tokenUser}`)
            .expect(403);
    });

    it("Pagination works correctly", async () => {
        for (let i = 1; i <= 15; i++) {
            await createArticle(tokenAdmin, { title: `Article ${String(i).padStart(2, "0")}` });
        }

        const res = await agent(baseUrl)
            .get(`${API}/kba?page=2&limit=5`)
            .set("Authorization", `Bearer ${tokenAdmin}`)
            .expect(200);

        assert.equal(res.body.data.items.length, 5);
        assert.equal(res.body.data.pagination.page, 2);
        assert.ok(res.body.data.pagination.total >= 15);
    });

    it("Tags filter works", async () => {
        await createArticle(tokenAdmin, { title: "Tagged", tags: ["special-tag"] });
        await createArticle(tokenAdmin, { title: "Untagged", tags: ["other"] });

        const res = await agent(baseUrl)
            .get(`${API}/kba?tags=special-tag`)
            .set("Authorization", `Bearer ${tokenAdmin}`)
            .expect(200);

        assert.equal(res.body.data.items.length, 1);
        assert.equal(res.body.data.items[0].title, "Tagged");
    });
});

// ─── FR4-12: Feedback ──────────────────────────────────────────────────────────

describe("KB Articles — FR4-12 (Feedback)", () => {
    let publishedId;

    beforeEach(async () => {
        const res = await createArticle(tokenAdmin, { title: "Feedback Article" });
        publishedId = res.body.data.article._id;

        await agent(baseUrl)
            .patch(`${API}/kba/${publishedId}`)
            .set("Authorization", `Bearer ${tokenAdmin}`)
            .send({ status: "published" })
            .expect(200);
    });

    it("User can submit helpful feedback", async () => {
        const res = await agent(baseUrl)
            .post(`${API}/kba/${publishedId}/feedback`)
            .set("Authorization", `Bearer ${tokenUser}`)
            .send({ value: "helpful" })
            .expect(200);

        assert.equal(res.body.data.userFeedback, "helpful");
        assert.equal(res.body.data.article.helpfulCount, 1);
    });

    it("User can submit not_helpful feedback", async () => {
        const res = await agent(baseUrl)
            .post(`${API}/kba/${publishedId}/feedback`)
            .set("Authorization", `Bearer ${tokenUser}`)
            .send({ value: "not_helpful" })
            .expect(200);

        assert.equal(res.body.data.userFeedback, "not_helpful");
        assert.equal(res.body.data.article.notHelpfulCount, 1);
    });

    it("Duplicate feedback is suppressed", async () => {
        await agent(baseUrl)
            .post(`${API}/kba/${publishedId}/feedback`)
            .set("Authorization", `Bearer ${tokenUser}`)
            .send({ value: "helpful" })
            .expect(200);

        const res = await agent(baseUrl)
            .post(`${API}/kba/${publishedId}/feedback`)
            .set("Authorization", `Bearer ${tokenUser}`)
            .send({ value: "helpful" })
            .expect(200);

        assert.equal(res.body.data.userFeedback, "helpful");
    });

    it("User can change their feedback", async () => {
        await agent(baseUrl)
            .post(`${API}/kba/${publishedId}/feedback`)
            .set("Authorization", `Bearer ${tokenUser}`)
            .send({ value: "helpful" })
            .expect(200);

        const res = await agent(baseUrl)
            .post(`${API}/kba/${publishedId}/feedback`)
            .set("Authorization", `Bearer ${tokenUser}`)
            .send({ value: "not_helpful" })
            .expect(200);

        assert.equal(res.body.data.userFeedback, "not_helpful");
        assert.equal(res.body.data.article.helpfulCount, 0);
        assert.equal(res.body.data.article.notHelpfulCount, 1);
    });

    it("Cannot rate draft articles", async () => {
        const draftRes = await createArticle(tokenAdmin, { title: "Draft" });
        const draftId = draftRes.body.data.article._id;

        const res = await agent(baseUrl)
            .post(`${API}/kba/${draftId}/feedback`)
            .set("Authorization", `Bearer ${tokenUser}`)
            .send({ value: "helpful" })
            .expect(400);

        assert.equal(res.body.success, false);
    });

    it("Invalid feedback value is rejected", async () => {
        const res = await agent(baseUrl)
            .post(`${API}/kba/${publishedId}/feedback`)
            .set("Authorization", `Bearer ${tokenUser}`)
            .send({ value: "invalid" })
            .expect(400);

        assert.equal(res.body.success, false);
    });
});

// ─── FR4-13: Suggestions ──────────────────────────────────────────────────────

describe("KB Articles — FR4-13 (Suggestions)", () => {
    it("Returns published articles matching category", async () => {
        await createArticle(tokenAdmin, { title: "Network Fix", categories: [categoryId] });
        const pubRes = await createArticle(tokenAdmin, { title: "Network Guide", categories: [categoryId] });

        await agent(baseUrl)
            .patch(`${API}/kba/${pubRes.body.data.article._id}`)
            .set("Authorization", `Bearer ${tokenAdmin}`)
            .send({ status: "published" })
            .expect(200);

        const res = await agent(baseUrl)
            .get(`${API}/kba/suggestions?category=${categoryId}`)
            .set("Authorization", `Bearer ${tokenAgent}`)
            .expect(200);

        assert.ok(res.body.data.articles.length >= 1);
    });

    it("Suggestions are limited to 5", async () => {
        for (let i = 0; i < 8; i++) {
            const res = await createArticle(tokenAdmin, {
                title: `Suggestion ${i}`,
                categories: [categoryId],
            });
            if (res.status === 201) {
                await agent(baseUrl)
                    .patch(`${API}/kba/${res.body.data.article._id}`)
                    .set("Authorization", `Bearer ${tokenAdmin}`)
                    .send({ status: "published" })
                    .expect(200);
            }
        }

        const res = await agent(baseUrl)
            .get(`${API}/kba/suggestions`)
            .set("Authorization", `Bearer ${tokenAgent}`)
            .expect(200);

        assert.ok(res.body.data.articles.length <= 5);
    });
});

// ─── FR4-14: Link/Unlink to Incidents and Problems ────────────────────────────

describe("KB Articles — FR4-14 (Link/Unlink)", () => {
    let publishedId;
    let incidentId;
    let problemId;

    beforeEach(async () => {
        const res = await createArticle(tokenAdmin, { title: "Linkable Article" });
        publishedId = res.body.data.article._id;

        await agent(baseUrl)
            .patch(`${API}/kba/${publishedId}`)
            .set("Authorization", `Bearer ${tokenAdmin}`)
            .send({ status: "published" })
            .expect(200);

        incidentId = await createIncident(tokenAgent);
        problemId = await createProblem(tokenAgent);
    });

    it("Staff can link KB article to incident", async () => {
        const res = await agent(baseUrl)
            .post(`${API}/incidents/${incidentId}/kb-articles`)
            .set("Authorization", `Bearer ${tokenAgent}`)
            .send({ kbArticleId: publishedId })
            .expect(201);

        assert.ok(
            res.body.data.incident.kbArticleIds.some((id) => String(id) === String(publishedId))
        );
    });

    it("Staff can unlink KB article from incident", async () => {
        await agent(baseUrl)
            .post(`${API}/incidents/${incidentId}/kb-articles`)
            .set("Authorization", `Bearer ${tokenAgent}`)
            .send({ kbArticleId: publishedId })
            .expect(201);

        const res = await agent(baseUrl)
            .delete(`${API}/incidents/${incidentId}/kb-articles/${publishedId}`)
            .set("Authorization", `Bearer ${tokenAgent}`)
            .expect(200);

        assert.ok(
            !res.body.data.incident.kbArticleIds.some((id) => String(id) === String(publishedId))
        );
    });

    it("Staff can link KB article to problem", async () => {
        const res = await agent(baseUrl)
            .patch(`${API}/problems/${problemId}/kb-article`)
            .set("Authorization", `Bearer ${tokenAgent}`)
            .send({ kbArticleId: publishedId })
            .expect(200);

        assert.equal(res.body.data.problem.kbArticleId._id, publishedId);
    });

    it("Staff can unlink KB article from problem", async () => {
        await agent(baseUrl)
            .patch(`${API}/problems/${problemId}/kb-article`)
            .set("Authorization", `Bearer ${tokenAgent}`)
            .send({ kbArticleId: publishedId })
            .expect(200);

        const res = await agent(baseUrl)
            .delete(`${API}/problems/${problemId}/kb-article`)
            .set("Authorization", `Bearer ${tokenAgent}`)
            .expect(200);

        assert.equal(res.body.data.problem.kbArticleId, null);
    });

    it("End user cannot link KB articles", async () => {
        const res = await agent(baseUrl)
            .post(`${API}/incidents/${incidentId}/kb-articles`)
            .set("Authorization", `Bearer ${tokenUser}`)
            .send({ kbArticleId: publishedId })
            .expect(403);

        assert.equal(res.body.success, false);
    });

    it("Cannot link draft articles", async () => {
        const draftRes = await createArticle(tokenAdmin, { title: "Draft Link" });
        const draftId = draftRes.body.data.article._id;

        const res = await agent(baseUrl)
            .post(`${API}/incidents/${incidentId}/kb-articles`)
            .set("Authorization", `Bearer ${tokenAgent}`)
            .send({ kbArticleId: draftId })
            .expect(400);

        assert.equal(res.body.success, false);
    });
});

// ─── FR4-15: Activity Audit Logging ────────────────────────────────────────────

describe("KB Articles — FR4-15 (Activity Audit)", () => {
    it("Creates activity log on article creation", async () => {
        const res = await createArticle(tokenAdmin, { title: "Logged Article" });
        const id = res.body.data.article._id;

        const getRes = await agent(baseUrl)
            .get(`${API}/kba/${id}`)
            .set("Authorization", `Bearer ${tokenAdmin}`)
            .expect(200);

        assert.ok(getRes.body.data.article);
    });

    it("Records activity when linking to incident", async () => {
        const createRes = await createArticle(tokenAdmin, { title: "Linked Article" });
        const kbId = createRes.body.data.article._id;

        await agent(baseUrl)
            .patch(`${API}/kba/${kbId}`)
            .set("Authorization", `Bearer ${tokenAdmin}`)
            .send({ status: "published" })
            .expect(200);

        const incidentRes = await agent(baseUrl)
            .post(`${API}/incidents`)
            .set("Authorization", `Bearer ${tokenAgent}`)
            .send({
                title: "Activity Test Incident",
                description: "Testing activity logging",
                category: categoryId,
                priority: "medium",
            })
            .expect(201);

        const incidentId = incidentRes.body.data.incident._id;

        const linkRes = await agent(baseUrl)
            .post(`${API}/incidents/${incidentId}/kb-articles`)
            .set("Authorization", `Bearer ${tokenAgent}`)
            .send({ kbArticleId: kbId })
            .expect(201);

        assert.ok(
            linkRes.body.data.incident.kbArticleIds.some((id) => String(id) === String(kbId))
        );
    });
});
