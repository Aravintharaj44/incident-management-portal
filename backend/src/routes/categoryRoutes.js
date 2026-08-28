const express = require("express");
const protect = require("../middleware/auth");
const authorize = require("../middleware/roleCheck");
const validate = require("../middleware/validate");
const { categoryValidators } = require("../validators");
const { ROLES } = require("../constants");
const {
    listCategories,
    listCategoriesWithCounts,
    createCategory,
    updateCategory,
    deleteCategory,
} = require("../controllers/categoryController");

const router = express.Router();

router.use(protect);

// Any signed-in user needs the list to fill the "raise an incident" dropdown.
router.get("/", listCategories);

// Managing the master list is admin-only (FR-13).
router.get("/with-counts", authorize(ROLES.ADMIN), listCategoriesWithCounts);

router.post(
    "/",
    authorize(ROLES.ADMIN),
    categoryValidators.create,
    validate,
    createCategory
);

router
    .route("/:id")
    .patch(authorize(ROLES.ADMIN), categoryValidators.update, validate, updateCategory)
    .delete(authorize(ROLES.ADMIN), categoryValidators.byId, validate, deleteCategory);

module.exports = router;
