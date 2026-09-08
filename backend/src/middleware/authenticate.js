const jwt = require("jsonwebtoken");
const protect = require("./auth");
const oauthProtect = require("./oauth");
const { ACCESS_TOKEN_TYPE } = require("../services/oauthService");

/**
 * FR5-02 - route guard for endpoints that accept BOTH authentication styles.
 *
 * A portal login JWT (payload `{ id, iat, exp }`, signed with the portal
 * secret) and an OAuth access token (payload with `typ: "access_token"` and a
 * `client_id`, signed with the OAuth secret) are deliberately distinct. This
 * middleware cheaply peeks at the unverified payload to decide which verify
 * path to run:
 *
 *   - `typ === "access_token"`  -> OAuth verify (oauthProtect)
 *   - anything else (or none)   -> existing portal JWT verify (protect)
 *
 * Peeking only needs a base64 decode, never a signature check, so a token
 * cannot be smuggled from one flow into the other (each verifier also enforces
 * its own secret, claims and issuer/audience). Malformed tokens land in the
 * portal path and are rejected with the standard 401.
 */
const authenticate = (req, res, next) => {
    const header = req.headers.authorization;

    if (header && header.startsWith("Bearer ")) {
        const headerToken = header.slice(7).trim();

        try {
            const decoded = jwt.decode(headerToken);
            if (decoded && typeof decoded === "object" && decoded.typ === ACCESS_TOKEN_TYPE) {
                return oauthProtect(req, res, next);
            }
        } catch {
            // Malformed payload - fall through to the portal path, which 401s.
        }
    }

    return protect(req, res, next);
};

module.exports = authenticate;
module.exports.authenticate = authenticate;