/**
 * Normalises `page` / `limit` query parameters into safe numbers.
 * The upper bound on `limit` stops a client from asking for the whole
 * collection in one request.
 */
const MAX_LIMIT = 100;

const getPagination = (query, { defaultLimit = 10 } = {}) => {
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);

    const requestedLimit = Number.parseInt(query.limit, 10) || defaultLimit;
    const limit = Math.min(MAX_LIMIT, Math.max(1, requestedLimit));

    return { page, limit, skip: (page - 1) * limit };
};

module.exports = { getPagination, MAX_LIMIT };
