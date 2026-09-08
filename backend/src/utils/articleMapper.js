const { idOf } = require("./ticketMapper");

/**
 * FR5-07 - public representation of a Knowledge Base article.
 *
 * Deliberately maps ONLY fields that exist on the KnowledgeBaseArticle model
 * (backend/src/models/KnowledgeBaseArticle.js). Internal Mongo/audit fields
 * (_id, __v, authorID, deletedAt, index internals, etc.) are never exposed.
 *
 * The article maps to the real model, which is a many-to-many category model:
 *   - body   -> the article body (the model has no "content"/"summary" field)
 *   - categories -> array of { id, name } (populated from the Category model)
 *   - author -> { id, name } (populated from the User model)
 */
const categoryRef = (category) => {
    if (!category) return null;
    if (typeof category === "object" && category._id && category.name) {
        return { id: idOf(category), name: category.name };
    }
    return { id: idOf(category) };
};

const userRef = (user) => {
    if (!user) return null;
    if (typeof user === "object" && user._id && user.name) {
        return { id: idOf(user), name: user.name };
    }
    return { id: idOf(user) };
};

const articleToArticle = (kba) => {
    if (!kba) return null;

    const categories = Array.isArray(kba.categories)
        ? kba.categories.map(categoryRef).filter(Boolean)
        : [];

    return {
        id: idOf(kba),
        title: kba.title,
        body: kba.body,
        status: kba.status || "draft",
        tags: Array.isArray(kba.tags) ? kba.tags : [],
        categories,
        author: userRef(kba.authorID),
        helpfulCount: kba.helpfulCount || 0,
        notHelpfulCount: kba.notHelpfulCount || 0,
        createdAt: kba.createdAt || null,
        updatedAt: kba.updatedAt || null,
    };
};

module.exports = { articleToArticle, categoryRef, userRef };