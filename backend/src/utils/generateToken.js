const jwt = require("jsonwebtoken");
const { env } = require("../config/env");

/**
 * Signs a short-lived access token. The payload is deliberately minimal - the
 * role is re-read from the database on every request, so a token cannot keep
 * granting access after a user is demoted or deactivated.
 */
const generateToken = (user) =>
    jwt.sign({ id: user._id.toString() }, env.jwtSecret, {
        expiresIn: env.jwtExpiresIn,
    });

const verifyToken = (token) => jwt.verify(token, env.jwtSecret);

module.exports = generateToken;
module.exports.generateToken = generateToken;
module.exports.verifyToken = verifyToken;
