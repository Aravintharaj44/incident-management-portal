const Category = require('../models/Category');
const logger = require('../utils/logger');

const DEFAULT_INTAKE_CATEGORY_NAME = 'Network';

let cachedId = null;

async function getDefaultIntakeCategoryId() {
  if (cachedId) return cachedId;

  let category = await Category.findOne({ name: DEFAULT_INTAKE_CATEGORY_NAME });

  if (!category) {
    category = await Category.create({
      name: DEFAULT_INTAKE_CATEGORY_NAME,
      isActive: true,
    });
    logger.info(
      `[categoryService] Created default intake category "${DEFAULT_INTAKE_CATEGORY_NAME}" (${category._id}).`
    );
  } else if (category.isActive === false) {
    // Someone deactivated it in the UI — reactivate rather than silently
    // creating a second one or failing every intake.
    category.isActive = true;
    await category.save();
    logger.warn(
      `[categoryService] Default intake category "${DEFAULT_INTAKE_CATEGORY_NAME}" was inactive — reactivated.`
    );
  }

  cachedId = category._id;
  return cachedId;
}

function invalidateDefaultCategoryCache() {
  cachedId = null;
}

module.exports = {
  getDefaultIntakeCategoryId,
  invalidateDefaultCategoryCache,
  DEFAULT_INTAKE_CATEGORY_NAME,
};