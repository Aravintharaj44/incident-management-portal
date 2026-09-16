const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, "Title is required"],
            trim: true,
            maxlength: [140, "Title cannot exceed 140 characters"],
            validate: {
                validator: function(v) {
                    // Zoho department names (e.g. "IT") can be shorter than
                    // the 5-char minimum we enforce for titles created
                    // manually in the portal.
                    if (this.source === "zoho") return true;
                    return typeof v === "string" && v.trim().length >= 5;
                },
                message: "Title must be at least 5 characters"
            },
            // index: true,
        },

        description: {
            type: String,
            trim: true,
            maxlength: [5000, "Description cannot exceed 5000 characters"],
            validate: {
                validator: function(v) {
                    // Zoho-sourced departments always get a real
                    // auto-generated description on creation (see
                    // resolveDepartment() in zohoSyncService.js), so this
                    // only exists to protect manually-created ones.
                    if (this.source === "zoho") return true;
                    return typeof v === "string" && v.trim().length >= 10;
                },
                message: "Description must be at least 10 characters"
            },
        },

        // Multiple categories - array of ObjectIds
        categories: {
            type: [mongoose.Schema.Types.ObjectId],
            ref: "Category",
            default: [],
            validate: {
                validator: function(v) {
                    // Departments auto-created from Zoho People don't have
                    // category data available at creation time — an admin
                    // fills these in later. Any department created through
                    // the portal itself must still have at least one.
                    if (this.source === "zoho") return true;
                    return Array.isArray(v) && v.length > 0;
                },
                message: "Department must have at least one category"
            },
            // index: true,
        },

        isActive: {
            type: Boolean,
            default: true,
            // index: true,
        },

        // Where this department record came from: created manually in the
        // portal, or auto-created / linked because Zoho People sent this
        // department's data.
        source: {
            type: String,
            enum: ["incident management protal", "zoho"],
            default: "incident management protal",
        },

        // Zoho People's own unique ID for this department ("Department.ID"
        // in the raw API response). null for departments that have never
        // been linked to a Zoho record. Used as the primary match key
        // during sync — title is only a fallback, since titles can change
        // but this ID doesn't.
        zohoDepartmentId: {
            type: String,
            default: null,
            unique: true,
            sparse: true, // allows many docs with null, but no two equal non-null values
        },

        headOfDepartment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Virtual for member count
departmentSchema.virtual('memberCount', {
    ref: 'DepartmentUser',
    localField: '_id',
    foreignField: 'department',
    count: true
});

departmentSchema.index(
    { title: 1 },
    { unique: true, collation: { locale: "en", strength: 2 } }
);

// Method to add a category
departmentSchema.methods.addCategory = async function(categoryId) {
    if (!this.categories.includes(categoryId)) {
        this.categories.push(categoryId);
        await this.save();
    }
    return this;
};

// Method to remove a category
departmentSchema.methods.removeCategory = async function(categoryId) {
    this.categories = this.categories.filter(
        id => id.toString() !== categoryId.toString()
    );
    await this.save();
    return this;
};

// Static method to find departments by category
departmentSchema.statics.findByCategory = function(categoryId) {
    return this.find({ categories: categoryId, isActive: true });
};

// Transform to remove internal fields
departmentSchema.set("toJSON", {
    virtuals: true,
    transform: (_doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model("Department", departmentSchema);