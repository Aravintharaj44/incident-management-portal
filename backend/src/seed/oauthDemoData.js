/**
 * FR5-02/FR5-03 - demo OAuth client credentials used by the seed script AND
 * the E2E test suites (tests/oauth.test.js, tests/oauthScopes.test.js).
 *
 * These are deliberately fixed so an automated test run can authenticate
 * deterministically, exactly like DEMO_PASSWORD in seed.js. They are DEMO-ONLY
 * credentials: the plaintext secret is never stored - the seed script hands the
 * value to the OAuthClient model which hashes it on the way in.
 *
 * Do NOT reuse or promote these to production; create real clients with
 * `npm run oauth:create-client`.
 */
const DEMO_OAUTH = {
    // Portal user the demo clients act as (created by the seed script).
    serviceAccount: {
        name: "System Integration",
        email: "integration@zybisys.com",
    },
    // Active client bound to the admin service account for full ticket access.
    active: {
        name: "Demo Integration Client",
        clientId: "demo-oauth-client",
        clientSecret: "demo-oauth-client-secret",
        scopes: ["tickets.READ", "tickets.WRITE", "tickets.ALL"],
    },
    // Read-only client for scope restriction tests.
    readOnly: {
        name: "Read-Only Integration Client",
        clientId: "read-only-oauth-client",
        clientSecret: "read-only-oauth-client-secret",
        scopes: ["tickets.READ"],
    },
    // Contacts-only client for unrelated-scope rejection tests.
    contactsRead: {
        name: "Contacts Read Client",
        clientId: "contacts-read-oauth-client",
        clientSecret: "contacts-read-oauth-client-secret",
        scopes: ["contacts.READ"],
    },
    // Revoked client for revocation tests.
    revoked: {
        name: "Revoked Integration Client",
        clientId: "revoked-oauth-client",
        clientSecret: "revoked-oauth-client-secret",
        scopes: ["tickets.READ", "tickets.WRITE"],
    },
};

module.exports = { DEMO_OAUTH };