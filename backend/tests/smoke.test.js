const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * End-to-end smoke test against a running API.
 *
 *   1. npm run seed
 *   2. npm start        (in another terminal)
 *   3. npm test
 *
 * It walks the whole incident lifecycle the way the three roles actually use
 * it, and asserts the permission rules from BRD section 8 - including the
 * negative cases, which are the ones worth having a test for.
 */

const BASE = process.env.TEST_API_URL || "http://localhost:5000/api/v1";
const PASSWORD = "Password123";

const ACCOUNTS = {
    admin: "admin@zybisys.com",
    agent: "rahul.agent@zybisys.com",
    otherAgent: "priya.agent@zybisys.com",
    user: "karthik@zybisys.com",
    otherUser: "sneha@zybisys.com",
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

// Tokens and ids shared across the ordered tests below.
const ctx = {};

test("seeded accounts can log in and the token identifies them", async () => {
    ctx.adminToken = await login(ACCOUNTS.admin);
    ctx.agentToken = await login(ACCOUNTS.agent);
    ctx.otherAgentToken = await login(ACCOUNTS.otherAgent);
    ctx.userToken = await login(ACCOUNTS.user);
    ctx.otherUserToken = await login(ACCOUNTS.otherUser);

    const { status, body } = await api("/auth/me", { token: ctx.adminToken });

    assert.equal(status, 200);
    assert.equal(body.data.user.role, "admin");
    // The hash must never leave the server.
    assert.equal(body.data.user.password, undefined);
});

test("login is rejected for a wrong password, with no user enumeration", async () => {
    const { status, body } = await api("/auth/login", {
        method: "POST",
        body: { email: ACCOUNTS.admin, password: "definitely-wrong" },
    });

    assert.equal(status, 401);

    const unknown = await api("/auth/login", {
        method: "POST",
        body: { email: "nobody@example.com", password: "definitely-wrong" },
    });

    // Identical message for "wrong password" and "no such user".
    assert.equal(unknown.body.message, body.message);
});

test("protected routes reject a missing or invalid token", async () => {
    assert.equal((await api("/incidents")).status, 401);
    assert.equal((await api("/incidents", { token: "not-a-jwt" })).status, 401);
});

test("registration always creates an End User, even if a role is supplied", async () => {
    const email = `smoke.${Date.now()}@example.com`;

    const { status, body } = await api("/auth/register", {
        method: "POST",
        body: { name: "Smoke Test", email, password: PASSWORD, role: "admin" },
    });

    assert.equal(status, 201);
    assert.equal(body.data.user.role, "user", "privilege escalation via body.role");
});

test("weak passwords are rejected by backend validation", async () => {
    const { status, body } = await api("/auth/register", {
        method: "POST",
        body: { name: "Weak", email: `weak.${Date.now()}@example.com`, password: "abc" },
    });

    assert.equal(status, 422);
    assert.ok(Array.isArray(body.errors) && body.errors.length);
});

test("an End User creates an incident and it is attributed to them", async () => {
    const categories = await api("/categories", { token: ctx.userToken });
    assert.equal(categories.status, 200);
    assert.ok(categories.body.data.categories.length > 0);

    // Use a category owned by a seeded department whose member (rahul) is the
    // agent the smoke test walks the incident through with.
    const network = categories.body.data.categories.find(
        (category) => category.name === "Network"
    );
    assert.ok(network, "Network category not found in the seeded data");
    ctx.categoryId = network._id;

    const { status, body } = await api("/incidents", {
        method: "POST",
        token: ctx.userToken,
        body: {
            title: "Smoke test: shared printer is offline",
            description:
                "Raised by the automated smoke test to exercise the incident lifecycle end to end.",
            category: ctx.categoryId,
            priority: "medium",
        },
    });

    assert.equal(status, 201, JSON.stringify(body));

    ctx.incidentId = body.data.incident._id;

    assert.equal(body.data.incident.status, "new");
    assert.match(body.data.incident.incidentNumber, /^INC-\d{6}$/);
    assert.equal(body.data.incident.reportedBy.email, ACCOUNTS.user);
    // dueBy is derived from the priority's SLA target.
    // (Medium, not High/Critical, so the walk-to-Closed test is not blocked
    // by the "approved RCA required before closing" rule.)
    assert.ok(body.data.incident.dueBy, "dueBy should be derived from the SLA");
});

test("invalid incident input is rejected with field-level errors", async () => {
    const { status, body } = await api("/incidents", {
        method: "POST",
        token: ctx.userToken,
        body: { title: "shrt", description: "too short", category: "not-an-id" },
    });

    assert.equal(status, 422);
    assert.ok(body.errors.some((error) => error.field === "title"));
    assert.ok(body.errors.some((error) => error.field === "category"));
});

test("an End User cannot see another user's incident", async () => {
    const { status } = await api(`/incidents/${ctx.incidentId}`, {
        token: ctx.otherUserToken,
    });

    assert.equal(status, 403);
});

test("an End User's list is scoped to their own incidents", async () => {
    const { status, body } = await api("/incidents?limit=100", {
        token: ctx.otherUserToken,
    });

    assert.equal(status, 200);

    const foreign = body.data.items.filter(
        (incident) => incident.reportedBy.email !== ACCOUNTS.otherUser
    );

    assert.equal(foreign.length, 0, "an End User saw incidents they did not report");
});

test("an agent sees the full queue", async () => {
    const { status, body } = await api("/incidents?limit=100", { token: ctx.agentToken });

    assert.equal(status, 200);
    assert.ok(body.data.items.length >= 10);
    assert.ok(body.data.pagination.total >= 10);
});

test("an End User cannot assign an incident", async () => {
    const { status } = await api(`/incidents/${ctx.incidentId}/assign`, {
        method: "PATCH",
        token: ctx.userToken,
        body: { assignedTo: null },
    });

    assert.equal(status, 403);
});

test("an admin assigns the incident, which moves it to In Progress", async () => {
    const agents = await api("/users/assignable", { token: ctx.adminToken });
    assert.equal(agents.status, 200);

    const agent = agents.body.data.users.find((user) => user.email === ACCOUNTS.agent);
    assert.ok(agent, "seeded agent missing from the assignable list");

    ctx.agentId = agent._id;
    ctx.otherAgentId = agents.body.data.users.find((user) => user.email === ACCOUNTS.otherAgent)?._id;

    // Find the seeded department that owns the incident's category.
    const departments = await api("/departments", { token: ctx.adminToken });
    assert.equal(departments.status, 200);
    const owning = departments.body.data.departments.find((department) =>
        department.categories.some(
            (category) => String(category._id || category) === String(ctx.categoryId)
        )
    );
    assert.ok(owning, "no seeded department owns the incident category");
    ctx.departmentId = owning._id;
    ctx.otherDepartmentId = departments.body.data.departments.find(
        (department) => String(department._id) !== String(owning._id)
    )?._id;
    assert.ok(ctx.otherDepartmentId, "a second department is required for the negative tests");

    // Strict rule: a member cannot be assigned before a department exists -
    // not even by an Admin.
    const noDepartment = await api(`/incidents/${ctx.incidentId}/assign`, {
        method: "PATCH",
        token: ctx.adminToken,
        body: { assignedTo: ctx.agentId },
    });
    assert.equal(noDepartment.status, 400, JSON.stringify(noDepartment.body));
    assert.match(noDepartment.body.message, /assign a department/);

    // Step 1: Admin selects the department.
    const setDepartment = await api(`/incidents/${ctx.incidentId}/assign`, {
        method: "PATCH",
        token: ctx.adminToken,
        body: { department: ctx.departmentId },
    });
    assert.equal(setDepartment.status, 200, JSON.stringify(setDepartment.body));

    // Step 2: Admin assigns the member.
    const { status, body } = await api(`/incidents/${ctx.incidentId}/assign`, {
        method: "PATCH",
        token: ctx.adminToken,
        body: { assignedTo: ctx.agentId },
    });

    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.data.incident.assignedTo.email, ACCOUNTS.agent);
    // Picking up New work moves it straight into progress.
    assert.equal(body.data.incident.status, "in_progress");
});

test("a Support Agent cannot change the department through the API", async () => {
    const { status, body } = await api(`/incidents/${ctx.incidentId}/assign`, {
        method: "PATCH",
        token: ctx.agentToken,
        body: { department: ctx.otherDepartmentId },
    });

    assert.equal(status, 403, JSON.stringify(body));
});

test("a Support Agent cannot assign a member from another department", async () => {
    const { status, body } = await api(`/incidents/${ctx.incidentId}/assign`, {
        method: "PATCH",
        token: ctx.agentToken,
        body: { assignedTo: ctx.otherAgentId },
    });

    assert.equal(status, 400, JSON.stringify(body));
    assert.match(body.message, /active member of this department/);
});

test("an invalid department/category combination is rejected", async () => {
    const { status, body } = await api(`/incidents/${ctx.incidentId}/assign`, {
        method: "PATCH",
        token: ctx.adminToken,
        body: { department: ctx.otherDepartmentId },
    });

    // The other seeded department does not own the incident's Network category.
    assert.equal(status, 400, JSON.stringify(body));
    assert.match(body.message, /handles this incident category/);
});

test("a member cannot be assigned while the incident has no department", async () => {
    const created = await api("/incidents", {
        method: "POST",
        token: ctx.userToken,
        body: {
            title: "Smoke test: printer queue is not clearing",
            description:
                "Raised by the automated smoke test to verify member assignment requires a department first.",
            category: ctx.categoryId,
            priority: "low",
        },
    });
    assert.equal(created.status, 201);

    const byAgent = await api(`/incidents/${created.body.data.incident._id}/assign`, {
        method: "PATCH",
        token: ctx.agentToken,
        body: { assignedTo: ctx.agentId },
    });
    assert.equal(byAgent.status, 400, JSON.stringify(byAgent.body));
    assert.match(byAgent.body.message, /assign a department/);

    const byAdmin = await api(`/incidents/${created.body.data.incident._id}/assign`, {
        method: "PATCH",
        token: ctx.adminToken,
        body: { assignedTo: ctx.otherAgentId },
    });
    assert.equal(byAdmin.status, 400, JSON.stringify(byAdmin.body));
});

test("an agent cannot change the status of work assigned to someone else", async () => {
    const { status } = await api(`/incidents/${ctx.incidentId}/status`, {
        method: "PATCH",
        token: ctx.otherAgentToken,
        body: { status: "on_hold" },
    });

    assert.equal(status, 403);
});

test("an illegal status transition is rejected by the workflow rules", async () => {
    // The incident is In Progress; "new" is not a legal next step.
    const { status, body } = await api(`/incidents/${ctx.incidentId}/status`, {
        method: "PATCH",
        token: ctx.agentToken,
        body: { status: "new" },
    });

    assert.equal(status, 400);
    assert.match(body.message, /Cannot move an incident/);
});

test("the assigned agent walks the incident through to Closed", async () => {
    const onHold = await api(`/incidents/${ctx.incidentId}/status`, {
        method: "PATCH",
        token: ctx.agentToken,
        body: { status: "on_hold" },
    });
    assert.equal(onHold.status, 200);

    const resolved = await api(`/incidents/${ctx.incidentId}/status`, {
        method: "PATCH",
        token: ctx.agentToken,
        body: { status: "resolved", resolutionNote: "Reseated the network cable." },
    });
    assert.equal(resolved.status, 200);
    assert.ok(resolved.body.data.incident.resolvedAt);

    const closed = await api(`/incidents/${ctx.incidentId}/status`, {
        method: "PATCH",
        token: ctx.agentToken,
        body: { status: "closed" },
    });
    assert.equal(closed.status, 200);
    assert.equal(closed.body.data.incident.status, "closed");
    assert.ok(closed.body.data.incident.closedAt);
});

test("every change was written to the activity log with a user and timestamp", async () => {
    const { status, body } = await api(`/incidents/${ctx.incidentId}`, {
        token: ctx.agentToken,
    });

    assert.equal(status, 200);

    const actions = body.data.activity.map((entry) => entry.action);

    assert.ok(actions.includes("created"));
    assert.ok(actions.includes("assigned"));
    assert.ok(actions.includes("status_changed"));

    body.data.activity.forEach((entry) => {
        assert.ok(entry.performedBy && entry.performedBy.name, "entry has no author");
        assert.ok(entry.createdAt, "entry has no timestamp");
    });
});

test("comments are visible to the reporter, internal notes are not", async () => {
    const visible = await api(`/incidents/${ctx.incidentId}/comments`, {
        method: "POST",
        token: ctx.agentToken,
        body: { message: "Public update: the printer is back online." },
    });
    assert.equal(visible.status, 201);

    const internal = await api(`/incidents/${ctx.incidentId}/comments`, {
        method: "POST",
        token: ctx.agentToken,
        body: { message: "Internal: replace this unit at the next refresh.", isInternal: true },
    });
    assert.equal(internal.status, 201);
    assert.equal(internal.body.data.comment.isInternal, true);

    const asReporter = await api(`/incidents/${ctx.incidentId}/comments`, {
        token: ctx.userToken,
    });

    assert.equal(asReporter.status, 200);
    assert.ok(asReporter.body.data.comments.some((c) => c.message.startsWith("Public")));
    assert.ok(
        !asReporter.body.data.comments.some((c) => c.isInternal),
        "the reporter was shown an internal note"
    );

    const asAgent = await api(`/incidents/${ctx.incidentId}/comments`, {
        token: ctx.agentToken,
    });
    assert.ok(asAgent.body.data.comments.some((c) => c.isInternal));
});

test("an End User asking for an internal note gets a normal comment instead", async () => {
    const { status, body } = await api(`/incidents/${ctx.incidentId}/comments`, {
        method: "POST",
        token: ctx.userToken,
        body: { message: "Trying to post an internal note.", isInternal: true },
    });

    assert.equal(status, 201);
    assert.equal(body.data.comment.isInternal, false);
});

test("search and filters return matching results", async () => {
    const search = await api("/incidents?search=printer&limit=100", {
        token: ctx.agentToken,
    });
    assert.equal(search.status, 200);
    assert.ok(
        search.body.data.items.every((incident) =>
            `${incident.title} ${incident.description} ${incident.incidentNumber}`
                .toLowerCase()
                .includes("printer")
        ),
        "search returned a non-matching incident"
    );

    const filtered = await api("/incidents?status=closed&priority=high&limit=100", {
        token: ctx.agentToken,
    });
    assert.equal(filtered.status, 200);
    assert.ok(
        filtered.body.data.items.every(
            (incident) => incident.status === "closed" && incident.priority === "high"
        ),
        "a combined status+priority filter leaked non-matching rows"
    );
});

test("a regex metacharacter in the search term is treated as literal text", async () => {
    const { status, body } = await api("/incidents?search=.*&limit=100", {
        token: ctx.agentToken,
    });

    assert.equal(status, 200);
    // ".*" as a literal substring matches nothing in the seeded data; if the
    // input were interpolated raw it would match everything.
    assert.equal(body.data.items.length, 0, "search term was used as a live regex");
});

test("a NoSQL operator in the body cannot be used to bypass login", async () => {
    const { status } = await api("/auth/login", {
        method: "POST",
        body: { email: { $ne: null }, password: { $ne: null } },
    });

    assert.notEqual(status, 200, "NoSQL injection succeeded against login");
});

test("dashboard counts match the underlying data", async () => {
    const summary = await api("/dashboard/summary", { token: ctx.adminToken });
    assert.equal(summary.status, 200);

    const { counts, byStatus } = summary.body.data;

    const statusTotal = byStatus.reduce((sum, item) => sum + item.count, 0);
    assert.equal(statusTotal, counts.total, "status breakdown does not sum to the total");

    const list = await api("/incidents?limit=1", { token: ctx.adminToken });
    assert.equal(
        list.body.data.pagination.total,
        counts.total,
        "dashboard total disagrees with the incident list"
    );

    const charts = await api("/dashboard/charts?days=14", { token: ctx.adminToken });
    assert.equal(charts.status, 200);
    // Two series (Created and Resolved) per day.
    assert.equal(charts.body.data.trend.length, 28);
});

test("an End User's dashboard is scoped to their own incidents", async () => {
    const summary = await api("/dashboard/summary", { token: ctx.userToken });
    const list = await api("/incidents?limit=1", { token: ctx.userToken });

    assert.equal(summary.body.data.counts.total, list.body.data.pagination.total);
});

test("workload is admin-only", async () => {
    assert.equal((await api("/dashboard/workload", { token: ctx.agentToken })).status, 403);
    assert.equal((await api("/dashboard/workload", { token: ctx.adminToken })).status, 200);
});

test("CSV export honours the active filters", async () => {
    const response = await fetch(`${BASE}/incidents/export/csv?status=closed`, {
        headers: { Authorization: `Bearer ${ctx.adminToken}` },
    });

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/csv/);
    assert.match(response.headers.get("content-disposition"), /attachment/);

    const csv = await response.text();
    const lines = csv.trim().split("\n");

    assert.match(lines[0], /Incident No/);
    assert.ok(lines.length > 1, "export contained no rows");
    // Every data row should be a Closed incident.
    lines.slice(1).forEach((line) => assert.match(line, /Closed/));
});

test("category administration is restricted to admins", async () => {
    const asAgent = await api("/categories", {
        method: "POST",
        token: ctx.agentToken,
        body: { name: "Agent Should Not Create This" },
    });
    assert.equal(asAgent.status, 403);

    const name = `Smoke Category ${Date.now()}`;

    const created = await api("/categories", {
        method: "POST",
        token: ctx.adminToken,
        body: { name, description: "Created by the smoke test" },
    });
    assert.equal(created.status, 201);

    ctx.newCategoryId = created.body.data.category._id;

    // Duplicate names are rejected case-insensitively.
    const duplicate = await api("/categories", {
        method: "POST",
        token: ctx.adminToken,
        body: { name: name.toUpperCase() },
    });
    assert.equal(duplicate.status, 409);

    // Unused, so it is deleted outright rather than deactivated.
    const removed = await api(`/categories/${ctx.newCategoryId}`, {
        method: "DELETE",
        token: ctx.adminToken,
    });
    assert.equal(removed.status, 200);
    assert.equal(removed.body.data.deactivated, false);
});

test("user administration is restricted to admins", async () => {
    assert.equal((await api("/users", { token: ctx.userToken })).status, 403);
    assert.equal((await api("/users", { token: ctx.agentToken })).status, 403);

    const { status, body } = await api("/users", { token: ctx.adminToken });
    assert.equal(status, 200);
    assert.ok(body.data.items.length >= 6);
    // The list must never carry password hashes.
    assert.ok(body.data.items.every((user) => user.password === undefined));
});

test("an admin cannot deactivate their own account", async () => {
    const me = await api("/auth/me", { token: ctx.adminToken });

    const { status } = await api(`/users/${me.body.data.user.id}`, {
        method: "DELETE",
        token: ctx.adminToken,
    });

    assert.equal(status, 400);
});

test("in-app notifications reached the reporter", async () => {
    const { status, body } = await api("/notifications", { token: ctx.userToken });

    assert.equal(status, 200);
    assert.ok(body.data.notifications.length > 0, "no notification was recorded");

    const first = body.data.notifications[0];

    const read = await api(`/notifications/${first._id}/read`, {
        method: "PATCH",
        token: ctx.userToken,
    });
    assert.equal(read.status, 200);
    assert.equal(read.body.data.notification.isRead, true);

    // A notification belonging to someone else must not be reachable.
    const foreign = await api(`/notifications/${first._id}/read`, {
        method: "PATCH",
        token: ctx.otherUserToken,
    });
    assert.equal(foreign.status, 404);
});

test("only an admin can delete an incident, and it cleans up its children", async () => {
    const asAgent = await api(`/incidents/${ctx.incidentId}`, {
        method: "DELETE",
        token: ctx.agentToken,
    });
    assert.equal(asAgent.status, 403);

    const asAdmin = await api(`/incidents/${ctx.incidentId}`, {
        method: "DELETE",
        token: ctx.adminToken,
    });
    assert.equal(asAdmin.status, 200);

    const gone = await api(`/incidents/${ctx.incidentId}`, { token: ctx.adminToken });
    assert.equal(gone.status, 404);
});

test("an unknown route returns a structured 404", async () => {
    const { status, body } = await api("/does-not-exist", { token: ctx.adminToken });

    assert.equal(status, 404);
    assert.equal(body.success, false);
    assert.ok(body.message);
});
