const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, "Title is required"],
            trim: true,
            minlength: [5, "Title must be at least 5 characters"],
            maxlength: [140, "Title cannot exceed 140 characters"],
            // index: true,
        },

        description: {
            type: String,
            required: [true, "Description is required"],
            trim: true,
            minlength: [10, "Description must be at least 10 characters"],
            maxlength: [5000, "Description cannot exceed 5000 characters"],
        },

        // Multiple categories - array of ObjectIds
        categories: {
            type: [mongoose.Schema.Types.ObjectId],
            ref: "Category",
            required: [true, "At least one category is required"],
            validate: {
                validator: function(v) {
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
