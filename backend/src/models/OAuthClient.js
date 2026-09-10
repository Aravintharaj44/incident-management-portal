const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { OAUTH_SCOPE_VALUES } = require("../constants");

const SALT_ROUNDS = 10;

/**
 * FR5-02 - OAuth 2.0 client registration for the public REST API.
 *
 * A client represents an external system (e.g. a Zoho-style ticket consumer)
 * that authenticates with the client-credentials grant. The client secret is
 * only ever stored as a bcrypt hash - exactly like User.password - so there is
 * no code path that can persist a plaintext secret.
 *
 * Permissions are delegated to a linked service-account `user` (an existing
 * portal account, typically a support agent or admin). oauthProtect resolves
 * that user on every request, so all of the existing permissionService,
 * visibility and audit rules apply unchanged and OAuth calls are attributed to
 * a real account.
 */
const oauthClientSchema = new mongoose.Schema(
    {
        clientId: {
            type: String,
            required: [true, "clientId is required"],
            unique: true,
            trim: true,
            index: true,
        },

        // Never ships with a query result unless explicitly re-selected.
        clientSecretHash: {
            type: String,
            required: [true, "clientSecretHash is required"],
            select: false,
        },

        name: {
            type: String,
            required: [true, "Client name is required"],
            trim: true,
            maxlength: [120, "Client name cannot exceed 120 characters"],
        },

        description: {
            type: String,
            trim: true,
            maxlength: [500, "Description cannot exceed 500 characters"],
        },

        // The portal account whose permissions this client acts with.
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "A linked service-account user is required"],
            index: true,
        },

        // FR5-02 ships only the client-credentials grant; this array keeps the
        // model ready for later grants without letting arbitrary values in.
        grantTypes: {
            type: [String],
            enum: {
                values: ["client_credentials"],
                message: "Unsupported grant type",
            },
            default: ["client_credentials"],
        },

        scopes: {
            type: [String],
            enum: {
                values: OAUTH_SCOPE_VALUES,
                message: "Unsupported OAuth scope",
            },
            default: [],
        },

        // Setting this to false revokes the client: it can no longer obtain
        // new tokens (enforced at the token endpoint).
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },

        // Timestamp when the client was revoked, for audit purposes.
        revokedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

/**
 * Hash on the way in, always - mirrors the User model's password hook so a
 * controller, seed script or admin CLI cannot accidentally store a plaintext
 * client secret. A value that is already a bcrypt hash is left untouched.
 */
oauthClientSchema.pre("save", async function hashClientSecret() {
    if (!this.isModified("clientSecretHash")) return;

    const value = this.clientSecretHash;
    const alreadyHashed =
        typeof value === "string" && value.startsWith("$2") && value.length >= 60;

    if (!alreadyHashed) {
        this.clientSecretHash = await bcrypt.hash(value, SALT_ROUNDS);
    }
});

oauthClientSchema.methods.compareClientSecret = function compareClientSecret(candidate) {
    return bcrypt.compare(candidate, this.clientSecretHash);
};

/** The safe representation handed to the client. Never any secret material. */
oauthClientSchema.methods.toPublicJSON = function toPublicJSON() {
    return {
        id: this._id,
        clientId: this.clientId,
        name: this.name,
        description: this.description,
        user: this.user,
        grantTypes: this.grantTypes,
        scopes: this.scopes,
        isActive: this.isActive,
        revokedAt: this.revokedAt,
        createdAt: this.createdAt,
    };
};

// Defence in depth: even a raw res.json(client) cannot leak the hash.
oauthClientSchema.set("toJSON", {
    virtuals: true,
    transform: (_doc, ret) => {
        delete ret.clientSecretHash;
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model("OAuthClient", oauthClientSchema);