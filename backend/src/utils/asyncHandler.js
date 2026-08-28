/**
 * Wraps an async route handler so a rejected promise is forwarded to the
 * Express error handler instead of hanging the request.
 *
 * Express 5 forwards rejected promises automatically, but wrapping explicitly
 * keeps the intent obvious and stays correct if the handler is ever reused
 * outside a router.
 */
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
