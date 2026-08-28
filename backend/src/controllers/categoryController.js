const Category = require("../models/Category");
const Incident = require("../models/Incident");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");
const { successResponse } = require("../utils/apiResponse");
const { TERMINAL_STATUSES } = require("../constants");

/**
 * GET /api/v1/categories
 *
 * Any signed-in user needs this to fill the category dropdown on the "raise an
 * incident" form. By default only active categories are returned; an Admin can
 * pass ?includeInactive=true to manage the full master list.
 */
const listCategories = asyncHandler(async (req, res) => {
    const includeInactive =
        req.query.includeInactive === "true" && req.user.role === "admin";

    const filter = includeInactive ? {} : { isActive: true };

    const categories = await Category.find(filter).sort({ name: 1 }).lean();

    return successResponse(res, 200, "Categories retrieved", { categories });
});

/**
 * GET /api/v1/categories/with-counts  (Admin only)
 * Adds the number of incidents per category, for the admin screen and the
 * dashboard breakdown.
 */
const listCategoriesWithCounts = asyncHandler(async (_req, res) => {
    const [categories, counts] = await Promise.all([
        Category.find().sort({ name: 1 }).lean(),
        Incident.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]),
    ]);

    const countByCategory = new Map(counts.map((row) => [String(row._id), row.count]));

    const enriched = categories.map((category) => ({
        ...category,
        incidentCount: countByCategory.get(String(category._id)) || 0,
    }));

    return successResponse(res, 200, "Categories retrieved", { categories: enriched });
});

/** POST /api/v1/categories  (Admin only) */
const createCategory = asyncHandler(async (req, res) => {
    const { name, description } = req.body;

    // Case-insensitive duplicate check, matching the collation on the index.
    const existing = await Category.findOne({ name }).collation({
        locale: "en",
        strength: 2,
    });

    if (existing) throw ApiError.conflict(`A category named "${existing.name}" already exists`);

    const category = await Category.create({
        name,
        description,
        createdBy: req.user._id,
    });

    logger.event("category_created", { categoryId: category.id, by: req.user.id });

    return successResponse(res, 201, "Category created", { category });
});

/** PATCH /api/v1/categories/:id  (Admin only) */
const updateCategory = asyncHandler(async (req, res) => {
    const { name, description, isActive } = req.body;

    const category = await Category.findById(req.params.id);
    if (!category) throw ApiError.notFound("Category not found");

    if (name && name.toLowerCase() !== category.name.toLowerCase()) {
        const clash = await Category.findOne({ name }).collation({
            locale: "en",
            strength: 2,
        });
        if (clash) throw ApiError.conflict(`A category named "${clash.name}" already exists`);
    }

    // Retiring a category must not leave open incidents pointing at something
    // the reporter can no longer see in the UI.
    if (isActive === false && category.isActive) {
        const openIncidents = await Incident.countDocuments({
            category: category._id,
            status: { $nin: TERMINAL_STATUSES },
        });

        if (openIncidents > 0) {
            throw ApiError.badRequest(
                `${openIncidents} open incident(s) still use this category. ` +
                    "Close or recategorise them before deactivating it."
            );
        }
    }

    if (name !== undefined) category.name = name;
    if (description !== undefined) category.description = description;
    if (isActive !== undefined) category.isActive = isActive;

    await category.save();

    logger.event("category_updated", { categoryId: category.id, by: req.user.id });

    return successResponse(res, 200, "Category updated", { category });
});

/**
 * DELETE /api/v1/categories/:id  (Admin only)
 *
 * A category that has never been used is deleted outright; one that incidents
 * reference is deactivated instead, so historical records keep their label.
 */
const deleteCategory = asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id);
    if (!category) throw ApiError.notFound("Category not found");

    const inUse = await Incident.countDocuments({ category: category._id });

    if (inUse > 0) {
        category.isActive = false;
        await category.save();

        return successResponse(
            res,
            200,
            `"${category.name}" is used by ${inUse} incident(s), so it has been ` +
                "deactivated instead of deleted.",
            { category, deactivated: true }
        );
    }

    await category.deleteOne();

    logger.event("category_deleted", { categoryId: req.params.id, by: req.user.id });

    return successResponse(res, 200, `"${category.name}" was deleted`, {
        deactivated: false,
    });
});

module.exports = {
    listCategories,
    listCategoriesWithCounts,
    createCategory,
    updateCategory,
    deleteCategory,
};
