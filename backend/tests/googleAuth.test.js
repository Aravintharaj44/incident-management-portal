const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

// Run the app in test mode (log level, rate limiters, morgan) and give the
// Google flow deterministic placeholders. The network calls to Google are
// mocked below - nothing in this suite touches the real Google servers.
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "error";
process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.GOOGLE_REDIRECT_URI = "http://localhost:5000/auth/google/callback";

const crypto = require("node:crypto");
const mongoose = require("mongoose");

const { env } = require("../src/config/env");
const User = require("../src/models/User");
const generateToken = require("../src/utils/generateToken");
const googleOAuthService = require("../src/services/googleOAuthService");
const app = require("../src/app");

/**
 * End-to-end tests for FR5-13 - SSO login via Google OAuth 2.0.
 *
 * Unlike the other suites (which hit a separately-started server), this one
 * starts the Express app in-process on an ephemeral port. That lets us mock the
 * two Google network calls (token exchange + ID token verification) with
 * node:test's `mock.method`, so the tests exercise the full state validation,
 * account-matching and JWT-issuing logic without depending on Google.
 *
 * The in-memory state store and the state validation are real - only the HTTP
 * calls to accounts.google.com are replaced.
 */

const FRONTEND_CALLBACK = "http://localhost:5173/auth/google/callback";

const TEST_GOOGLE = {
    sub: "google-sub-0001",
    email: "sso.user@example.com",
    emailVerified: true,
    name: "SSO User",
    picture: null,
};

const FAKE_TOKENS = {
    id_token: "fake.id.token",
    access_token: "fake-google-access-token",
    refresh_token: "fake-google-refresh-token",
    token_type: "Bearer",
};

const ctx = { base: null };
let serverHandle = null;

test.before(async () => {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });

    // Build the sparse unique index on googleId up-front so the async autoIndex
    // build cannot race the first inserts (which would otherwise surface as
    // misleading duplicate-key errors on null googleIds).
    await User.createIndexes();

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
    await User.deleteMany({
        email: { $in: [TEST_GOOGLE.email, `link.${TEST_GOOGLE.email}`] },
    });
    await mongoose.disconnect();
});

/** Real GET /auth/google -> state value from the Google redirect URL. */
const startGoogle = async () => {
    const res = await fetch(`${ctx.base}/auth/google`, { redirect: "manual" });
    assert.equal(res.status, 302, JSON.stringify(res));
    const location = new URL(res.headers.get("location"));
    return location;
};

const fetchCallback = async (state, { code = "auth-code-1", error } = {}) => {
    const params = new URLSearchParams();
    if (state) params.set("state", state);
    if (code) params.set("code", code);
    if (error) params.set("error", error);
    return fetch(`${ctx.base}/auth/google/callback?${params}`, { redirect: "manual" });
};

const tokenFromRedirect = (res) => {
    const location = new URL(res.headers.get("location"));
    return location.searchParams.get("token");
};

const uniqueEmail = () => `sso-${crypto.randomBytes(6).toString("hex")}@example.com`;

// Mock Google's token exchange + ID token verification for the current test.
const mockGoogleFlow = (t, payload = TEST_GOOGLE) => {
    t.mock.method(googleOAuthService, "exchangeCodeForTokens", async () => FAKE_TOKENS);
    t.mock.method(googleOAuthService, "verifyIdToken", async () => payload);
};

// ---------------------------------------------------------------------------
// 1. GET /auth/google - redirect construction
// ---------------------------------------------------------------------------

test("FR5-13: GET /auth/google redirects to Google with the configured client", async () => {
    const location = await startGoogle();

    assert.equal(location.origin + location.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(location.searchParams.get("client_id"), env.google.clientId);
    assert.equal(location.searchParams.get("redirect_uri"), "http://localhost:5000/auth/google/callback");
    assert.equal(location.searchParams.get("response_type"), "code");

    const scope = location.searchParams.get("scope");
    for (const required of ["openid", "email", "profile"]) {
        assert.ok(scope.includes(required), `scope should include ${required}`);
    }
    // No unrelated scopes such as mail/drive/calendar are ever requested.
    for (const forbidden of ["gmail", "drive", "calendar"]) {
        assert.ok(!scope.toLowerCase().includes(forbidden), `scope must not include ${forbidden}`);
    }

    ctx.stateFromRedirect = location.searchParams.get("state");
});

test("FR5-13: the state value is generated, strong and single-use", async () => {
    assert.match(ctx.stateFromRedirect, /^[a-f0-9]{64}$/);

    const fresh = googleOAuthService.createState();
    assert.match(fresh, /^[a-f0-9]{64}$/);
    assert.notEqual(fresh, ctx.stateFromRedirect);

    // Consumed exactly once.
    assert.equal(googleOAuthService.consumeState(fresh), true);
    assert.equal(googleOAuthService.consumeState(fresh), false);

    // Unknown, malformed and expired states are rejected.
    assert.equal(googleOAuthService.consumeState("unknown-state"), false);
    assert.equal(googleOAuthService.consumeState(""), false);
    assert.equal(googleOAuthService.consumeState(null), false);
    assert.equal(googleOAuthService.consumeState(12345), false);
});

test("FR5-13: GET /auth/google redirects to the SPA when Google is not configured", async () => {
    const previousId = env.google.clientId;
    env.google.clientId = "";

    try {
        const res = await fetch(`${ctx.base}/auth/google`, { redirect: "manual" });
        assert.equal(res.status, 302);
        const location = new URL(res.headers.get("location"));
        assert.equal(location.origin + location.pathname, FRONTEND_CALLBACK);
        assert.equal(location.searchParams.get("error"), "not_configured");
    } finally {
        env.google.clientId = previousId;
    }
});

// ---------------------------------------------------------------------------
// 2. Callback validation
// ---------------------------------------------------------------------------

test("FR5-13: callback rejects a missing state", async () => {
    const res = await fetchCallback(null);

    assert.equal(res.status, 302);
    const location = new URL(res.headers.get("location"));
    assert.ok(location.href.startsWith(FRONTEND_CALLBACK));
    assert.equal(location.searchParams.get("error"), "invalid_state");
});

test("FR5-13: callback rejects an unknown/mismatched state", async () => {
    const res = await fetchCallback("forged-or-stale-state");

    assert.equal(res.status, 302);
    const location = new URL(res.headers.get("location"));
    assert.equal(location.searchParams.get("error"), "invalid_state");
});

test("FR5-13: callback handles Google consent denial", async () => {
    // Google sends error=access_denied; the state is irrelevant here.
    const res = await fetchCallback(null, { code: "code", error: "access_denied" });

    assert.equal(res.status, 302);
    const location = new URL(res.headers.get("location"));
    assert.equal(location.searchParams.get("error"), "access_denied");
    assert.equal(location.searchParams.get("token"), null);
});

// ---------------------------------------------------------------------------
// 3. Account matching / provisioning / inactivity
// ---------------------------------------------------------------------------

test("FR5-13: existing user linked to this Google account logs in", async (t) => {
    mockGoogleFlow(t);

    const user = await User.create({
        name: "Linked Agent",
        email: uniqueEmail(),
        password: "Password123",
        role: "support_agent",
        googleId: TEST_GOOGLE.sub,
        authProvider: "local",
    });

    const state = (await startGoogle()).searchParams.get("state");
    const res = await fetchCallback(state, { code: "code-ok" });

    assert.equal(res.status, 302);
    const token = tokenFromRedirect(res);
    assert.ok(token, "redirect should carry the portal JWT");
    assert.ok(!res.headers.get("location").includes(env.google.clientSecret));

    // The token is the existing portal JWT: it authenticates /auth/me and the
    // role/status of the linked user are preserved (no elevation, no demotion).
    const me = await fetch(`${ctx.base}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json());
    assert.equal(me.data.user.email, user.email);
    assert.equal(me.data.user.role, "support_agent");
    assert.equal(me.data.user.isActive, true);
    assert.equal(me.data.user.authProvider, "local");
    assert.equal(me.data.user.googleId, undefined, "googleId must never leak to the client");

    await User.deleteOne({ _id: user._id });
});

test("FR5-13: existing user with matching verified email is linked safely", async (t) => {
    mockGoogleFlow(t);

    const user = await User.create({
        name: "Existing End User",
        email: TEST_GOOGLE.email,
        password: "Password123",
        role: "user",
    });
    assert.equal(user.googleId, undefined, "unlinked users must not persist a googleId");

    const state = (await startGoogle()).searchParams.get("state");
    const res = await fetchCallback(state, { code: "code-ok" });

    assert.equal(res.status, 302, JSON.stringify(res));
    const token = tokenFromRedirect(res);
    assert.ok(token);

    // Linked, not duplicated, and role preserved.
    const linked = await User.findById(user._id);
    assert.equal(linked.googleId, TEST_GOOGLE.sub);
    assert.equal(linked.role, "user");
    assert.equal(linked.authProvider, "local", "a linked local account keeps password login");

    const count = await User.countDocuments({ email: TEST_GOOGLE.email });
    assert.equal(count, 1, "must not create a duplicate account");

    // The resulting JWT works on portal-protected endpoints.
    const incidents = await fetch(`${ctx.base}/api/v1/incidents?limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(incidents.status, 200);

    await User.deleteOne({ _id: user._id });
});

test("FR5-13: new Google user is auto-provisioned as an End User only", async (t) => {
    const payload = { ...TEST_GOOGLE, email: uniqueEmail() };
    mockGoogleFlow(t, payload);

    const state = (await startGoogle()).searchParams.get("state");
    const res = await fetchCallback(state, { code: "code-ok" });

    assert.equal(res.status, 302);
    const token = tokenFromRedirect(res);
    assert.ok(token);

    const created = await User.findOne({ email: payload.email });
    assert.ok(created, "account should be provisioned");
    assert.equal(created.role, "user", "Google claims must never grant admin/agent");
    assert.equal(created.authProvider, "google");
    assert.equal(created.googleId, payload.sub);

    // Auto-provisioned users cannot log in with a password (random hash).
    const withPassword = await User.findById(created._id).select("+password");
    assert.match(withPassword.password, /^\$2[a-z]?\$/);
    assert.equal(await withPassword.comparePassword("Password123"), false);

    assert.equal(await User.countDocuments({ email: payload.email }), 1);

    await User.deleteOne({ _id: created._id });
});

test("FR5-13: inactive user cannot sign in via Google", async (t) => {
    mockGoogleFlow(t);

    const user = await User.create({
        name: "Deactivated",
        email: uniqueEmail(),
        password: "Password123",
        role: "user",
        isActive: false,
        googleId: TEST_GOOGLE.sub,
    });

    const state = (await startGoogle()).searchParams.get("state");
    const res = await fetchCallback(state, { code: "code-ok" });

    assert.equal(res.status, 302);
    const location = new URL(res.headers.get("location"));
    assert.equal(location.searchParams.get("error"), "account_inactive");
    assert.equal(location.searchParams.get("token"), null);

    await User.deleteOne({ _id: user._id });
});

test("FR5-13: incomplete/unverified Google identity is rejected", async (t) => {
    mockGoogleFlow(t, { ...TEST_GOOGLE, emailVerified: false });

    const state = (await startGoogle()).searchParams.get("state");
    const res = await fetchCallback(state, { code: "code-ok" });

    assert.equal(res.status, 302);
    const location = new URL(res.headers.get("location"));
    assert.equal(location.searchParams.get("error"), "unverified_email");

    assert.equal(await User.countDocuments({ email: TEST_GOOGLE.email }), 0);
});

test("FR5-13: duplicate Google mapping (email bound to another Google user) is refused", async (t) => {
    mockGoogleFlow(t);

    await User.create({
        name: "Other Google User",
        email: TEST_GOOGLE.email,
        password: "Password123",
        role: "user",
        googleId: "some-other-google-sub",
    });

    const state = (await startGoogle()).searchParams.get("state");
    const res = await fetchCallback(state, { code: "code-ok" });

    assert.equal(res.status, 302);
    const location = new URL(res.headers.get("location"));
    assert.equal(location.searchParams.get("error"), "email_in_use");

    const count = await User.countDocuments({ email: TEST_GOOGLE.email });
    assert.equal(count, 1, "existing account must be untouched");
    await User.deleteMany({ email: TEST_GOOGLE.email });
});

// ---------------------------------------------------------------------------
// 4. Token exchange failure paths + secret hygiene
// ---------------------------------------------------------------------------

test("FR5-13: Google token exchange failure redirects with an error", async (t) => {
    t.mock.method(googleOAuthService, "exchangeCodeForTokens", async () => {
        throw new Error("invalid_grant: connection refused");
    });
    t.mock.method(googleOAuthService, "verifyIdToken", async () => TEST_GOOGLE);

    const state = (await startGoogle()).searchParams.get("state");
    const res = await fetchCallback(state, { code: "bad-code" });

    assert.equal(res.status, 302);
    const location = new URL(res.headers.get("location"));
    assert.equal(location.searchParams.get("error"), "token_exchange_failed");
});

test("FR5-13: ID token verification failure is handled cleanly", async (t) => {
    t.mock.method(googleOAuthService, "exchangeCodeForTokens", async () => FAKE_TOKENS);
    t.mock.method(googleOAuthService, "verifyIdToken", async () => {
        throw new Error("Token used too late or already used");
    });

    const state = (await startGoogle()).searchParams.get("state");
    const res = await fetchCallback(state, { code: "code-ok" });

    assert.equal(res.status, 302);
    const location = new URL(res.headers.get("location"));
    assert.equal(location.searchParams.get("error"), "verification_failed");
});

test("FR5-13: Google secrets and tokens are never exposed in responses", async (t) => {
    const payload = { ...TEST_GOOGLE, sub: `google-sub-${crypto.randomBytes(8).toString("hex")}`, email: uniqueEmail() };
    mockGoogleFlow(t, payload);

    const state = (await startGoogle()).searchParams.get("state");
    const res = await fetchCallback(state, { code: "code-ok" });

    const location = res.headers.get("location");
    assert.ok(!location.includes(env.google.clientSecret));
    assert.ok(!location.includes(FAKE_TOKENS.access_token));
    assert.ok(!location.includes(FAKE_TOKENS.refresh_token));
    assert.ok(!location.includes(FAKE_TOKENS.id_token));

    // The Google access/refresh tokens must not be persisted anywhere.
    const persisted = await User.find({}).select("+password").lean();
    const dumped = JSON.stringify(persisted);
    assert.ok(!dumped.includes(FAKE_TOKENS.access_token));
    assert.ok(!dumped.includes(FAKE_TOKENS.refresh_token));

    await User.deleteMany({ googleId: payload.sub });
});

test("FR5-13: the produced token is the existing portal JWT format", async (t) => {
    const payload = { ...TEST_GOOGLE, sub: `google-sub-${crypto.randomBytes(8).toString("hex")}`, email: uniqueEmail() };
    mockGoogleFlow(t, payload);

    const state = (await startGoogle()).searchParams.get("state");
    const res = await fetchCallback(state, { code: "code-ok" });
    const token = tokenFromRedirect(res);

    const user = await User.findOne({ email: payload.email });
    assert.ok(user, "auto-provisioned account should exist");

    const decoded = generateToken.verifyToken(token);
    assert.equal(decoded.id, user._id.toString());
    assert.ok(decoded.exp > Math.floor(Date.now() / 1000));

    await User.deleteOne({ _id: user._id });
});

// ---------------------------------------------------------------------------
// 5. Regression - password auth and self-registration still work
// ---------------------------------------------------------------------------

test("FR5-13 regression: username/password login still works", async () => {
    const res = await fetch(`${ctx.base}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@zybisys.com", password: "Password123" }),
    });

    assert.equal(res.status, 200, JSON.stringify(res));

    const { data } = await res.json();
    assert.ok(data.token);
    assert.equal(data.user.role, "admin");

    // That JWT still reaches protected portals (regression for the /me contract).
    const me = await fetch(`${ctx.base}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${data.token}` },
    });
    assert.equal(me.status, 200);
});

test("FR5-13 regression: self-registration still works", async () => {
    const res = await fetch(`${ctx.base}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Google Test Signup",
            email: uniqueEmail(),
            password: "Password123",
        }),
    });

    assert.equal(res.status, 201, JSON.stringify(res));
    const { data } = await res.json();
    assert.ok(data.token);
    assert.equal(data.user.role, "user");

    await User.deleteOne({ email: data.user.email });
});

test("FR5-13 regression: seeded password users have no googleId conflicts", async () => {
    // The open registration flow must keep creating accounts with googleId=null
    // (the sparse unique index must not block normal signups).
    const res = await fetch(`${ctx.base}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Null GoogleId",
            email: uniqueEmail(),
            password: "Password123",
        }),
    });

    assert.equal(res.status, 201, JSON.stringify(res));
    const count = await User.countDocuments({ googleId: null });
    assert.ok(count >= 1, "accounts without a googleId must co-exist");
});