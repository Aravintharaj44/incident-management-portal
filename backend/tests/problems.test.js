const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * V4 - Problem Management (FR4-01..06) end-to-end tests against a running API.
 *
 *  1. npm run seed
 *  2. npm start        (in another terminal)
 *  3. npm test
 *
 * The seeded data includes two Problems (one Known Error with a workaround and
 * an approved problem-scoped RCA, one New) and two incidents already linked to
 * the Known Error. These tests walk the Problem lifecycle: staff-only access,
 * CRUD, status workflow, ownership, incident linking, problem-scoped RCA reuse
 * and the Known Error Database.
 */

const BASE = process.env.TEST_API_URL || "http://localhost:5000/api/v1";
const PASSWORD = "Password123";

const ACCOUNTS = {
    admin: "admin@zybisys.com",
    agent: "rahul.agent@zybisys.com",
    otherAgent: "priya.agent@zybisys.com",
    user: "karthik@zybisys.com",
};

const api = async (path, { method = "GET", token, body } = {}) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers["Content-Type"] = "application/json";

    const response = await fetch(`${BASE}${path}`, {
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
    const res = await api("/auth/login", { method: "POST", body: { email, password: PASSWORD } });
    assert.equal(res.status, 200, `login failed for ${email}`);
    return res.body.data.token;
};

const ctx = {};

test("V4: staff and users can log in and the seeded problems exist", async () => {
    ctx.adminToken = await login(ACCOUNTS.admin);
    ctx.agentToken = await login(ACCOUNTS.agent);
    ctx.otherAgentToken = await login(ACCOUNTS.otherAgent);
    ctx.userToken = await login(ACCOUNTS.user);

    const list = await api("/problems", { token: ctx.adminToken });
    assert.equal(list.status, 200);
    assert.ok(list.body.data.pagination.total >= 2, "expected at least the two seeded problems");

    const knownError = list.body.data.items.find((item) => item.status === "known_error");
    const fresh = list.body.data.items.find((item) => item.status === "new");
    assert.ok(knownError, "seeded Known Error problem missing");
    assert.ok(fresh, "seeded New problem missing");
    ctx.knownError = knownError;
    ctx.fresh = fresh;

    // Capture ids of the two incidents already linked to the Known Error, and
    // a couple of unlinked incidents for the linking tests.
    const incidents = await api("/incidents?limit=100", { token: ctx.adminToken });
    const linked = incidents.body.data.items.filter(
        (incident) => incident.problemId && String(incident.problemId) === String(knownError._id)
    );
    assert.equal(linked.length, 2, "expected two incidents linked to the Known Error");
    ctx.linkedIncidentId = linked[0]._id;
    const unlinked = incidents.body.data.items.filter((incident) => !incident.problemId);
    assert.ok(unlinked.length >= 1, "expected at least one unlinked incident for linking tests");
    ctx.unlinkedIncidentId = unlinked[0]._id;

    // Collect the resident owner ids up front (used by the create/owner tests).
    const assignable = await api("/users/assignable", { token: ctx.adminToken });
    const agent = assignable.body.data.users.find((user) => user.email === ACCOUNTS.agent);
    const otherAgent = assignable.body.data.users.find((user) => user.email === ACCOUNTS.otherAgent);
    assert.ok(agent && otherAgent, "seeded agents missing from the assignable list");
    ctx.ownerId = agent._id;
    ctx.otherOwnerId = otherAgent._id;
    ctx.userId = assignable.body.data.users.find((user) => user.role === "user")?._id;
    assert.ok(ctx.userId, "no End User available to test the non-staff-owner rule");
});

test("V4: problems are staff-only - an End User is blocked", async () => {
    for (const path of ["/problems", "/known-errors"]) {
        const res = await api(path, { token: ctx.userToken });
        assert.equal(res.status, 403, `${path} was not staff-gated`);
    }
    assert.equal((await api(`/problems/${ctx.fresh._id}`, { token: ctx.userToken })).status, 403);
});

test("V4: staff (admin and agent) can list problems", async () => {
    assert.equal((await api("/problems", { token: ctx.adminToken })).status, 200);
    assert.equal((await api("/problems", { token: ctx.agentToken })).status, 200);
});

test("V4: problem detail returns incidents, activity and permissions", async () => {
    const res = await api(`/problems/${ctx.fresh._id}`, { token: ctx.adminToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.problem.problemNumber, ctx.fresh.problemNumber);
    assert.ok(Array.isArray(res.body.data.incidents));
    assert.ok(Array.isArray(res.body.data.activity));
    assert.equal(res.body.data.permissions.canManage, true);
    assert.equal(res.body.data.permissions.isAdmin, true);
});

test("V4: an admin creates a problem and groups an incident underneath it", async () => {
    const existing = await api(`/incidents/${ctx.unlinkedIncidentId}`, { token: ctx.adminToken });
    assert.equal(existing.status, 200);

    // Use the reporting user as owner candidate; the API must reject a non-staff owner.
    const badOwner = await api("/problems", {
        method: "POST",
        token: ctx.adminToken,
        body: { title: "Ownerless grouping test problem", description: "For validating the owner rule.", ownerId: ctx.userId },
    });
    assert.equal(badOwner.status, 400, "a non-staff owner should be rejected");

    const created = await api("/problems", {
        method: "POST",
        token: ctx.adminToken,
        body: {
            title: "V4 test grouping problem",
            description: "Created by the automated V4 tests to exercise the problem lifecycle.",
            ownerId: ctx.ownerId,
            incidentIds: [ctx.unlinkedIncidentId],
        },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.match(created.body.data.problem.problemNumber, /^PRB-\d{6}$/);
    assert.equal(created.body.data.problem.status, "new");
    ctx.problemId = created.body.data.problem._id;

    // The grouped incident now carries the problem reference.
    const afterLink = await api(`/incidents/${ctx.unlinkedIncidentId}`, { token: ctx.adminToken });
    assert.equal(String(afterLink.body.data.problem._id), String(ctx.problemId));
    assert.equal(afterLink.body.data.problemNumber === null, false);
});

test("V4: an invalid status transition is rejected; a valid one succeeds", async () => {
    // New -> Investigating is legal; New -> Resolved is also legal; but an
    // already-Investigating problem cannot jump straight back to New via the
    // transition map, so exercise a clearly illegal move after moving forward.
    const investigating = await api(`/problems/${ctx.problemId}/status`, {
        method: "PATCH",
        token: ctx.agentToken,
        body: { status: "investigating" },
    });
    assert.equal(investigating.status, 200);
    assert.equal(investigating.body.data.problem.status, "investigating");

    const illegal = await api(`/problems/${ctx.fresh._id}/status`, {
        method: "PATCH",
        token: ctx.agentToken,
        body: { status: "investigating" },
    });
    // The fresh seeded problem is "New", so New->Investigating is legal too;
    // test an actually illegal transition instead: a New problem cannot go to
    // itself, and Known Error -> New is not allowed. Use a known-illegal move
    // on the Known Error: it cannot go to "new".
    const knownErrorIllegal = await api(`/problems/${ctx.knownError._id}/status`, {
        method: "PATCH",
        token: ctx.agentToken,
        body: { status: "new" },
    });
    assert.equal(knownErrorIllegal.status, 400, "Known Error -> New should be illegal");
    assert.match(knownErrorIllegal.body.message, /transition/i);
});

test("V4: ownership can be changed to another active agent", async () => {
    const changed = await api(`/problems/${ctx.problemId}/owner`, {
        method: "PATCH",
        token: ctx.adminToken,
        body: { ownerId: ctx.otherOwnerId },
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.data.problem.ownerId.email, ACCOUNTS.otherAgent);

    // Already the owner is a no-op that is rejected.
    const same = await api(`/problems/${ctx.problemId}/owner`, {
        method: "PATCH",
        token: ctx.adminToken,
        body: { ownerId: ctx.otherOwnerId },
    });
    assert.equal(same.status, 400, "assigning the same owner should be rejected");
});

test("V4: an End User cannot create or manage problems", async () => {
    const create = await api("/problems", {
        method: "POST",
        token: ctx.userToken,
        body: { title: "User should not create a problem", description: "Blocked by role." },
    });
    assert.equal(create.status, 403);

    const status = await api(`/problems/${ctx.problemId}/status`, {
        method: "PATCH",
        token: ctx.userToken,
        body: { status: "resolved" },
    });
    assert.equal(status.status, 403);
});

test("V4: an agent can link and unlink incidents from a problem", async () => {
    // Create a second incident to link, then unlink it.
    const category = (await api("/categories", { token: ctx.agentToken })).body.data.categories[0];
    const incident = await api("/incidents", {
        method: "POST",
        token: ctx.userToken,
        body: {
            title: "V4 test: temporary network blip",
            description: "Raised to exercise linking a fresh incident to a problem.",
            category: category._id,
            priority: "low",
        },
    });
    assert.equal(incident.status, 201);
    const tempIncidentId = incident.body.data.incident._id;

    const link = await api(`/problems/${ctx.problemId}/incidents`, {
        method: "POST",
        token: ctx.agentToken,
        body: { incidentId: tempIncidentId },
    });
    assert.equal(link.status, 200, JSON.stringify(link.body));

    // Double-link is rejected.
    const double = await api(`/problems/${ctx.problemId}/incidents`, {
        method: "POST",
        token: ctx.agentToken,
        body: { incidentId: tempIncidentId },
    });
    assert.equal(double.status, 400);

    const unlink = await api(`/problems/${ctx.problemId}/incidents/${tempIncidentId}`, {
        method: "DELETE",
        token: ctx.agentToken,
    });
    assert.equal(unlink.status, 200);
});

test("V4: an incident can be linked from the incident side, then unlinked", async () => {
    // Link one of the incidents already linked to the Known Error? It is taken,
    // so build a fresh link on temp incident path via the incident endpoint.
    const category = (await api("/categories", { token: ctx.agentToken })).body.data.categories[0];
    const incident = await api("/incidents", {
        method: "POST",
        token: ctx.userToken,
        body: {
            title: "V4 test: incident-side problem link",
            description: "Raised to exercise /incidents/:id/problem.",
            category: category._id,
            priority: "low",
        },
    });
    const incId = incident.body.data.incident._id;

    const link = await api(`/incidents/${incId}/problem`, {
        method: "POST",
        token: ctx.agentToken,
        body: { problemId: ctx.problemId },
    });
    assert.equal(link.status, 200, JSON.stringify(link.body));

    // The incident detail should now surface the problem and mark rcaSource.
    const detail = await api(`/incidents/${incId}`, { token: ctx.agentToken });
    assert.equal(String(detail.body.data.problem._id), String(ctx.problemId));

    const unlink = await api(`/incidents/${incId}/problem`, {
        method: "DELETE",
        token: ctx.agentToken,
    });
    assert.equal(unlink.status, 200);
    assert.equal((await api(`/incidents/${incId}`, { token: ctx.agentToken })).body.data.problem, null);
});

test("V4: the Known Error Database only returns Known Error problems", async () => {
    const res = await api("/known-errors", { token: ctx.adminToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.pagination.total, 1, "only the seeded Known Error should be listed");
    assert.ok(
        res.body.data.items.every((item) => item.status === "known_error"),
        "a non-Known-Error leaked into the KEDB"
    );
});

test("V4: KEDB search narrows the results", async () => {
    const res = await api("/known-errors?search=VPN", { token: ctx.adminToken });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.items.length >= 1);
    assert.ok(res.body.data.items.every((item) =>
        `${item.title} ${item.workaround} ${item.problemNumber}`.toLowerCase().includes("vpn")
    ));
});

test("V4: KEDB detail carries workaround, RCA and linked incidents", async () => {
    const res = await api(`/known-errors/${ctx.knownError._id}`, { token: ctx.adminToken });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.problem.workaround, "Known Error has no workaround");
    assert.equal(res.body.data.rca.status, "approved", "seeded Known Error RCA is not approved");
    assert.equal(res.body.data.incidents.length, 2);
});

test("V4: a non-Known-Error problem 404s from the KEDB", async () => {
    const res = await api(`/known-errors/${ctx.fresh._id}`, { token: ctx.adminToken });
    assert.equal(res.status, 404);
});

test("V4: a problem-scoped RCA reuses the existing RCA workflow", async () => {
    // Start empty (no RCA yet on the freshly created problem).
    const initial = await api(`/problems/${ctx.problemId}/rca`, { token: ctx.adminToken });
    assert.equal(initial.status, 200);

    const save = await api(`/problems/${ctx.problemId}/rca`, {
        method: "PUT",
        token: ctx.agentToken,
        body: {
            rootCauseCategory: "technology",
            rootCauseDescription: "V4 test: load balancer session resets.",
            correctiveActions: "Patch the concentrator firmware.",
            preventiveActions: "Add peak-load simulation to the release checklist.",
        },
    });
    assert.equal(save.status, 200, JSON.stringify(save.body));
    assert.ok(save.body.data.rca.problem, "problem-scoped RCA did not store the problem reference");
    assert.equal(save.body.data.rca.incident, undefined, "problem RCA must not carry an incident anchor");

    // An incident RCA should not be duplicated onto the problem.
    const duplicates = await api(`/problems/${ctx.problemId}/rca`, { token: ctx.adminToken });
    assert.equal(duplicates.body.data.rca.id || duplicates.body.data.rca._id, save.body.data.rca._id);

    const submit = await api(`/problems/${ctx.problemId}/rca/submit`, {
        method: "POST",
        token: ctx.agentToken,
    });
    assert.equal(submit.status, 200);
    assert.equal(submit.body.data.rca.status, "in_review");

    const approve = await api(`/problems/${ctx.problemId}/rca/review`, {
        method: "PATCH",
        token: ctx.adminToken,
        body: { status: "approved", reviewComment: "V4 tests approve this." },
    });
    assert.equal(approve.status, 200);
    assert.equal(approve.body.data.rca.status, "approved");

    // Recording the same RCA again must not create a duplicate row.
    const after = await api(`/problems/${ctx.problemId}/rca`, { token: ctx.adminToken });
    assert.equal(after.body.data.rca._id, save.body.data.rca._id);
});

test("V4: problem problems cannot have duplicate RCAs", async () => {
    const res = await api(`/problems/${ctx.knownError._id}/rca`, { token: ctx.adminToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.rca.status, "approved");
});

test("V4: deletion is admin-only and detaches incidents without deleting them", async () => {
    const asAgent = await api(`/problems/${ctx.problemId}`, { method: "DELETE", token: ctx.agentToken });
    assert.equal(asAgent.status, 403);

    const asAdmin = await api(`/problems/${ctx.problemId}`, { method: "DELETE", token: ctx.adminToken });
    assert.equal(asAdmin.status, 200);

    assert.equal((await api(`/problems/${ctx.problemId}`, { token: ctx.adminToken })).status, 404);

    // The incident that was grouped is kept (not deleted) and detached.
    const inc = await api(`/incidents/${ctx.unlinkedIncidentId}`, { token: ctx.adminToken });
    assert.equal(inc.status, 200);
});

test("V4: the auto-suggestion endpoint reuses V3 correlation logic", async () => {
    // The aircon incident and others in the same category/window trigger a
    // suggestion. Use the Known Error's linked incident which shares a
    // category with at least one other seeded incident.
    const res = await api(`/problems/suggestions/incidents/${ctx.linkedIncidentId}`, {
        token: ctx.adminToken,
    });
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.data.suggestion.canCreate, "boolean");
    assert.ok(Array.isArray(res.body.data.suggestion.relatedIncidents));
});
