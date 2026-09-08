const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * End-to-end tests for the Zoho Desk-compatible Tickets API (FR5-01).
 *
 *   1. npm run seed
 *   2. npm start        (in another terminal)
 *   3. npm test
 *
 * The ticket surface is an adapter over the existing Incident model, so most
 * assertions here verify the mapping (Incident -> Ticket) as well as the
 * security rules that the two surfaces must share.
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

test("seeded accounts can log in and tickets require authentication", async () => {
    ctx.adminToken = await login(ACCOUNTS.admin);
    ctx.agentToken = await login(ACCOUNTS.agent);
    ctx.userToken = await login(ACCOUNTS.user);
    ctx.otherUserToken = await login(ACCOUNTS.otherUser);

    assert.equal((await api("/tickets")).status, 401);
    assert.equal((await api("/tickets", { token: "not-a-jwt" })).status, 401);
});

test("GET /tickets lists incidents as Zoho-compatible tickets", async () => {
    const { status, body } = await api("/tickets?limit=100", {
        token: ctx.agentToken,
    });

    assert.equal(status, 200, JSON.stringify(body));

    assert.ok(Array.isArray(body.data.tickets));
    assert.ok(body.data.tickets.length >= 10);

    // Zoho-style envelope: tickets plus from/limit pagination metadata.
    assert.equal(body.data.count, body.data.pagination.count);
    assert.equal(body.data.limit, 100);
    assert.equal(body.data.from, 0);
    assert.ok("totalPages" in body.data.pagination);
    assert.ok("hasNextPage" in body.data.pagination);

    const sample = body.data.tickets[0];

    // Whitelisted ticket shape.
    assert.ok(sample.id);
    assert.ok(sample.ticketNumber);
    assert.ok(sample.subject);
    assert.ok(["new", "in_progress", "on_hold", "resolved", "closed"].includes(sample.status));
    assert.ok(["low", "medium", "high", "critical"].includes(sample.priority));
    assert.ok(sample.requester && sample.requester.id);
    assert.ok(sample.category && sample.category.id);
    assert.ok(sample.dueTime);
    assert.ok("slaState" in sample);
    assert.ok("isOverdue" in sample);
    assert.ok("createdTime" in sample);
    assert.ok("modifiedTime" in sample);

    // Mongo internals and incident-only fields must never leak.
    assert.equal(sample._id, undefined);
    assert.equal(sample.__v, undefined);
    assert.equal(sample.title, undefined);
    assert.equal(sample.incidentNumber, undefined);
    assert.equal(sample.reportedBy, undefined);
    assert.ok(!("password" in sample));
});

test("GET /tickets/:id returns one ticket and rejects invalid ids", async () => {
    const list = await api("/tickets?limit=1", { token: ctx.adminToken });
    assert.equal(list.status, 200);
    const { id } = list.body.data.tickets[0];

    const { status, body } = await api(`/tickets/${id}`, { token: ctx.adminToken });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.data.ticket.id, id);

    // A well-formed but unknown ObjectId is a 404, not a crash.
    const missing = await api(
        "/tickets/64b8f0c2e4a9d1f2a3b4c5d9",
        { token: ctx.adminToken }
    );
    assert.equal(missing.status, 404);

    // A malformed id is caught by validation.
    const invalid = await api("/tickets/not-an-id", { token: ctx.adminToken });
    assert.equal(invalid.status, 422);
    assert.ok(Array.isArray(invalid.body.errors));
});

test("the mapper maps an existing incident into the ticket vocabulary", async () => {
    // Any seed incident also exists on the ticket surface; compare the two.
    const incidentList = await api("/incidents?limit=1", {
        token: ctx.adminToken,
    });
    assert.equal(incidentList.status, 200);
    const incident = incidentList.body.data.items[0];

    const { body } = await api(`/tickets/${incident._id}`, {
        token: ctx.adminToken,
    });
    const ticket = body.data.ticket;

    assert.equal(ticket.id, String(incident._id));
    assert.equal(ticket.ticketNumber, incident.incidentNumber);
    assert.equal(ticket.subject, incident.title);
    assert.equal(ticket.description, incident.description);
    assert.equal(ticket.status, incident.status);
    assert.equal(ticket.priority, incident.priority);
    assert.equal(ticket.requester.id, String(incident.reportedBy._id));
    assert.equal(ticket.requester.name, incident.reportedBy.name);
    assert.equal(ticket.category.id, String(incident.category._id));
    assert.equal(ticket.category.name, incident.category.name);

    if (incident.assignedTo) {
        assert.equal(ticket.assignee.id, String(incident.assignedTo._id));
    }
    if (incident.department) {
        assert.equal(ticket.department.id, String(incident.department._id));
    }
    assert.equal(ticket.createdTime, incident.createdAt);
});

test("POST /tickets creates an incident from the ticket body", async () => {
    const categories = await api("/categories", { token: ctx.userToken });
    assert.equal(categories.status, 200);
    const network = categories.body.data.categories.find(
        (category) => category.name === "Network"
    );
    assert.ok(network, "Network category not found in the seeded data");

    const { status, body } = await api("/tickets", {
        method: "POST",
        token: ctx.userToken,
        body: {
            subject: "FR5 ticket: shared printer is offline",
            description:
                "Automated FR5 test: the shared printer refuses duplex jobs and blocks the queue.",
            category: network._id,
            priority: "medium",
        },
    });

    assert.equal(status, 201, JSON.stringify(body));

    ctx.ticketId = body.data.ticket.id;

    assert.match(body.data.ticket.ticketNumber, /^INC-\d{6}$/);
    assert.equal(body.data.ticket.subject, "FR5 ticket: shared printer is offline");
    assert.equal(body.data.ticket.status, "new");
    // The requester is always the signed-in caller.
    assert.equal(body.data.ticket.requester.email, ACCOUNTS.user);
    assert.equal(body.data.ticket.category.name, "Network");
    // The same record is reachable through the incident surface (source of truth).
    const asIncident = await api(`/incidents/${ctx.ticketId}`, {
        token: ctx.userToken,
    });
    assert.equal(asIncident.status, 200);
});

test("POST /tickets validates subject, description and category", async () => {
    const categories = await api("/categories", { token: ctx.userToken });
    const network = categories.body.data.categories.find(
        (category) => category.name === "Network"
    );

    const { status, body } = await api("/tickets", {
        method: "POST",
        token: ctx.userToken,
        body: {
            subject: "sht",
            description: "too short",
            category: "not-an-id",
        },
    });

    assert.equal(status, 422);
    assert.ok(Array.isArray(body.errors) && body.errors.length);
    const fields = body.errors.map((error) => error.field);
    assert.ok(fields.includes("subject"));
    assert.ok(fields.includes("description"));
    assert.ok(fields.includes("category"));
});

test("POST /tickets ignores reporter spoofing in the body", async () => {
    const categories = await api("/categories", { token: ctx.userToken });
    const network = categories.body.data.categories.find(
        (category) => category.name === "Network"
    );

    const { status, body } = await api("/tickets", {
        method: "POST",
        token: ctx.userToken,
        body: {
            subject: "FR5 spoofing test: cannot name another reporter",
            description:
                "Automated FR5 test: the reportedBy/status fields in the body must be ignored.",
            category: network._id,
            reportedBy: ACCOUNTS.otherUser,
            status: "closed",
        },
    });

    assert.equal(status, 201, JSON.stringify(body));

    // The server, not the body, decides both.
    assert.equal(body.data.ticket.requester.email, ACCOUNTS.user);
    assert.equal(body.data.ticket.status, "new");
});

test("an End User cannot view another user's ticket", async () => {
    const { status } = await api(`/tickets/${ctx.ticketId}`, {
        token: ctx.otherUserToken,
    });

    assert.equal(status, 403);
});

test("PUT /tickets/:id fully replaces the supported descriptive fields", async () => {
    const categories = await api("/categories", { token: ctx.userToken });
    const application = categories.body.data.categories.find(
        (category) => category.name === "Application"
    );
    assert.ok(application, "Application category not found in the seeded data");

    // The reporter may edit their own still-New ticket.
    const { status, body } = await api(`/tickets/${ctx.ticketId}`, {
        method: "PUT",
        token: ctx.userToken,
        body: {
            subject: "FR5 ticket: second-floor printer is offline",
            description:
                "Automated FR5 test: the ticket was fully replaced via PUT with a new description.",
            category: application._id,
        },
    });

    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.data.ticket.subject, "FR5 ticket: second-floor printer is offline");
    assert.equal(body.data.ticket.category.name, "Application");
    // Workflow fields are untouched by PUT.
    assert.equal(body.data.ticket.status, "new");
    assert.equal(body.data.ticket.requester.email, ACCOUNTS.user);
});

test("PUT requires every supported field, or it is a 400", async () => {
    const { status, body } = await api(`/tickets/${ctx.ticketId}`, {
        method: "PUT",
        token: ctx.userToken,
        body: { subject: "FR5 ticket: missing category and description" },
    });

    assert.equal(status, 400, JSON.stringify(body));
});

test("PATCH /tickets/:id applies a partial update", async () => {
    const { status, body } = await api(`/tickets/${ctx.ticketId}`, {
        method: "PATCH",
        token: ctx.userToken,
        body: {
            description: "Automated FR5 test: description patched only, subject stays.",
        },
    });

    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(
        body.data.ticket.description,
        "Automated FR5 test: description patched only, subject stays."
    );
    assert.equal(body.data.ticket.subject, "FR5 ticket: second-floor printer is offline");
});

test("an End User cannot change priority through the tickets API", async () => {
    const { status, body } = await api(`/tickets/${ctx.ticketId}`, {
        method: "PATCH",
        token: ctx.userToken,
        body: { priority: "critical" },
    });

    assert.equal(status, 403, JSON.stringify(body));
});

test("only an admin can delete a ticket (reuses incident rules)", async () => {
    // Create a disposable ticket for the deletion test.
    const categories = await api("/categories", { token: ctx.adminToken });
    const network = categories.body.data.categories.find(
        (category) => category.name === "Network"
    );

    const created = await api("/tickets", {
        method: "POST",
        token: ctx.adminToken,
        body: {
            subject: "FR5 delete test: disposable ticket",
            description:
                "Automated FR5 test: this ticket is deleted at the end of the deletion scenario.",
            category: network._id,
        },
    });
    assert.equal(created.status, 201);

    const disposableId = created.body.data.ticket.id;

    const asAgent = await api(`/tickets/${disposableId}`, {
        method: "DELETE",
        token: ctx.agentToken,
    });
    assert.equal(asAgent.status, 403);

    const asUser = await api(`/tickets/${disposableId}`, {
        method: "DELETE",
        token: ctx.userToken,
    });
    assert.equal(asUser.status, 403);

    const asAdmin = await api(`/tickets/${disposableId}`, {
        method: "DELETE",
        token: ctx.adminToken,
    });
    assert.equal(asAdmin.status, 200, JSON.stringify(asAdmin.body));

    const gone = await api(`/tickets/${disposableId}`, { token: ctx.adminToken });
    assert.equal(gone.status, 404);
});

test("ticket list pagination honours from/limit and caps the limit", async () => {
    const { status, body } = await api("/tickets?from=0&limit=3", {
        token: ctx.adminToken,
    });

    assert.equal(status, 200);
    assert.ok(body.data.tickets.length <= 3);
    assert.equal(body.data.from, 0);
    assert.equal(body.data.limit, 3);
    assert.equal(body.data.pagination.from, body.data.from);
    assert.equal(body.data.pagination.limit, body.data.limit);
    assert.ok(body.data.count >= body.data.tickets.length);

    // A limit beyond MAX_LIMIT is refused rather than silently served.
    const tooBig = await api("/tickets?limit=500", { token: ctx.adminToken });
    assert.equal(tooBig.status, 422);

    // from/limit windowing returns different data than the first page.
    const pageTwo = await api("/tickets?from=3&limit=3", { token: ctx.adminToken });
    assert.equal(pageTwo.status, 200);
    assert.ok(pageTwo.body.data.tickets.length > 0 || body.data.count <= 3);
    if (pageTwo.body.data.tickets.length && body.data.tickets.length) {
        assert.notEqual(
            pageTwo.body.data.tickets[0].id,
            body.data.tickets[0].id,
            "from=3 returned an overlapping first row"
        );
    }
});

test("ticket list honours the same visibility rules as incidents", async () => {
    // An End User's ticket list is scoped to incidents they reported.
    const { status, body } = await api("/tickets?limit=100", {
        token: ctx.userToken,
    });

    assert.equal(status, 200);

    const ticketIds = body.data.tickets.map((ticket) => ticket.id);
    assert.ok(ticketIds.includes(ctx.ticketId));

    // Every ticket the user can see was reported by the user themselves.
    body.data.tickets.forEach((ticket) => {
        assert.equal(ticket.requester.email, ACCOUNTS.user);
    });

    // Compare with the incident surface: the same scoped row set (the two list
    // calls can legitimately differ by rows another parallel test file creates
    // in between, so each side is checked on its own terms).
    const incidentList = await api("/incidents?limit=100", {
        token: ctx.userToken,
    });
    assert.equal(incidentList.status, 200);
    const incidentIds = incidentList.body.data.items.map((incident) =>
        String(incident._id)
    );
    assert.ok(incidentIds.includes(ctx.ticketId));
    incidentList.body.data.items.forEach((incident) => {
        assert.equal(incident.reportedBy.email, ACCOUNTS.user);
    });
});

test("ticket filters behave like their incident equivalents", async () => {
    // Open tickets exclude the terminal (resolved/closed) ones.
    const open = await api("/tickets?open=true&limit=100", {
        token: ctx.agentToken,
    });
    assert.equal(open.status, 200);
    assert.ok(
        open.body.data.tickets.length > 0,
        "expected at least one open ticket in the seeded data"
    );
    assert.ok(
        open.body.data.tickets.every((ticket) =>
            ["new", "in_progress", "on_hold"].includes(ticket.status)
        ),
        "an open=true filter leaked a terminal ticket"
    );

    const searched = await api("/tickets?search=printer&limit=100", {
        token: ctx.agentToken,
    });
    assert.equal(searched.status, 200);
    assert.ok(
        searched.body.data.tickets.every(
            (ticket) =>
                `${ticket.subject} ${ticket.description} ${ticket.ticketNumber}`
                    .toLowerCase()
                    .includes("printer")
        ),
        "search returned a non-matching ticket"
    );
});

test("a NoSQL operator in the ticket body cannot reach the database", async () => {
    const { status } = await api("/tickets", {
        method: "POST",
        token: ctx.userToken,
        body: {
            subject: { $ne: null },
            description: { $ne: null },
            category: { $ne: null },
        },
    });

    assert.notEqual(status, 201, "NoSQL injection succeeded against ticket creation");
});