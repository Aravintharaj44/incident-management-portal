/**
 * FR5-02 - demo OAuth client credentials used by the seed script AND the E2E
 * test suite (tests/oauth.test.js).
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
    active: {
        name: "Demo Integration Client",
        clientId: "demo-oauth-client",
        clientSecret: "demo-oauth-client-secret",
    },
    revoked: {
        name: "Revoked Integration Client",
        clientId: "revoked-oauth-client",
        clientSecret: "revoked-oauth-client-secret",
    },
};

module.exports = { DEMO_OAUTH };