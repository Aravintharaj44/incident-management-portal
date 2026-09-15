const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { ROLES, ROLE_VALUES } = require("../constants");

const SALT_ROUNDS = 10;

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
            maxlength: [80, "Name cannot exceed 80 characters"],
        },

        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please provide a valid email address"],
        },

        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: [6, "Password must be at least 6 characters"],
            // Never ships with a query result unless explicitly re-selected.
            select: false,
        },

        role: {
            type: String,
            enum: ROLE_VALUES,
            default: ROLES.USER,
            index: true,
        },

        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },

        // FR5-13 - Google OpenID Connect subject ("sub") claim, present only
        // once the account has been linked to a Google identity. Deliberately
        // NO `default: null`: MongoDB's sparse indexes only skip documents
        // where the field is *missing*, so persisting null would index every
        // ordinary user and break the unique constraint. Unlinked users simply
        // have no googleId path at all - `{ googleId: sub }` lookups only ever
        // match linked accounts.
        googleId: {
            type: String,
        },

        // How the account is primarily provisioned. Informational only - it is
        // never used for access control. A locally-provisioned account that is
        // later linked to Google keeps "local" (password login still works).
        authProvider: {
            type: String,
            enum: ["local", "google"],
            default: "local",
        },

        lastLoginAt: {
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
 * Hash on the way in, always. Because this lives on the model rather than in a
 * controller, there is no code path - seed script, admin user creation,
 * password reset - that can accidentally store a plaintext password.
 */
userSchema.pre("save", async function hashPassword() {
    if (!this.isModified("password")) return;

    this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
    return bcrypt.compare(candidate, this.password);
};

// FR5-13 - a Google identity can be linked to at most one account. Sparse:
// documents without a googleId (the overwhelming majority) are not indexed, so
// ordinary password-only users never conflict.
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });

/** The safe representation handed to the client. */
userSchema.methods.toPublicJSON = function toPublicJSON() {
    return {
        id: this._id,
        name: this.name,
        email: this.email,
        role: this.role,
        isActive: this.isActive,
        authProvider: this.authProvider,
        lastLoginAt: this.lastLoginAt,
        createdAt: this.createdAt,
    };
};

// Defence in depth: even a raw res.json(user) cannot leak the hash.
userSchema.set("toJSON", {
    virtuals: true,
    transform: (_doc, ret) => {
        delete ret.password;
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model("User", userSchema);
