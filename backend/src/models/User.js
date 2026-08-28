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

/** The safe representation handed to the client. */
userSchema.methods.toPublicJSON = function toPublicJSON() {
    return {
        id: this._id,
        name: this.name,
        email: this.email,
        role: this.role,
        isActive: this.isActive,
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
