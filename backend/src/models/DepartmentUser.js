const mongoose = require("mongoose");

const departmentUserSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "User is required"],
            // index: true,
        },

        department: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Department",
            required: [true, "Department is required"],
            // index: true,
        },

        isActive: {
            type: Boolean,
            default: true,
            // index: true,
        },

        assignedBy: {
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

// An agent can belong to only one department.
departmentUserSchema.index({ user: 1 }, { unique: true });

// Compound index for active members in a department
departmentUserSchema.index({ department: 1, isActive: 1 });

// Method to check if user is active in department
departmentUserSchema.methods.isActiveMember = function() {
    return this.isActive;
};

// Static method to get all active members of a department
departmentUserSchema.statics.getActiveMembers = function(departmentId) {
    return this.find({ 
        department: departmentId, 
        isActive: true
    }).populate('user');
};

// Static method to get departments for a user
departmentUserSchema.statics.getUserDepartments = function(userId) {
    return this.find({ 
        user: userId, 
        isActive: true
    }).populate('department');
};

// Transform to remove internal fields
departmentUserSchema.set("toJSON", {
    virtuals: true,
    transform: (_doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model("DepartmentUser", departmentUserSchema);
