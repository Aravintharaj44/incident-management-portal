const OAuthClient = require("../models/OAuthClient");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");
const { containsPattern } = require("../utils/escapeRegex");
const { successResponse, paginatedResponse } = require("../utils/apiResponse");
const { getPagination } = require("../utils/pagination");
const { ROLES } = require("../constants");
const {
    generateClientId,
    generateClientSecret,
} = require("../services/oauthService");

/**
 * The safe shape handed out by every client endpoint. Never any secret
 * material (clientSecretHash is select:false at the model level as well).
 * Handles both mongoose documents and lean documents with a populated user.
 */
const toClientJSON = (client) => {
    const rawUser = client.user;
    let user = null;

    if (rawUser && typeof rawUser === "object" && rawUser._id) {
        user = {
            id: rawUser._id,
            name: rawUser.name,
            email: rawUser.email,
        };
    } else if (rawUser) {
        user = rawUser;
    }

    return {
        id: client._id,
        clientId: client.clientId,
        name: client.name,
        description: client.description,
        user,
        grantTypes: client.grantTypes,
        scopes: client.scopes,
        isActive: client.isActive,
        revokedAt: client.revokedAt || null,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
    };
};

/** Validates that a client can be linked to the service-account user. */
const assertValidServiceAccount = async (userId) => {
    const user = await User.findById(userId).select("name email role isActive").lean();
    if (!user) throw ApiError.badRequest("Please select a valid service account");

    if (user.role === ROLES.USER) {
        throw ApiError.badRequest(
            "An OAuth client must map to a service account with staff privileges (support_agent or admin)"
        );
    }

    if (user.isActive === false) {
        throw ApiError.badRequest("The linked service account is deactivated");
    }

    return user;
};

/**
 * GET /api/v1/oauth/clients  (Admin only) - FR5-10
 * Paginated list with name/clientId search and an isActive filter.
 */
const listClients = asyncHandler(async (req, res) => {
    const { search, isActive, sortOrder } = req.query;
    const { page, limit, skip } = getPagination(req.query, { defaultLimit: 10 });

    const filter = {};

    if (search) {
        const pattern = containsPattern(search);
        filter.$or = [{ name: pattern }, { clientId: pattern }];
    }

    if (isActive === "true") filter.isActive = true;
    if (isActive === "false") filter.isActive = false;

    const sort = sortOrder === "asc" ? { createdAt: 1 } : { createdAt: -1 };

    const [clients, total] = await Promise.all([
        OAuthClient.find(filter)
            .populate("user", "name email")
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean(),
        OAuthClient.countDocuments(filter),
    ]);

    return paginatedResponse(res, "OAuth clients retrieved", clients.map(toClientJSON), {
        page,
        limit,
        total,
    });
});

/** GET /api/v1/oauth/clients/:id  (Admin only) - single client detail. */
const getClient = asyncHandler(async (req, res) => {
    const client = await OAuthClient.findById(req.params.id)
        .populate("user", "name email")
        .lean();

    if (!client) throw ApiError.notFound("OAuth client not found");

    return successResponse(res, 200, "OAuth client retrieved", {
        client: toClientJSON(client),
    });
});

/**
 * POST /api/v1/oauth/clients  (Admin only)
 *
 * Creates a client with a freshly generated clientId/secret. The plaintext
 * secret is returned exactly once in this response - the model only ever
 * stores a bcrypt hash, so there is no way to retrieve it later.
 */
const createClient = asyncHandler(async (req, res) => {
    const { name, description, user: userId, scopes } = req.body;

    const serviceAccount = await assertValidServiceAccount(userId);

    // The pre-save hook hashes anything that is not already a bcrypt hash,
    // so passing the generated secret here keeps the plaintext out of the
    // database exactly like the CLI script does.
    const clientSecret = generateClientSecret();

    const client = await OAuthClient.create({
        clientId: generateClientId(),
        clientSecretHash: clientSecret,
        name,
        description,
        user: userId,
        grantTypes: ["client_credentials"],
        scopes,
        isActive: true,
    });

    logger.event("oauth_client_created", {
        clientId: client._id.toString(),
        name: client.name,
        scopes: client.scopes,
        serviceAccount: serviceAccount.email,
        by: req.user.id,
    });

    return successResponse(res, 201, "OAuth client created", {
        client: toClientJSON(client),
        // Shown once - copy it down now, it cannot be retrieved again.
        clientSecret,
        note: "Store the client secret securely now; it is shown only once.",
    });
});

/**
 * PATCH /api/v1/oauth/clients/:id  (Admin only)
 *
 * Updates descriptive fields, scopes, the linked service account, or the
 * active state. Deactivating a client records revokedAt for audit; reactivating clears it.
 */
const updateClient = asyncHandler(async (req, res) => {
    const { name, description, user: userId, scopes, isActive } = req.body;

    const client = await OAuthClient.findById(req.params.id);
    if (!client) throw ApiError.notFound("OAuth client not found");

    if (userId !== undefined) {
        await assertValidServiceAccount(userId);
        client.user = userId;
    }

    if (name !== undefined) client.name = name;
    if (description !== undefined) client.description = description;
    if (scopes !== undefined) client.scopes = scopes;

    if (isActive !== undefined) {
        client.isActive = isActive;
        client.revokedAt = isActive ? null : new Date();
    }

    await client.save();

    logger.event("oauth_client_updated", {
        clientId: client._id.toString(),
        by: req.user.id,
    });

    return successResponse(res, 200, "OAuth client updated", {
        client: toClientJSON(client),
    });
});

/**
 * POST /api/v1/oauth/clients/:id/revoke  (Admin only)
 *
 * Revokes a client so it can no longer obtain access tokens. Idempotent -
 * revoking an already-inactive client is a no-op returning 200.
 */
const revokeClient = asyncHandler(async (req, res) => {
    const client = await OAuthClient.findById(req.params.id);
    if (!client) throw ApiError.notFound("OAuth client not found");

    if (client.isActive) {
        client.isActive = false;
        client.revokedAt = new Date();
        await client.save();

        logger.event("oauth_client_revoked", {
            clientId: client._id.toString(),
            by: req.user.id,
        });
    }

    return successResponse(res, 200, "OAuth client revoked", {
        client: toClientJSON(client),
    });
});

module.exports = {
    listClients,
    getClient,
    createClient,
    updateClient,
    revokeClient,
};