const Department = require("../models/Department");
const DepartmentUser = require("../models/DepartmentUser");
const Category = require("../models/Category");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const logger = require("../utils/logger");
const { successResponse } = require("../utils/apiResponse");
const { ROLES } = require("../constants");

const ids = (values) => [...new Set(values.map(String))];
const detail = (id) => Department.findById(id).populate("categories", "name description isActive").populate("headOfDepartment", "name email role isActive").lean();
const membersFor = (department) => DepartmentUser.find({ department }).populate("user", "name email role isActive").sort({ createdAt: 1 }).lean();

async function validatePayload({ members, headOfDepartment, categories, departmentId }) {
    const memberIds = ids(members);
    if (!memberIds.includes(String(headOfDepartment))) throw ApiError.badRequest("The head of department must be one of the selected members");
    const [users, foundCategories, assignments] = await Promise.all([
        User.find({ _id: { $in: memberIds }, role: ROLES.AGENT, isActive: true }).select("name").lean(),
        Category.find({ _id: { $in: ids(categories) } }).select("_id").lean(),
        DepartmentUser.find({ user: { $in: memberIds } }).select("user department").lean(),
    ]);
    if (users.length !== memberIds.length) throw ApiError.badRequest("Members and the department head must be active support agents");
    if (foundCategories.length !== ids(categories).length) throw ApiError.badRequest("One or more selected categories no longer exist");
    const occupied = assignments.find((item) => !departmentId || String(item.department) !== String(departmentId));
    if (occupied) {
        const user = users.find((item) => String(item._id) === String(occupied.user));
        throw ApiError.conflict(`${user?.name || "A selected user"} already belongs to another department`);
    }
    return memberIds;
}

const listDepartments = asyncHandler(async (_req, res) => {
    const [departments, counts] = await Promise.all([
        Department.find().populate("categories", "name description isActive").populate("headOfDepartment", "name email role isActive").sort({ title: 1 }).lean(),
        DepartmentUser.aggregate([{ $group: { _id: "$department", count: { $sum: 1 } } }]),
    ]);
    const countById = new Map(counts.map((row) => [String(row._id), row.count]));
    successResponse(res, 200, "Departments retrieved", { departments: departments.map((item) => ({ ...item, memberCount: countById.get(String(item._id)) || 0 })) });
});

const getDepartment = asyncHandler(async (req, res) => {
    const department = await detail(req.params.id);
    if (!department) throw ApiError.notFound("Department not found");
    successResponse(res, 200, "Department retrieved", { department: { ...department, members: await membersFor(department._id) } });
});

const createDepartment = asyncHandler(async (req, res) => {
    const { title, description, isActive = true, headOfDepartment, categories, members } = req.body;
    const memberIds = await validatePayload({ members, headOfDepartment, categories });
    const duplicate = await Department.findOne({ title }).collation({ locale: "en", strength: 2 });
    if (duplicate) throw ApiError.conflict(`A department named "${duplicate.title}" already exists`);
    const department = await Department.create({ title, description, isActive, headOfDepartment, categories: ids(categories) });
    try {
        await DepartmentUser.insertMany(memberIds.map((user) => ({ user, department: department._id, assignedBy: req.user._id })));
    } catch (error) {
        await department.deleteOne();
        if (error?.code === 11000) throw ApiError.conflict("A selected user already belongs to another department");
        throw error;
    }
    logger.event("department_created", { departmentId: department.id, by: req.user.id });
    successResponse(res, 201, "Department created", { department: { ...(await detail(department._id)), members: await membersFor(department._id) } });
});

const updateDepartment = asyncHandler(async (req, res) => {
    const department = await Department.findById(req.params.id);
    if (!department) throw ApiError.notFound("Department not found");
    const currentMembers = await DepartmentUser.find({ department: department._id }).distinct("user");
    const members = req.body.members ?? currentMembers;
    const headOfDepartment = req.body.headOfDepartment ?? department.headOfDepartment;
    const categories = req.body.categories ?? department.categories;
    const memberIds = await validatePayload({ members, headOfDepartment, categories, departmentId: department._id });
    if (req.body.title && req.body.title.toLowerCase() !== department.title.toLowerCase()) {
        const duplicate = await Department.findOne({ title: req.body.title }).collation({ locale: "en", strength: 2 });
        if (duplicate) throw ApiError.conflict(`A department named "${duplicate.title}" already exists`);
    }
    ["title", "description", "isActive", "headOfDepartment"].forEach((field) => { if (req.body[field] !== undefined) department[field] = req.body[field]; });
    department.categories = ids(categories);
    await department.save();
    const existingIds = ids(currentMembers);
    const toRemove = existingIds.filter((id) => !memberIds.includes(id));
    const toAdd = memberIds.filter((id) => !existingIds.includes(id));
    if (toRemove.length) await DepartmentUser.deleteMany({ department: department._id, user: { $in: toRemove } });
    try {
        if (toAdd.length) await DepartmentUser.insertMany(toAdd.map((user) => ({ user, department: department._id, assignedBy: req.user._id })));
    } catch (error) {
        if (error?.code === 11000) throw ApiError.conflict("A selected user already belongs to another department");
        throw error;
    }
    logger.event("department_updated", { departmentId: department.id, by: req.user.id });
    successResponse(res, 200, "Department updated", { department: { ...(await detail(department._id)), members: await membersFor(department._id) } });
});

const deleteDepartment = asyncHandler(async (req, res) => {
    const department = await Department.findById(req.params.id);
    if (!department) throw ApiError.notFound("Department not found");
    await DepartmentUser.deleteMany({ department: department._id });
    await department.deleteOne();
    logger.event("department_deleted", { departmentId: req.params.id, by: req.user.id });
    successResponse(res, 200, `Department "${department.title}" deleted`);
});

module.exports = { listDepartments, getDepartment, createDepartment, updateDepartment, deleteDepartment };
