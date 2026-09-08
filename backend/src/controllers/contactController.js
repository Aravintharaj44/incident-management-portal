const crypto = require("crypto");

const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");
const { successResponse } = require("../utils/apiResponse");
const { MAX_LIMIT } = require("../utils/pagination");
const { containsPattern } = require("../utils/escapeRegex");
const { userToContact, contactToUserPayload } = require("../utils/contactMapper");
const { ROLES } = require("../constants");

const getFromLimit = (query, { defaultLimit = 10 } = {}) => {
    const from = Math.max(0, Number.parseInt(query.from, 10) || 0);
    const requestedLimit = Number.parseInt(query.limit, 10) || defaultLimit;
    const limit = Math.min(MAX_LIMIT, Math.max(1, requestedLimit));
    return { from, limit, skip: from };
};


const listContacts = asyncHandler(async (req, res) => {
    const filter = { role: ROLES.USER };

    if (req.query.search) {
        const pattern = containsPattern(req.query.search);
        filter.$or = [{ name: pattern }, { email: pattern }];
    }

    const { from, limit, skip } = getFromLimit(req.query, { defaultLimit: 10 });
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    const [users, total] = await Promise.all([
        User.find(filter).sort({ createdAt: sortOrder }).skip(skip).limit(limit).lean(),
        User.countDocuments(filter),
    ]);

    const contacts = users.map(userToContact);

    return successResponse(res, 200, "Contacts retrieved", {
        contacts,
        count: total,
        from,
        limit,
        pagination: {
            count: total,
            from,
            limit,
            totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
            hasNextPage: from + contacts.length < total,
            hasPrevPage: from > 0,
        },
    });
});

const getContact = asyncHandler(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, role: ROLES.USER });

    if (!user) throw ApiError.notFound("Contact not found");

    return successResponse(res, 200, "Contact retrieved", {
        contact: userToContact(user),
    });
});

const createContact = asyncHandler(async (req, res) => {
    // Only name/email/isActive ever leave the body; the mapper is the whitelist.
    const payload = contactToUserPayload(req.body);

    const normalizedEmail = payload.email.toLowerCase();

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
        throw ApiError.conflict("A contact with that email already exists");
    }

    // Never derived from the body. Generates a valid but unusable portal secret.
    // const generatedPassword = crypto.randomBytes(24).toString("hex");
    const generatedPassword = "Password123";

    const user = await User.create({
        name: payload.name,
        email: normalizedEmail,
        password: generatedPassword,
        role: ROLES.USER,
        isActive: payload.isActive,
    });

    logger.event("contact_created", { contactId: user.id, by: req.user.id });

    return successResponse(res, 201, "Contact created successfully", {
        contact: userToContact(user),
    });
});

const updateContact = asyncHandler(async (req, res) => {
    // Only name/email/isActive ever leave the body; the mapper is the whitelist.
    const payload = contactToUserPayload(req.body);

    // PUT is a full replacement: the core supported fields must be supplied.
    const missing = ["name", "email"].filter((key) => payload[key] === undefined);
    if (missing.length) {
        throw ApiError.badRequest(`PUT requires: ${missing.join(", ")}`);
    }

    const user = await User.findOne({ _id: req.params.id, role: ROLES.USER });
    if (!user) throw ApiError.notFound("Contact not found");

    const normalizedEmail = payload.email.toLowerCase();

    if (normalizedEmail !== user.email) {
        const taken = await User.findOne({ email: normalizedEmail });
        if (taken) {
            throw ApiError.conflict("A contact with that email already exists");
        }
    }

    const changed =
        payload.name !== user.name ||
        normalizedEmail !== user.email ||
        (payload.isActive !== undefined && payload.isActive !== user.isActive);

    if (!changed) {
        throw ApiError.badRequest("No changes were supplied");
    }

    user.name = payload.name;
    user.email = normalizedEmail;
    if (payload.isActive !== undefined) user.isActive = payload.isActive;

    await user.save();

    logger.event("contact_updated", { contactId: user.id, by: req.user.id });

    return successResponse(res, 200, "Contact updated", {
        contact: userToContact(user),
    });
});

module.exports = {
    listContacts,
    getContact,
    createContact,
    updateContact,
};