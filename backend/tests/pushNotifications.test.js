const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "error";
// Keep the suite off the real SMTP server - emails are irrelevant here.
process.env.MAIL_ENABLED = "false";

const crypto = require("node:crypto");
const mongoose = require("mongoose");

const { env } = require("../src/config/env");
const User = require("../src/models/User");
const PushToken = require("../src/models/PushToken");
const Notification = require("../src/models/Notification");
const generateToken = require("../src/utils/generateToken");
const firebaseAdminService = require("../src/services/firebaseAdminService");
const pushNotificationService = require("../src/services/pushNotificationService");
const notificationService = require("../src/services/notificationService");
const app = require("../src/app");

/**
 * Web push (FCM) tests.
 *
 * Firebase Admin is ALWAYS mocked - this suite never talks to real Firebase.
 * The token registration API is exercised in-process (Express app on an
 * ephemeral port + local Mongo), following the googleAuth.test.js pattern.
 */

const { buildPayload, sendToUsers, PUSH_EVENTS } = pushNotificationService;

const ctx = { base: null };
let serverHandle = null;

const uniqueEmail = (prefix) =>
    `${prefix}-${crypto.randomBytes(6).toString("hex")}@example.com`;

const createActiveUser = async (prefix, role = "support_agent") =>
    User.create({
        name: `${prefix} Tester`,
        email: uniqueEmail(prefix),
        password: "Password123!",
        role,
        isActive: true,
    });

test.before(async () => {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
    await PushToken.createIndexes();

    await new Promise((resolve) => {
        serverHandle = app.listen(0, () => {
            const { port } = serverHandle.address();
            ctx.base = `http://127.0.0.1:${port}`;
            resolve();
        });
    });
});

test.after(async () => {
    if (serverHandle) {
        await new Promise((resolve) => serverHandle.close(resolve));
    }
    await PushToken.deleteMany({ token: { $regex: /^test-/ } });
    await User.deleteMany({ email: { $regex: /^push-/ } });
    await Notification.deleteMany({ title: { $regex: /PUSH-TEST/ } });
    await mongoose.disconnect();
});

/** Authenticated fetch against the in-process server. */
const api = async (pathName, { method = "GET", token, body } = {}) => {
    const res = await fetch(`${ctx.base}${pathName}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try {
        json = await res.json();
    } catch {
        // no body
    }
    return { status: res.status, body: json };
};

/* ==========================================================================
 * 1. Payload shape
 * ======================================================================== */

test("buildPayload produces a consistent FCM payload with string data values", async () => {
    const incident = {
        _id: new mongoose.Types.ObjectId(),
        incidentNumber: "PUSH-TEST-0001",
        title: "Payload test",
    };

    const payload = buildPayload({
        title: "Incident Assigned",
        body: "Payload test",
        type: PUSH_EVENTS.INCIDENT_ASSIGNED,
        incident,
        notificationId: new mongoose.Types.ObjectId(),
    });

    assert.equal(payload.notification.title, "Incident Assigned");
    assert.equal(payload.notification.body, "Payload test");

    const { data } = payload;
    assert.equal(data.type, "INCIDENT_ASSIGNED");
    assert.equal(data.incidentId, String(incident._id));
    assert.equal(data.incidentNumber, "PUSH-TEST-0001");
    assert.ok(data.notificationId);
    assert.ok(data.url.endsWith(`/incidents/${incident._id}`));

    for (const [key, value] of Object.entries(data)) {
        assert.equal(typeof value, "string", `${key} must be a string`);
    }

    // No secrets, tokens or documents may leak into the payload.
    const flat = JSON.stringify(payload);
    assert.ok(!flat.includes("password"));
    assert.ok(!flat.includes("private_key"));
});

test("buildPayload omits incident fields when there is no incident", async () => {
    const payload = buildPayload({
        title: "Action item assigned to you",
        type: PUSH_EVENTS.ACTION_ITEM_ASSIGNED,
    });

    assert.equal(payload.data.incidentId, undefined);
    assert.equal(payload.data.url, undefined);
    assert.equal(payload.data.type, "ACTION_ITEM_ASSIGNED");
});

/* ==========================================================================
 * 2. Sending - Firebase Admin always mocked
 * ======================================================================== */

test("sendToUsers delivers to every active token of the target users", async (t) => {
    const user = await createActiveUser("push-send");
    const sent = [];

    t.mock.method(firebaseAdminService, "getFirebaseMessaging", () => ({
        sendEachForMulticast: async (message) => {
            sent.push(message);
            return { responses: message.tokens.map(() => ({ success: true })) };
        },
    }));

    await PushToken.create([
        { userId: user._id, token: "test-send-token-1" },
        { userId: user._id, token: "test-send-token-2" },
    ]);

    await sendToUsers(
        [user._id],
        buildPayload({ title: "PUSH-TEST title", type: PUSH_EVENTS.INCIDENT_CREATED })
    );

    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].tokens.sort(), ["test-send-token-1", "test-send-token-2"]);
    assert.equal(sent[0].notification.title, "PUSH-TEST title");

    await PushToken.deleteMany({ token: { $in: ["test-send-token-1", "test-send-token-2"] } });
});

test("an unregistered FCM token is deactivated and never keeps its active flag", async (t) => {
    const user = await createActiveUser("push-dead");

    t.mock.method(firebaseAdminService, "getFirebaseMessaging", () => ({
        sendEachForMulticast: async (message) => ({
            responses: message.tokens.map(() => ({
                success: false,
                error: { code: "messaging/registration-token-not-registered" },
            })),
        }),
    }));

    await PushToken.create({ userId: user._id, token: "test-dead-token" });

    await sendToUsers(
        [user._id],
        buildPayload({ title: "PUSH-TEST dead", type: PUSH_EVENTS.STATUS_CHANGED })
    );

    const stored = await PushToken.findOne({ token: "test-dead-token" }).lean();
    assert.equal(stored.isActive, false);
});

test("a transient FCM failure is logged but never throws", async (t) => {
    const user = await createActiveUser("push-fail");

    t.mock.method(firebaseAdminService, "getFirebaseMessaging", () => ({
        sendEachForMulticast: async () => {
            throw new Error("firebase unavailable");
        },
    }));

    await PushToken.create({ userId: user._id, token: "test-fail-token" });

    await assert.doesNotReject(
        sendToUsers(
            [user._id],
            buildPayload({ title: "PUSH-TEST fail", type: PUSH_EVENTS.INCIDENT_ESCALATED })
        )
    );

    // The token itself is not deactivated for a transient error.
    const stored = await PushToken.findOne({ token: "test-fail-token" }).lean();
    assert.equal(stored.isActive, true);
});

test("sendToUsers is a no-op when Firebase is not configured", async (t) => {
    const user = await createActiveUser("push-off");

    t.mock.method(firebaseAdminService, "getFirebaseMessaging", () => null);

    await PushToken.create({ userId: user._id, token: "test-off-token" });

    await sendToUsers(
        [user._id],
        buildPayload({ title: "PUSH-TEST off", type: PUSH_EVENTS.INCIDENT_CREATED })
    );

    const stored = await PushToken.findOne({ token: "test-off-token" }).lean();
    assert.equal(stored.isActive, true);
});

/* ==========================================================================
 * 3. Token registration API
 * ======================================================================== */

test("push register rejects unauthenticated requests", async () => {
    const { status, body } = await api("/notifications/push/register", {
        method: "POST",
        body: { token: "test-unauth-token", platform: "web" },
    });

    assert.equal(status, 401);
    assert.equal(body.success, false);
    assert.equal(await PushToken.countDocuments({ token: "test-unauth-token" }), 0);
});

test("push register stores the token for the authenticated user and ignores any client userId", async () => {
    const user = await createActiveUser("push-owner", "user");
    const attacker = await createActiveUser("push-victim", "admin");
    const token = generateToken(user);

    const { status, body } = await api("/notifications/push/register", {
        method: "POST",
        token,
        // A spoofed userId must be ignored entirely.
        body: { token: "test-own-token", platform: "web", userId: String(attacker._id) },
    });

    assert.equal(status, 200);
    assert.equal(body.success, true);

    const stored = await PushToken.findOne({ token: "test-own-token" }).lean();
    assert.ok(stored);
    assert.equal(String(stored.userId), String(user._id));
    assert.equal(stored.platform, "web");
    assert.equal(stored.isActive, true);
    assert.ok(stored.lastSeenAt);
});

test("re-registering the same token is idempotent and refreshes lastSeenAt", async () => {
    const user = await createActiveUser("push-dup", "user");
    const token = generateToken(user);

    await api("/notifications/push/register", {
        method: "POST",
        token,
        body: { token: "test-dup-token", platform: "web" },
    });

    const first = await PushToken.findOne({ token: "test-dup-token" }).lean();

    await new Promise((resolve) => setTimeout(resolve, 15));

    const { status } = await api("/notifications/push/register", {
        method: "POST",
        token,
        body: { token: "test-dup-token", platform: "web" },
    });

    assert.equal(status, 200);
    assert.equal(await PushToken.countDocuments({ token: "test-dup-token" }), 1);

    const second = await PushToken.findOne({ token: "test-dup-token" }).lean();
    assert.ok(new Date(second.lastSeenAt) > new Date(first.lastSeenAt));
    assert.equal(second.isActive, true);
});

test("a token owned by another user transfers to the caller (FCM device lifecycle)", async () => {
    const firstUser = await createActiveUser("push-first", "user");
    const secondUser = await createActiveUser("push-second", "user");

    await PushToken.create({ userId: firstUser._id, token: "test-transfer-token" });

    const { status } = await api("/notifications/push/register", {
        method: "POST",
        token: generateToken(secondUser),
        body: { token: "test-transfer-token", platform: "web" },
    });

    assert.equal(status, 200);
    const stored = await PushToken.findOne({ token: "test-transfer-token" }).lean();
    assert.equal(String(stored.userId), String(secondUser._id));
});

test("push register validates the token and platform", async () => {
    const user = await createActiveUser("push-valid", "user");
    const token = generateToken(user);

    const missing = await api("/notifications/push/register", {
        method: "POST",
        token,
        body: { token: "", platform: "web" },
    });
    assert.equal(missing.status, 400);

    const noBody = await api("/notifications/push/register", {
        method: "POST",
        token,
        body: {},
    });
    assert.equal(noBody.status, 400);

    const badPlatform = await api("/notifications/push/register", {
        method: "POST",
        token,
        body: { token: "test-platform-token", platform: "ios" },
    });
    assert.equal(badPlatform.status, 400);
    assert.equal(await PushToken.countDocuments({ token: "test-platform-token" }), 0);
});

test("a user can only delete their own push token", async () => {
    const owner = await createActiveUser("push-del-owner", "user");
    const other = await createActiveUser("push-del-other", "user");

    await PushToken.create({ userId: owner._id, token: "test-del-token" });

    // Another authenticated user cannot remove it.
    const denied = await api("/notifications/push/register", {
        method: "DELETE",
        token: generateToken(other),
        body: { token: "test-del-token" },
    });
    assert.equal(denied.status, 404);
    assert.ok(await PushToken.findOne({ token: "test-del-token" }));

    // The owner can.
    const allowed = await api("/notifications/push/register", {
        method: "DELETE",
        token: generateToken(owner),
        body: { token: "test-del-token" },
    });
    assert.equal(allowed.status, 200);
    assert.equal(await PushToken.countDocuments({ token: "test-del-token" }), 0);
});

test("push register list returns only the caller's tokens and the configured flag", async () => {
    const user = await createActiveUser("push-list", "user");
    const stranger = await createActiveUser("push-list-stranger", "user");

    await PushToken.create([
        { userId: user._id, token: "test-list-token-1" },
        { userId: stranger._id, token: "test-list-token-2" },
    ]);

    const { status, body } = await api("/notifications/push/register", {
        token: generateToken(user),
    });

    assert.equal(status, 200);
    assert.equal(body.data.tokens.length, 1);
    assert.equal(typeof body.data.configured, "boolean");
    // The raw token value is never echoed back.
    assert.ok(!JSON.stringify(body.data.tokens).includes("test-list-token-"));
});

/* ==========================================================================
 * 4. Integration with the existing notification service
 * ======================================================================== */

test("notifyIncidentAssigned fans out a push to the assignee only", async (t) => {
    const assignee = await createActiveUser("push-assignee", "support_agent");
    const bystander = await createActiveUser("push-bystander", "support_agent");
    const assignedBy = await createActiveUser("push-assigner", "support_agent");

    const calls = [];
    t.mock.method(pushNotificationService, "sendToUsers", async (users, payload) => {
        calls.push({ users: users.map((u) => String(u._id ?? u)), payload });
    });

    const incident = {
        _id: new mongoose.Types.ObjectId(),
        incidentNumber: "PUSH-TEST-765432",
        title: "Assigned push test",
    };

    await notificationService.notifyIncidentAssigned({ incident, assignee, assignedBy });

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].users, [String(assignee._id)]);
    assert.equal(calls[0].payload.notification.title, "PUSH-TEST-765432 assigned to you");
    assert.equal(calls[0].payload.data.type, "INCIDENT_ASSIGNED");
    assert.equal(calls[0].payload.data.incidentId, String(incident._id));
    assert.ok(calls[0].payload.data.notificationId);
    assert.ok(!calls[0].users.includes(String(bystander._id)));
});

test("a push failure never breaks the existing in-app notification flow", async (t) => {
    const assignee = await createActiveUser("push-isolate", "support_agent");
    const actor = await createActiveUser("push-isolate-actor", "support_agent");

    t.mock.method(pushNotificationService, "sendToUsers", async () => {
        throw new Error("push exploded");
    });

    const incident = {
        _id: new mongoose.Types.ObjectId(),
        incidentNumber: "PUSH-TEST-111222",
        title: "Isolation test",
    };

    await assert.doesNotReject(
        notificationService.notifyIncidentAssigned({
            incident,
            assignee,
            assignedBy: actor._id,
        })
    );

    // The in-app row still exists - the incident operation was unaffected.
    const row = await Notification.findOne({
        title: "PUSH-TEST-111222 assigned to you",
        recipient: assignee._id,
    });
    assert.ok(row, "in-app notification should still be created");
});

test("pushIncidentEvent honours recipient resolution: actor excluded, inactive users dropped", async (t) => {
    const actor = await createActiveUser("push-actor", "support_agent");
    const stakeholder = await createActiveUser("push-stakeholder", "support_agent");
    const inactive = await createActiveUser("push-inactive", "support_agent");
    inactive.isActive = false;
    await inactive.save();

    const calls = [];
    t.mock.method(pushNotificationService, "sendToUsers", async (users, payload) => {
        calls.push({ users: users.map((u) => String(u._id ?? u)), payload });
    });

    const incident = {
        _id: new mongoose.Types.ObjectId(),
        incidentNumber: "PUSH-TEST-999888",
        title: "Ack test",
    };

    await notificationService.pushIncidentEvent({
        recipients: [actor._id, stakeholder._id, inactive._id],
        incident,
        type: PUSH_EVENTS.INCIDENT_ACKNOWLEDGED,
        title: `PUSH-TEST ${incident.incidentNumber} acknowledged`,
        actorId: actor._id,
    });

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].users, [String(stakeholder._id)]);
});

test("pushIncidentEvent is a silent no-op when Firebase sending throws", async (t) => {
    const user = await createActiveUser("push-silent", "support_agent");

    t.mock.method(pushNotificationService, "sendToUsers", async () => {
        throw new Error("firebase down");
    });

    await assert.doesNotReject(
        notificationService.pushIncidentEvent({
            recipients: [user._id],
            incident: { _id: new mongoose.Types.ObjectId(), incidentNumber: "PUSH-TEST-000" },
            type: PUSH_EVENTS.INCIDENT_OVERDUE,
            title: "PUSH-TEST overdue",
        })
    );
});
