const crypto = require("crypto");
const User = require("../models/User");
const DepartmentUser = require("../models/DepartmentUser");
const Department = require("../models/Department");
const logger = require("../utils/logger");
const { fetchRawEmployees } = require("./zohoPeopleService");
const { mapEmployees } = require("./zohoMapper");
const { ROLES } = require("../constants");

// Tags on the Department doc so we know whether it was created by an admin
// in the portal itself, or auto-created because Zoho People sent a
// department name we didn't have yet.
const DEPARTMENT_SOURCE = {
    DEFAULT: "incident management protal", // matches your existing default spelling — see note below
    ZOHO: "zoho",
};

// New users created from Zoho People default to this role. Existing users
// are never touched here (see the update branch below), so an admin's
// manual role change in the portal is never silently overwritten by a
// later sync.
const DEFAULT_ZOHO_USER_ROLE = ROLES.AGENT;

/**
 * Match order: zohoId first (survives email renames), email as a fallback
 * only for the first-ever sync of a given employee (to link an existing
 * local account instead of duplicating it).
 */
const findExistingUser = async (employee) => {
    const byZohoId = await User.findOne({ zohoId: employee.sourceId });
    if (byZohoId) return byZohoId;
    return User.findOne({ email: employee.email });
};

const randomPassword = () => crypto.randomBytes(24).toString("hex");

/**
 * Resolves the Department doc for an employee, in this order:
 *
 * 1. Match by zohoDepartmentId (Zoho's "Department.ID"). If found, this
 *    department is already correctly linked — use it as-is, no changes.
 * 2. No match by zohoDepartmentId, but an existing department has the same
 *    title (e.g. it was created manually in the portal before this employee
 *    was ever synced, or before this field existed at all). Heal it: write
 *    the zohoDepartmentId onto it and mark source: "zoho".
 * 3. No match at all — create a brand new department with the title and
 *    zohoDepartmentId, source: "zoho".
 *
 * Note: this is a check-then-act sequence, not a single atomic upsert, so
 * it relies on the sync job's own "one run at a time" lock (see
 * zohoSyncJob.js) to avoid two concurrent runs racing to create the same
 * department. That's already guaranteed elsewhere in this codebase.
 */
const resolveDepartment = async (departmentName, departmentZohoId) => {
    if (!departmentName) return { department: null, departmentCreated: false };

    if (departmentZohoId) {
        const byZohoId = await Department.findOne({ zohoDepartmentId: departmentZohoId });
        if (byZohoId) return { department: byZohoId, departmentCreated: false };
    }

    const byTitle = await Department.findOne({ title: departmentName });
    if (byTitle) {
        // Deliberately NOT byTitle.save() here: .save() re-validates the
        // WHOLE document, including fields we're not touching. Some
        // existing departments predate stricter validation and have
        // legacy-invalid data in fields like description/categories — a
        // full-document save on those would fail even though we only
        // want to set zohoDepartmentId and source. findOneAndUpdate with
        // an explicit $set only touches (and only validates, since
        // runValidators isn't set) the two fields we actually care about.
        const healed = await Department.findOneAndUpdate(
            { _id: byTitle._id },
            {
                $set: {
                    zohoDepartmentId: departmentZohoId || byTitle.zohoDepartmentId,
                    source: DEPARTMENT_SOURCE.ZOHO,
                },
            },
            { returnDocument: "after" }
        );
        return { department: healed, departmentCreated: false };
    }

    const created = await Department.create({
        title: departmentName,
        description: "Auto-created from Zoho People sync.",
        categories: [],
        isActive: true,
        source: DEPARTMENT_SOURCE.ZOHO,
        zohoDepartmentId: departmentZohoId || null,
    });

    return { department: created, departmentCreated: true };
};

/**
 * Ensures the user is linked to the right department (resolving/creating
 * it first via resolveDepartment), then creates/updates their
 * DepartmentUser link if needed.
 */
const syncDepartmentMembership = async (user, departmentName, departmentZohoId) => {
    const { department, departmentCreated } = await resolveDepartment(departmentName, departmentZohoId);
    if (!department) return { departmentCreated: false };

    if (departmentCreated) {
        logger.event("zoho_department_created", {
            title: departmentName,
            departmentId: department.id,
            zohoDepartmentId: departmentZohoId,
            source: DEPARTMENT_SOURCE.ZOHO,
        });
    }

    const existingLink = await DepartmentUser.findOne({ user: user._id });
    if (
        existingLink &&
        String(existingLink.department) === String(department._id) &&
        existingLink.isActive
    ) {
        return { departmentCreated };
    }

    await DepartmentUser.findOneAndUpdate(
        { user: user._id },
        { user: user._id, department: department._id, isActive: true },
        { upsert: true, returnDocument: "after" }
    );

    return { departmentCreated };
};

const runSync = async ({ dryRun = false } = {}) => {
    const summary = {
        created: [],
        updated: [],
        deactivated: [],
        linked: [],
        unchanged: 0,
        errors: [],
        skipped: [],
        departmentsCreated: [],
    };

    const rawEmployees = await fetchRawEmployees();
    const { employees, skipped } = mapEmployees(rawEmployees);
    summary.skipped = skipped;

    for (const employee of employees) {
        try {
            const { sourceId, email, name, department, departmentZohoId, isActive: active } = employee;

            const existing = await findExistingUser(employee);

            if (!existing) {
                summary.created.push(email);
                if (dryRun) continue;

                const user = await User.create({
                    name,
                    email,
                    password: randomPassword(),
                    isActive: active,
                    zohoId: sourceId,
                    role: DEFAULT_ZOHO_USER_ROLE,
                });

                const { departmentCreated } = await syncDepartmentMembership(user, department, departmentZohoId);
                if (departmentCreated) summary.departmentsCreated.push(department);

                logger.event("zoho_user_created", { email, zohoId: sourceId, userId: user.id });
                continue;
            }

            const isNewLink = !existing.zohoId;

            const changes = {};
            if (existing.name !== name) changes.name = name;
            if (existing.email !== email) changes.email = email;
            if (existing.isActive !== active) changes.isActive = active;
            if (existing.zohoId !== sourceId) changes.zohoId = sourceId;

            if (Object.keys(changes).length === 0) {
                summary.unchanged += 1;
                if (dryRun) continue;

                const { departmentCreated } = await syncDepartmentMembership(existing, department, departmentZohoId);
                if (departmentCreated) summary.departmentsCreated.push(department);
                continue;
            }

            if (isNewLink) summary.linked.push(email);
            else if (!active && existing.isActive) summary.deactivated.push(email);
            else summary.updated.push(email);

            if (dryRun) continue;

            Object.assign(existing, changes);
            await existing.save();

            const { departmentCreated } = await syncDepartmentMembership(existing, department, departmentZohoId);
            if (departmentCreated) summary.departmentsCreated.push(department);

            logger.event("zoho_user_updated", { email, zohoId: sourceId, changes: Object.keys(changes) });
        } catch (err) {
            summary.errors.push({ email: employee.email, zohoId: employee.sourceId, message: err.message });
            logger.event("zoho_sync_entry_error", { zohoId: employee.sourceId, message: err.message });
        }
    }

    logger.event("zoho_sync_completed", {
        created: summary.created.length,
        updated: summary.updated.length,
        linked: summary.linked.length,
        deactivated: summary.deactivated.length,
        unchanged: summary.unchanged,
        skipped: summary.skipped.length,
        departmentsCreated: summary.departmentsCreated.length,
        errors: summary.errors.length,
        dryRun,
    });

    return summary;
};

module.exports = { runSync };