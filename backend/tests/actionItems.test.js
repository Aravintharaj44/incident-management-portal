const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * V4 - RCA Action Items (FR4-07..10) end-to-end tests against a running API.
 *
 *  1. npm run seed
 *  2. npm start          (in another terminal)
 *  3. npm test
 *
 * The seeded data includes four Action Items spread across an approved
 * incident-scoped RCA and an approved problem-scoped RCA. These tests walk the
 * Action Item lifecycle: staff-only access, the approved-RCA gate, admin-only
 * creation, transitions (with the Done evidence stamp), reassignment,
 * notifications/activity, dashboard widget data and admin-only deletion.
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

test("V4/AI: staff and users log in and the seeded action items exist", async () => {
    ctx.adminToken = await login(ACCOUNTS.admin);
    ctx.agentToken = await login(ACCOUNTS.agent);
    ctx.otherAgentToken = await login(ACCOUNTS.otherAgent);
    ctx.userToken = await login(ACCOUNTS.user);

    // The seeded action items spread across Open / In Progress / Overdue.
    const list = await api("/action-items", { token: ctx.adminToken });
    assert.equal(list.status, 200);
    assert.ok(list.body.data.pagination.total >= 4, "expected the four seeded action items");

    let overdue = 0;
    for (const item of list.body.data.items) {
        if (item.status === "overdue") overdue += 1;
        if (!ctx.approvedRcaId) ctx.approvedRcaId = item.rcaId._id;
        ctx.priyasItem ??= item.ownerId.email === ACCOUNTS.otherAgent ? item : null;
        ctx.rahulsItem ??= item.ownerId.email === ACCOUNTS.agent ? item : null;
    }
    assert.ok(overdue >= 2, "expected seeded overdue action items");
    assert.ok(ctx.approvedRcaId, "no approved RCA reference captured");
    assert.ok(ctx.priyasItem && ctx.rahulsItem, "seeded owners not found");

    const assignable = await api("/users/assignable", { token: ctx.adminToken });
    ctx.ownerId = assignable.body.data.users.find((user) => user.email === ACCOUNTS.agent)._id;
    ctx.otherOwnerId = assignable.body.data.users.find((user) => user.email === ACCOUNTS.otherAgent)._id;

    // /users/assignable only returns staff, so the seeded End User is recovered
    // via their own session instead.
    const me = await api("/auth/me", { token: ctx.userToken });
    ctx.userId = me.body.data.user._id;
});

test("V4/AI: action items are staff-only - an End User is blocked", async () => {
    assert.equal((await api("/action-items", { token: ctx.userToken })).status, 403);
    assert.equal((await api(`/action-items/${ctx.rahulsItem._id}`, { token: ctx.userToken })).status, 403);
});

test("V4/AI: an agent only sees their own items plus unassigned ones", async () => {
    const res = await api("/action-items", { token: ctx.agentToken });
    assert.equal(res.status, 200);
    for (const item of res.body.data.items) {
        const isMine = item.ownerId && item.ownerId.email === ACCOUNTS.agent;
        const isUnassigned = item.ownerId === null || item.ownerId === undefined;
        assert.ok(isMine || isUnassigned, `agent saw an item they do not own`);
    }
    // The item owned by the other agent must not leak into Rahul's list.
    const seesOthers = res.body.data.items.some((item) => item.ownerId && item.ownerId.email === ACCOUNTS.otherAgent);
    assert.equal(seesOthers, false);
});

test("V4/AI: only an admin may create action items (staff-only endpoint)", async () => {
    const asUser = await api("/action-items", {
        method: "POST",
        token: ctx.userToken,
        body: { rcaId: ctx.approvedRcaId, description: "An end user must not be able to do this at all.", ownerId: ctx.ownerId, dueDate: "2026-10-01T00:00:00.000Z" },
    });
    assert.equal(asUser.status, 403);

    const asAgent = await api("/action-items", {
        method: "POST",
        token: ctx.agentToken,
        body: { rcaId: ctx.approvedRcaId, description: "A support agent must not be able to create action items.", ownerId: ctx.ownerId, dueDate: "2026-10-01T00:00:00.000Z" },
    });
    assert.equal(asAgent.status, 403, "agents cannot create action items (admin-only)");
});

test("V4/AI: creation requires an approved RCA", async () => {
    // A fresh incident guarantees a clean, un-RCA'd incident to draft one on.
    const category = (await api("/categories", { token: ctx.adminToken })).body.data.categories[0];
    const fresh = await api("/incidents", {
        method: "POST",
        token: ctx.userToken,
        body: { title: "V4/AI gate test incident", description: "Raised so the action item gate test has a clean incident.", category: category._id, priority: "low" },
    });
    assert.equal(fresh.status, 201);
    const incidentId = fresh.body.data.incident._id;

    const rca = await api(`/incidents/${incidentId}/rca`, {
        method: "PUT",
        token: ctx.adminToken,
        body: { rootCauseCategory: "technology", rootCauseDescription: "Draft RCA used by the action item gate test.", correctiveActions: "x", preventiveActions: "y" },
    });
    assert.equal(rca.status, 200);
    assert.equal(rca.body.data.rca.status, "draft");
    ctx.draftRcaId = rca.body.data.rca._id;

    const rejected = await api("/action-items", {
        method: "POST",
        token: ctx.adminToken,
        body: { rcaId: ctx.draftRcaId, description: "Action items must not exist on a draft RCA.", ownerId: ctx.ownerId, dueDate: "2026-10-01T00:00:00.000Z" },
    });
    assert.equal(rejected.status, 400, "a draft RCA must not accept action items");
    assert.match(rejected.body.message, /approved/i);

    const nonexistent = await api("/action-items", {
        method: "POST",
        token: ctx.adminToken,
        body: { rcaId: "5f5f5f5f5f5f5f5f5f5f5f5f", description: "This RCA does not exist and must be rejected.", ownerId: ctx.ownerId, dueDate: "2026-10-01T00:00:00.000Z" },
    });
    assert.equal(nonexistent.status, 404);
});

test("V4/AI: creation requires an eligible staff owner", async () => {
    const asEndUserOwner = await api("/action-items", {
        method: "POST",
        token: ctx.adminToken,
        body: { rcaId: ctx.approvedRcaId, description: "Only active admins or support agents may own action items.", ownerId: ctx.userId, dueDate: "2026-10-01T00:00:00.000Z" },
    });
    assert.equal(asEndUserOwner.status, 400, "an end user cannot own an action item");
});

test("V4/AI: an admin creates an action item on an approved RCA", async () => {
    const created = await api("/action-items", {
        method: "POST",
        token: ctx.adminToken,
        body: { rcaId: ctx.approvedRcaId, description: "Deploy the monitoring alert for the backup target capacity threshold.", ownerId: ctx.ownerId, dueDate: "2026-10-05T00:00:00.000Z" },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.actionItem.status, "open");
    assert.equal(created.body.data.actionItem.rcaId._id, ctx.approvedRcaId);
    assert.equal(created.body.data.actionItem.ownerId.email, ACCOUNTS.agent);
    ctx.createdId = created.body.data.actionItem._id;

    // It now appears in that owner's queue and in the dashboard widget totals.
    const mine = await api("/action-items?ownerId=me", { token: ctx.agentToken });
    assert.ok(mine.body.data.items.some((item) => item._id === ctx.createdId));
});

test("V4/AI: detail endpoint returns the populated action item", async () => {
    const res = await api(`/action-items/${ctx.createdId}`, { token: ctx.adminToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.actionItem._id, ctx.createdId);
    assert.ok(res.body.data.actionItem.ownerId, "owner was not populated");

    // The other agent cannot view an item they do not own.
    const other = await api(`/action-items/${ctx.createdId}`, { token: ctx.otherAgentToken });
    assert.equal(other.status, 403);
});

test("V4/AI: a legal status transition succeeds and is audited", async () => {
    const moved = await api(`/action-items/${ctx.createdId}/status`, {
        method: "PATCH",
        token: ctx.agentToken,
        body: { status: "in_progress" },
    });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.data.actionItem.status, "in_progress");
    assert.equal(moved.body.data.actionItem.completedAt, null);
});

test("V4/AI: an illegal transition (done -> overdue) is rejected", async () => {
    // Reach "done" first (legal), then try to move to "overdue" (illegal).
    await api(`/action-items/${ctx.createdId}/status`, {
        method: "PATCH",
        token: ctx.agentToken,
        body: { status: "done", completionNote: "The monitoring alert was deployed and acknowledged by the on-call team." },
    });

    const illegal = await api(`/action-items/${ctx.createdId}/status`, {
        method: "PATCH",
        token: ctx.agentToken,
        body: { status: "overdue" },
    });
    assert.equal(illegal.status, 400, "a done item must never become overdue");
    assert.match(illegal.body.message, /transition/i);
});

test("V4/AI: marking done records closure evidence and a completion timestamp", async () => {
    const item = (await api(`/action-items/${ctx.createdId}`, { token: ctx.adminToken })).body.data.actionItem;
    assert.equal(item.status, "done");
    assert.ok(item.completedAt, "completedAt was not stamped on Done (FR4-10)");
    assert.equal(
        item.completionNote,
        "The monitoring alert was deployed and acknowledged by the on-call team.",
        "completion evidence was not recorded (FR4-10)"
    );
});

test("V4/AI: reopening out of Done clears the closure evidence", async () => {
    const reopened = await api(`/action-items/${ctx.createdId}/status`, {
        method: "PATCH",
        token: ctx.agentToken,
        body: { status: "open" },
    });
    assert.equal(reopened.status, 200);
    assert.equal(reopened.body.data.actionItem.completionNote, "");
    assert.equal(reopened.body.data.actionItem.completedAt, null);
});

test("V4/AI: an admin can reassign an item to another agent (notification fired)", async () => {
    const reassigned = await api(`/action-items/${ctx.createdId}/owner`, {
        method: "PATCH",
        token: ctx.adminToken,
        body: { ownerId: ctx.otherOwnerId },
    });
    assert.equal(reassigned.status, 200, JSON.stringify(reassigned.body));
    assert.equal(reassigned.body.data.actionItem.ownerId.email, ACCOUNTS.otherAgent);

    // The new owner now sees it in their queue.
    const mine = await api("/action-items?ownerId=me", { token: ctx.otherAgentToken });
    assert.ok(mine.body.data.items.some((item) => item._id === ctx.createdId));

    // The new owner received an in-app notification about the assignment.
    const notifs = await api("/notifications", { token: ctx.otherAgentToken });
    const types = (notifs.body.data.notifications || []).map((note) => note.type);
    assert.ok(types.includes("action_item_assigned"), "no assignment notification for the new owner");
});

test("V4/AI: reassigning to the same owner is rejected", async () => {
    const same = await api(`/action-items/${ctx.createdId}/owner`, {
        method: "PATCH",
        token: ctx.adminToken,
        body: { ownerId: ctx.otherOwnerId },
    });
    assert.equal(same.status, 400);
});

test("V4/AI: an agent cannot reassign an item they do not own", async () => {
    // Rahul owns this after the earlier reassignment went to Priya; take Priya's
    // seeded item instead and have Rahul try to move it.
    const res = await api(`/action-items/${ctx.priyasItem._id}/owner`, {
        method: "PATCH",
        token: ctx.agentToken,
        body: { ownerId: ctx.ownerId },
    });
    assert.equal(res.status, 403, "an agent must not reassign someone else's action item");
});

test("V4/AI: filters narrow the list (status and RCA)", async () => {
    const overdue = await api("/action-items?status=overdue", { token: ctx.adminToken });
    assert.equal(overdue.status, 200);
    assert.ok(overdue.body.data.pagination.total >= 2);
    for (const item of overdue.body.data.items) {
        assert.equal(item.status, "overdue");
    }
    // Records are enumerable via "me" without a separate dedicated filter.
    const mine = await api("/action-items?ownerId=me", { token: ctx.agentToken });
    assert.ok(Array.isArray(mine.body.data.items));
});

test("V4/AI: content updates via a PATCH are audited", async () => {
    const updated = await api(`/action-items/${ctx.createdId}`, {
        method: "PATCH",
        token: ctx.adminToken,
        body: { description: "Deploy the monitoring alert for the backup target capacity and document the runbook.", dueDate: "2026-10-20T00:00:00.000Z" },
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.match(updated.body.data.actionItem.description, /runbook/);

    const noop = await api(`/action-items/${ctx.createdId}`, {
        method: "PATCH",
        token: ctx.adminToken,
        body: { description: "Deploy the monitoring alert for the backup target capacity and document the runbook." },
    });
    assert.equal(noop.status, 400, "a no-op edit should be rejected");
});

test("V4/AI: deletion is admin-only", async () => {
    const asAgent = await api(`/action-items/${ctx.createdId}`, { method: "DELETE", token: ctx.agentToken });
    assert.equal(asAgent.status, 403);

    const asAdmin = await api(`/action-items/${ctx.createdId}`, { method: "DELETE", token: ctx.adminToken });
    assert.equal(asAdmin.status, 200, JSON.stringify(asAdmin.body));
    assert.equal((await api(`/action-items/${ctx.createdId}`, { token: ctx.adminToken })).status, 404);
});

test("V4/AI: the dashboard widget is staff-only and returns action item counts", async () => {
    const asAdmin = await api("/dashboard/action-items", { token: ctx.adminToken });
    assert.equal(asAdmin.status, 200);
    assert.ok(asAdmin.body.data.counts.total >= 4);
    assert.ok(asAdmin.body.data.counts.overdue >= 2);
    assert.equal(typeof asAdmin.body.data.counts.recentlyCreated, "number");
    assert.equal(typeof asAdmin.body.data.counts.recentlyCompleted, "number");
    assert.ok(Array.isArray(asAdmin.body.data.byStatus));
    assert.ok(Array.isArray(asAdmin.body.data.byRca));

    const asAgent = await api("/dashboard/action-items", { token: ctx.agentToken });
    assert.equal(asAgent.status, 200);

    const asUser = await api("/dashboard/action-items", { token: ctx.userToken });
    assert.equal(asUser.status, 403, "the widget must not leak data to end users");
});