const mongoose = require("mongoose");
const KBA = require("../models/KnowledgeBaseArticle");
const ArticleFeedback = require("../models/ArticleFeedback");
const Category = require("../models/Category");
const Incident = require("../models/Incident");
const Problem = require("../models/Problem");
const ApiError = require("../utils/ApiError");
const permissions = require("../services/permissionService");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");
const { containsPattern } = require("../utils/escapeRegex");
const { successResponse, paginatedResponse } = require("../utils/apiResponse");
const { getPagination } = require("../utils/pagination");
const activityService = require("../services/activityService");

const {
    KBA_STATUS,
    KBA_STATUS_VALUE,
    ACTIVITY_ACTIONS,
} = require("../constants");

const toArray = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return [value];
};

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const SORTABLE_FIELDS = {
    title: "title",
    status: "status",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    helpfulCount: "helpfulCount",
    notHelpfulCount: "notHelpfulCount",
};

const POPULATE = [
    { path: "categories", select: "name isActive description" },
    { path: "authorID", select: "name email role" },
];

const buildSort = (query) => {
    const field = SORTABLE_FIELDS[query.sortBy] || "createdAt";
    const direction = query.sortOrder === "asc" ? 1 : -1;
    return field === "createdAt"
        ? { createdAt: direction }
        : { [field]: direction, createdAt: -1 };
};

const decorateKBA = (kba) => {
    if (!kba) return null;
    const obj = kba.toObject ? kba.toObject() : { ...kba };
    obj.totalVotes = (obj.helpfulCount || 0) + (obj.notHelpfulCount || 0);
    obj.helpfulnessRatio =
        obj.totalVotes > 0
            ? (((obj.helpfulCount || 0) / obj.totalVotes) * 100).toFixed(2) + "%"
            : "0%";
    return obj;
};

/**
 * GET /api/v1/kba
 * Public search for published articles; staff sees all statuses.
 */
const listKBA = asyncHandler(async (req, res) => {
    const { search, author, category, tags, dateFrom, dateTo } = req.query;
    const conditions = [];

    if (!permissions.canViewKBDrafts(req.user)) {
        conditions.push({ status: KBA_STATUS.PUBLISHED });
    } else if (req.query.status) {
        const statuses = toArray(req.query.status).filter((s) =>
            KBA_STATUS_VALUE.includes(s)
        );
        if (statuses.length) conditions.push({ status: { $in: statuses } });
    }

    const categories = toArray(category).filter(isValidId);
    if (categories.length) {
        conditions.push({ categories: { $in: categories } });
    }

    if (author === "me") {
        conditions.push({ authorID: req.user._id });
    } else if (author && isValidId(author)) {
        conditions.push({ authorID: author });
    }

    if (tags) {
        const tagArray = toArray(tags);
        conditions.push({ tags: { $in: tagArray } });
    }

    if (dateFrom || dateTo) {
        const range = {};
        if (dateFrom && !Number.isNaN(Date.parse(dateFrom))) {
            range.$gte = new Date(dateFrom);
        }
        if (dateTo && !Number.isNaN(Date.parse(dateTo))) {
            const end = new Date(dateTo);
            end.setHours(23, 59, 59, 999);
            range.$lte = end;
        }
        if (Object.keys(range).length) conditions.push({ createdAt: range });
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
        conditions.length === 0
            ? {}
            : conditions.length === 1
              ? conditions[0]
              : { $and: conditions };

    const { page, limit, skip } = getPagination(req.query, {
        defaultLimit: 10,
    });

    const [items, total] = await Promise.all([
        KBA.find(filter)
            .populate(POPULATE)
            .sort(buildSort(req.query))
            .skip(skip)
            .limit(limit)
            .lean(),
        KBA.countDocuments(filter),
    ]);

    return paginatedResponse(
        res,
        "KB articles retrieved",
        items.map(decorateKBA),
        { page, limit, total }
    );
});

/**
 * GET /api/v1/kba/suggestions
 * Suggest published KB articles matching an incident title/category.
 */
const suggestKBA = asyncHandler(async (req, res) => {
    const { title, category } = req.query;

    const conditions = [{ status: KBA_STATUS.PUBLISHED }];

    if (category && isValidId(category)) {
        conditions.push({ categories: { $in: [category] } });
    }

    const filter =
        conditions.length === 1 ? conditions[0] : { $and: conditions };

    let items = await KBA.find(filter)
        .populate("categories", "name")
        .sort({ helpfulCount: -1, createdAt: -1 })
        .limit(20)
        .lean();

    if (title && String(title).trim()) {
        const pattern = containsPattern(title);
        const titleMatches = items.filter(
            (a) => pattern.test(a.title) || pattern.test(a.body)
        );
        if (titleMatches.length > 0) {
            items = titleMatches;
        }
    }

    items = items.slice(0, 5).map(decorateKBA);

    return successResponse(res, 200, "Suggestions retrieved", {
        articles: items,
    });
});

/**
 * GET /api/v1/kba/:id
 */
const getKBA = asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) throw ApiError.badRequest("Invalid article ID");

    const kba = await KBA.findById(req.params.id).populate(POPULATE);

    if (!kba) throw ApiError.notFound("Knowledge Base Article not found");

    if (
        kba.status !== KBA_STATUS.PUBLISHED &&
        !permissions.canViewKBDrafts(req.user)
    ) {
        throw ApiError.forbidden("This article is not published yet");
    }

    const feedback = await ArticleFeedback.findOne({
        articleId: kba._id,
        userId: req.user._id,
    }).lean();

    return successResponse(res, 200, "KB article retrieved", {
        article: decorateKBA(kba),
        userFeedback: feedback ? feedback.value : null,
        permissions: {
            canEdit: permissions.canEditKB(req.user, kba),
            canManage: permissions.canManageKB(req.user),
        },
    });
});

/**
 * POST /api/v1/kba
 * Staff create a KB article (always starts as Draft).
 */
const createKBA = asyncHandler(async (req, res) => {
    if (!permissions.canCreateKB(req.user)) {
        throw ApiError.forbidden("Only support staff can create KB articles");
    }

    const { title, body, categories, tags, status } = req.body;

    if (!categories || !Array.isArray(categories) || categories.length === 0) {
        throw ApiError.badRequest("At least one category is required");
    }

    const categoryIds = [...new Set(categories.filter(String))];
    const foundCategories = await Category.find({
        _id: { $in: categoryIds },
    })
        .select("_id")
        .lean();

    if (foundCategories.length !== categoryIds.length) {
        throw ApiError.badRequest(
            "One or more selected categories no longer exist"
        );
    }

    const articleStatus =
        status && permissions.canManageKB(req.user)
            ? status
            : KBA_STATUS.DRAFT;

    try {
        const kba = await KBA.create({
            title: title.trim(),
            body: body.trim(),
            categories: categoryIds,
            tags: tags ? [...new Set(tags.map(String))] : [],
            authorID: req.user._id,
            status: articleStatus,
        });

        const created = await KBA.findById(kba._id).populate(POPULATE);

        await activityService.record({
            kbArticle: kba._id,
            action: ACTIVITY_ACTIONS.KB_ARTICLE_CREATED,
            performedBy: req.user._id,
            note: `Created KB article "${kba.title}"`,
        });

        if (articleStatus === KBA_STATUS.PUBLISHED) {
            await activityService.record({
                kbArticle: kba._id,
                action: ACTIVITY_ACTIONS.KB_ARTICLE_PUBLISHED,
                performedBy: req.user._id,
                note: "Published on creation",
            });
        }

        return successResponse(res, 201, "KB article created", {
            article: decorateKBA(created),
        });
    } catch (error) {
        if (error.code === 11000) {
            throw ApiError.conflict("A KB article with this title already exists");
        }
        throw error;
    }
});

/**
 * PATCH /api/v1/kba/:id
 */
const updateKBA = asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) throw ApiError.badRequest("Invalid article ID");

    const kba = await KBA.findById(req.params.id);
    if (!kba) throw ApiError.notFound("Knowledge Base Article not found");

    if (!permissions.canEditKB(req.user, kba)) {
        throw ApiError.forbidden("You do not have permission to edit this article");
    }

    const { title, body, categories, tags, status } = req.body;

    if (categories) {
        if (!Array.isArray(categories) || categories.length === 0) {
            throw ApiError.badRequest("At least one category is required");
        }
        const categoryIds = [...new Set(categories.map(String))];
        const foundCategories = await Category.find({
            _id: { $in: categoryIds },
            isActive: true,
        })
            .select("_id")
            .lean();
        if (foundCategories.length !== categoryIds.length) {
            throw ApiError.badRequest(
                "One or more selected categories no longer exist or are inactive"
            );
        }
    }

    if (status && !KBA_STATUS_VALUE.includes(status)) {
        throw ApiError.badRequest(
            `Invalid status. Allowed: ${KBA_STATUS_VALUE.join(", ")}`
        );
    }

    if (tags && !Array.isArray(tags)) {
        throw ApiError.badRequest("Tags must be an array");
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title.trim();
    if (body !== undefined) updateData.body = body.trim();
    if (categories) updateData.categories = [...new Set(categories.map(String))];
    if (tags) updateData.tags = [...new Set(tags.map(String))];
    if (status) updateData.status = status;

    if (status === KBA_STATUS.PUBLISHED) {
        const currentTitle = title || kba.title;
        const currentBody = body || kba.body;
        const currentCategories =
            categories || (kba.categories && kba.categories.length);
        if (!currentTitle) throw ApiError.badRequest("Title is required to publish");
        if (!currentBody) throw ApiError.badRequest("Body is required to publish");
        if (!currentCategories) {
            throw ApiError.badRequest("At least one category is required to publish");
        }
    }

    const wasPublished = kba.status === KBA_STATUS.PUBLISHED;
    const isNowPublished = status === KBA_STATUS.PUBLISHED;

    Object.assign(kba, updateData);
    await kba.save();

    const auditEntries = [];
    if (title !== undefined || body !== undefined || categories || tags) {
        auditEntries.push({
            kbArticle: kba._id,
            action: ACTIVITY_ACTIONS.KB_ARTICLE_UPDATED,
            performedBy: req.user._id,
            note: "Article details updated",
        });
    }
    if (!wasPublished && isNowPublished) {
        auditEntries.push({
            kbArticle: kba._id,
            action: ACTIVITY_ACTIONS.KB_ARTICLE_PUBLISHED,
            performedBy: req.user._id,
            note: "Article published",
        });
    }
    if (auditEntries.length) {
        await activityService.recordMany(auditEntries);
    }

    const updated = await KBA.findById(kba._id).populate(POPULATE);

    return successResponse(res, 200, "KB article updated", {
        article: decorateKBA(updated),
    });
});

/**
 * DELETE /api/v1/kba/:id
 */
const deleteKBA = asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) throw ApiError.badRequest("Invalid article ID");

    const kba = await KBA.findById(req.params.id);
    if (!kba) throw ApiError.notFound("Knowledge Base Article not found");

    if (!permissions.canManageKB(req.user)) {
        throw ApiError.forbidden("You do not have permission to delete this article");
    }

    if (kba.deletedAt) {
        throw ApiError.badRequest("This article is already deleted");
    }

    kba.deletedAt = new Date();
    kba.status = KBA_STATUS.ARCHIVED;
    await kba.save();

    return successResponse(res, 200, "KB article deleted", {
        article: decorateKBA(kba),
    });
});

/**
 * POST /api/v1/kba/:id/feedback
 * Submit or change feedback on a KB article.
 */
const feedbackKBA = asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) throw ApiError.badRequest("Invalid article ID");

    const kba = await KBA.findById(req.params.id);
    if (!kba) throw ApiError.notFound("Knowledge Base Article not found");

    if (kba.status !== KBA_STATUS.PUBLISHED) {
        throw ApiError.badRequest("You can only rate published articles");
    }

    const { value } = req.body;
    if (!value || !["helpful", "not_helpful"].includes(value)) {
        throw ApiError.badRequest("Value must be 'helpful' or 'not_helpful'");
    }

    const existing = await ArticleFeedback.findOne({
        articleId: kba._id,
        userId: req.user._id,
    });

    if (existing) {
        if (existing.value === value) {
            return successResponse(res, 200, "Feedback already recorded", {
                article: decorateKBA(kba),
                userFeedback: value,
            });
        }

        const oldWasHelpful = existing.value === "helpful";
        const newIsHelpful = value === "helpful";

        if (oldWasHelpful && !newIsHelpful) {
            await KBA.updateOne(
                { _id: kba._id },
                { $inc: { helpfulCount: -1, notHelpfulCount: 1 } }
            );
        } else if (!oldWasHelpful && newIsHelpful) {
            await KBA.updateOne(
                { _id: kba._id },
                { $inc: { helpfulCount: 1, notHelpfulCount: -1 } }
            );
        }

        existing.value = value;
        await existing.save();
    } else {
        const incField =
            value === "helpful" ? "helpfulCount" : "notHelpfulCount";
        await KBA.updateOne(
            { _id: kba._id },
            { $inc: { [incField]: 1 } }
        );

        await ArticleFeedback.create({
            articleId: kba._id,
            userId: req.user._id,
            value,
        });
    }

    await activityService.record({
        kbArticle: kba._id,
        action: ACTIVITY_ACTIONS.KB_ARTICLE_FEEDBACK,
        performedBy: req.user._id,
        note: `Rated article as "${value === "helpful" ? "Helpful" : "Not helpful"}"`,
    });

    const updated = await KBA.findById(kba._id).populate(POPULATE);

    return successResponse(res, 200, "Feedback recorded", {
        article: decorateKBA(updated),
        userFeedback: value,
    });
});

module.exports = {
    listKBA,
    getKBA,
    createKBA,
    updateKBA,
    deleteKBA,
    feedbackKBA,
    suggestKBA,
};
