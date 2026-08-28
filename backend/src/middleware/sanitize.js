/**
 * Strips MongoDB operator syntax out of user input.
 *
 * Without this, a body of `{ "email": { "$ne": null } }` would reach a
 * `findOne` and match the first user in the collection. Keys beginning with
 * `$` or containing `.` are removed rather than escaped - no legitimate field
 * name in this API uses them.
 */

const isPlainObject = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);

const clean = (value, depth = 0) => {
    // Guard against a deeply nested payload being used to burn CPU.
    if (depth > 10) return undefined;

    if (Array.isArray(value)) {
        return value.map((item) => clean(item, depth + 1));
    }

    if (isPlainObject(value)) {
        return Object.entries(value).reduce((acc, [key, val]) => {
            if (key.startsWith("$") || key.includes(".")) return acc;
            acc[key] = clean(val, depth + 1);
            return acc;
        }, {});
    }

    return value;
};

const sanitizeRequest = (req, _res, next) => {
    if (req.body) req.body = clean(req.body);
    if (req.params) req.params = clean(req.params);

    // In Express 5 `req.query` is a lazy getter on the prototype and cannot be
    // assigned to, so the sanitized copy is installed as an own property.
    if (req.query && Object.keys(req.query).length) {
        Object.defineProperty(req, "query", {
            value: clean(req.query),
            writable: true,
            configurable: true,
            enumerable: true,
        });
    }

    next();
};

module.exports = sanitizeRequest;
