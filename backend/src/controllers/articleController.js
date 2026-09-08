const KBA = require("../models/KnowledgeBaseArticle");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { successResponse, paginatedResponse } = require("../utils/apiResponse");
const { getPagination } = require("../utils/pagination");
const { containsPattern } = require("../utils/escapeRegex");
const { articleToArticle } = require("../utils/articleMapper");
const { KBA_STATUS } = require("../constants");

/**
 * FR5-07 - public, OAuth-protected Knowledge Base Articles API.
 *
 * Article visibility follows the existing KB rules: only `published` articles
 * are returned. Drafts, retired and archived articles are never exposed, and
 * soft-deleted articles are automatically excluded by the model's pre-hooks.
 * Search reuses the exact same regex mechanism (`containsPattern`) as the
 * existing KB list/search endpoint so the two surfaces behave identically.
 */

const POPULATE = [
    { path: "categories", select: "name" },
    { path: "authorID", select: "name" },
];

/**
 * GET /api/v1/articles
 *
 * Returns published articles with optional search / categoryId filters. The
 * public surface can never see drafts because the base filter always requires
 * `status = published`.
 */
const listArticles = asyncHandler(async (req, res) => {
    const { search, categoryId } = req.query;
    const conditions = [{ status: KBA_STATUS.PUBLISHED }];

    if (categoryId) {
        conditions.push({ categories: { $in: [categoryId] } });
    }

    if (search && String(search).trim()) {
        const pattern = containsPattern(search);
        conditions.push({
            $or: [
                { title: pattern },
                { body: pattern },
                { tags: { $in: [pattern] } },
            ],
        });
    }

    const filter =
        conditions.length === 1 ? conditions[0] : { $and: conditions };

    const { page, limit, skip } = getPagination(req.query, {
        defaultLimit: 10,
    });
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    const [items, total] = await Promise.all([
        KBA.find(filter)
            .populate(POPULATE)
            .sort({ createdAt: sortOrder })
            .skip(skip)
            .limit(limit)
            .lean(),
        KBA.countDocuments(filter),
    ]);

    return paginatedResponse(
        res,
        "Articles retrieved",
        items.map(articleToArticle),
        { page, limit, total }
    );
});

/**
 * GET /api/v1/articles/:id
 *
 * Returns one published article. A valid-but-non-published or deleted article
 * returns 404 - internal articles are never exposed through the public API.
 */
const getArticle = asyncHandler(async (req, res) => {
    const kba = await KBA.findOne({
        _id: req.params.id,
        status: KBA_STATUS.PUBLISHED,
    }).populate(POPULATE);

    if (!kba) throw ApiError.notFound("Article not found");

    return successResponse(res, 200, "Article retrieved", {
        article: articleToArticle(kba.toObject ? kba.toObject() : kba),
    });
});

module.exports = { listArticles, getArticle };