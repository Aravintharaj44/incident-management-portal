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

/**
 * Normalises Zoho Desk-style `from` / `limit` query parameters (FR5-01, FR5-08).
 * `from` is a zero-based offset into the collection; `limit` is the number of
 * records to return. The MAX_LIMIT clamp is a last line of defence - the
 * express-validator rules reject out-of-range values before these ever reach
 * a controller.
 */
const getFromLimit = (query, { defaultLimit = 10 } = {}) => {
    const from = Math.max(0, Number.parseInt(query.from, 10) || 0);
    const requestedLimit = Number.parseInt(query.limit, 10) || defaultLimit;
    const limit = Math.min(MAX_LIMIT, Math.max(1, requestedLimit));
    return { from, limit, skip: from };
};

/**
 * Builds the pagination metadata for a public list response (FR5-08).
 *
 * It is a superset of the earlier tickets/contacts envelope ({count, from,
 * limit, totalPages, hasNextPage, hasPrevPage}) so existing consumers keep
 * working, and it adds the Zoho-style {total, hasMore} keys:
 *
 *   from   - zero-based offset of the current page
 *   limit  - page size
 *   count  - number of records matching the filters (existing convention)
 *   total  - same as count, exposed under the Zoho-style name
 *   hasMore- whether another page remains after the records returned here
 *
 * `rowCount` is the number of records actually returned on this page;
 * `total` is the number of records matching the current filters.
 */
const buildPaginationMeta = ({ from, limit, total, rowCount }) => ({
    count: total,
    from,
    limit,
    total,
    hasMore: from + rowCount < total,
    totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
    hasNextPage: from + rowCount < total,
    hasPrevPage: from > 0,
});

module.exports = { getPagination, getFromLimit, buildPaginationMeta, MAX_LIMIT };
