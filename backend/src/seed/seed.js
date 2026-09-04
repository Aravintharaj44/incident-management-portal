require("dotenv").config();

const mongoose = require("mongoose");
const { env, validateEnv } = require("../config/env");
const { connectDB, disconnectDB } = require("../config/db");
const logger = require("../utils/logger");

const User = require("../models/User");
const Category = require("../models/Category");
const Incident = require("../models/Incident");
const Comment = require("../models/Comment");
const ActivityLog = require("../models/ActivityLog");
const Attachment = require("../models/Attachment");
const Notification = require("../models/Notification");
const Counter = require("../models/Counter");
const Department = require("../models/Department");
const DepartmentUser = require("../models/DepartmentUser");
const Problem = require("../models/Problem");
const RootCauseAnalysis = require("../models/RootCauseAnalysis");

const { ROLES, STATUS, PRIORITY, ACTIVITY_ACTIONS, PROBLEM_STATUS } = require("../constants");

/**
 * Seeds a realistic demo data set so the portal can be reviewed without
 * clicking through hours of manual setup.
 *
 *   npm run seed
 *
 * By default it clears the collections first (SEED_RESET=false disables that).
 * Documents are created with `new`/`save()` rather than `insertMany` so the
 * model hooks still run - passwords get hashed and incident numbers get
 * allocated exactly as they would in normal use.
 */

const DEMO_PASSWORD = "Password123";

const USERS = [
    { name: "Aarthi Menon", email: "admin@zybisys.com", role: ROLES.ADMIN },
    { name: "Rahul Verma", email: "rahul.agent@zybisys.com", role: ROLES.AGENT },
    { name: "Priya Nair", email: "priya.agent@zybisys.com", role: ROLES.AGENT },
    { name: "Karthik Rao", email: "karthik@zybisys.com", role: ROLES.USER },
    { name: "Sneha Iyer", email: "sneha@zybisys.com", role: ROLES.USER },
    { name: "Vikram Shetty", email: "vikram@zybisys.com", role: ROLES.USER },
];

const CATEGORIES = [
    { name: "Network", description: "Connectivity, VPN, Wi-Fi and bandwidth issues" },
    { name: "Application", description: "Errors and defects in business applications" },
    { name: "Hardware", description: "Laptops, desktops, printers and peripherals" },
    { name: "Access", description: "Account access, permissions and password resets" },
    { name: "Security", description: "Suspected security events and policy violations" },
];

/**
 * Incident templates. `ageHours` back-dates createdAt so the seeded data has a
 * realistic spread - including some already-breached SLAs for the dashboard's
 * overdue tile to pick up.
 */
const INCIDENTS = [
    {
        title: "VPN disconnects every few minutes for the finance team",
        description:
            "Since this morning, users in the finance team report the VPN client drops roughly every five minutes. Reconnecting works but the session drops again shortly after. Around eight people are affected.",
        category: "Network",
        priority: PRIORITY.HIGH,
        status: STATUS.IN_PROGRESS,
        reporter: "karthik@zybisys.com",
        assignee: "rahul.agent@zybisys.com",
        ageHours: 6,
        comments: [
            { author: "rahul.agent@zybisys.com", message: "Looking at the concentrator logs now - I can see repeated re-auth attempts." },
            { author: "karthik@zybisys.com", message: "Thanks. Two more people from finance just reported the same thing." },
        ],
    },
    {
        title: "Payroll portal returns a 500 error on the reports page",
        description:
            "Opening Reports > Monthly Summary in the payroll portal returns a 500 error. Other pages load normally. Reproduced in both Chrome and Edge.",
        category: "Application",
        priority: PRIORITY.CRITICAL,
        status: STATUS.IN_PROGRESS,
        reporter: "sneha@zybisys.com",
        assignee: "priya.agent@zybisys.com",
        ageHours: 20,
        comments: [
            { author: "priya.agent@zybisys.com", message: "Reproduced. The stack trace points at the report aggregation query timing out." },
            { author: "priya.agent@zybisys.com", message: "Adding an index on the payroll_run collection - internal note.", internal: true },
        ],
    },
    {
        title: "Printer on the second floor jams on every duplex job",
        description:
            "The shared printer near the second-floor meeting rooms jams whenever a double-sided print job is sent. Single-sided printing works fine.",
        category: "Hardware",
        priority: PRIORITY.LOW,
        status: STATUS.ON_HOLD,
        reporter: "vikram@zybisys.com",
        assignee: "rahul.agent@zybisys.com",
        ageHours: 50,
        comments: [
            { author: "rahul.agent@zybisys.com", message: "Waiting on the vendor to deliver a replacement duplex unit. On hold until it arrives." },
        ],
    },
    {
        title: "Cannot access the shared marketing drive after the team move",
        description:
            "After moving to the new team structure I have lost access to the shared marketing drive. I get a permission denied message when opening the folder.",
        category: "Access",
        priority: PRIORITY.MEDIUM,
        status: STATUS.RESOLVED,
        reporter: "sneha@zybisys.com",
        assignee: "priya.agent@zybisys.com",
        ageHours: 96,
        resolvedAfterHours: 5,
        resolutionNote: "Added the user to the MKT-Shared security group and confirmed access.",
        comments: [
            { author: "priya.agent@zybisys.com", message: "Your account was still in the old group. Adding you to MKT-Shared now." },
            { author: "sneha@zybisys.com", message: "Confirmed, I can open the folder again. Thank you." },
        ],
    },
    {
        title: "Phishing email impersonating the finance director",
        description:
            "Several staff received an email claiming to be from the finance director asking for an urgent bank transfer. The sending domain is not ours. No one has responded so far.",
        category: "Security",
        priority: PRIORITY.CRITICAL,
        status: STATUS.CLOSED,
        reporter: "karthik@zybisys.com",
        assignee: "rahul.agent@zybisys.com",
        ageHours: 168,
        resolvedAfterHours: 2,
        closedAfterHours: 24,
        resolutionNote: "Sender domain blocked at the gateway and the message purged from all mailboxes. Awareness note sent to staff.",
        comments: [
            { author: "rahul.agent@zybisys.com", message: "Blocked the sender domain and purged the message from all mailboxes." },
        ],
    },
    {
        title: "Laptop battery drains within an hour of unplugging",
        description:
            "My work laptop battery went from around four hours of runtime to under one hour over the last two weeks. Battery health in Windows reports a significant capacity drop.",
        category: "Hardware",
        priority: PRIORITY.MEDIUM,
        status: STATUS.NEW,
        reporter: "vikram@zybisys.com",
        assignee: null,
        // Deliberately older than the 24h medium-priority SLA, so this one
        // shows up as overdue on the dashboard.
        ageHours: 40,
        comments: [],
    },
    {
        title: "Wi-Fi signal is very weak in the ground floor training room",
        description:
            "During training sessions the Wi-Fi in the ground floor training room keeps dropping to one bar and video calls stall. The adjacent rooms are fine.",
        category: "Network",
        priority: PRIORITY.MEDIUM,
        status: STATUS.NEW,
        reporter: "sneha@zybisys.com",
        assignee: null,
        ageHours: 3,
        comments: [],
    },
    {
        title: "Timesheet application logs the user out after every save",
        description:
            "Saving a timesheet entry returns the user to the login screen. Logging back in shows the entry was saved, but having to sign in after every row makes it unusable.",
        category: "Application",
        priority: PRIORITY.HIGH,
        status: STATUS.ON_HOLD,
        reporter: "karthik@zybisys.com",
        assignee: "priya.agent@zybisys.com",
        ageHours: 30,
        comments: [
            { author: "priya.agent@zybisys.com", message: "Session cookie looks like it is being dropped after the POST. Raised with the vendor, awaiting their response." },
        ],
    },
    {
        title: "New joiner needs access to the CRM and the sales dashboard",
        description:
            "A new sales executive starts on Monday and needs a CRM account plus read access to the sales dashboard. Manager approval is attached in the ticket thread.",
        category: "Access",
        priority: PRIORITY.LOW,
        status: STATUS.RESOLVED,
        reporter: "vikram@zybisys.com",
        assignee: "rahul.agent@zybisys.com",
        ageHours: 72,
        resolvedAfterHours: 20,
        resolutionNote: "CRM account created and dashboard read access granted. Credentials sent to the manager.",
        comments: [],
    },
    {
        title: "Backup job for the document server failed three nights running",
        description:
            "The nightly backup for the document server has reported a failure for three consecutive nights. The job log mentions insufficient space on the backup target.",
        category: "Application",
        priority: PRIORITY.HIGH,
        status: STATUS.IN_PROGRESS,
        reporter: "karthik@zybisys.com",
        assignee: "rahul.agent@zybisys.com",
        // Well past the 8h high-priority SLA - another overdue example.
        ageHours: 26,
        comments: [
            { author: "rahul.agent@zybisys.com", message: "The backup target is at 98% capacity. Clearing archives older than the retention policy." },
        ],
    },
];

const hoursAgo = (hours) => new Date(Date.now() - hours * 3600000);

const clearCollections = async () => {
    await Promise.all([
        User.deleteMany({}),
        Category.deleteMany({}),
        Incident.deleteMany({}),
        Comment.deleteMany({}),
        ActivityLog.deleteMany({}),
        Attachment.deleteMany({}),
        Notification.deleteMany({}),
        Counter.deleteMany({}),
        Department.deleteMany({}),
        DepartmentUser.deleteMany({}),
        Problem.deleteMany({}),
        RootCauseAnalysis.deleteMany({}),
    ]);

    logger.info("Cleared existing collections");
};

const seedUsers = async () => {
    const created = [];

    for (const spec of USERS) {
        // `new` + `save()` so the password-hashing hook runs.
        const user = new User({ ...spec, password: DEMO_PASSWORD });
        await user.save();
        created.push(user);
    }

    logger.info(`Created ${created.length} users`);
    return new Map(created.map((user) => [user.email, user]));
};

const seedCategories = async (adminId) => {
    const created = await Category.insertMany(
        CATEGORIES.map((category) => ({ ...category, createdBy: adminId }))
    );

    logger.info(`Created ${created.length} categories`);
    return new Map(created.map((category) => [category.name, category]));
};

/**
 * Demo departments so the assignment workflow (category -> department ->
 * member) can be exercised straight after a fresh seed. Each seeded agent is
 * placed as the member (and head) of the department that owns their work.
 */
const seedDepartments = async (adminId, usersByEmail, categoriesByName) => {
    const DEPARTMENTS = [
        {
            title: "Infrastructure Support",
            description: "Owns network, hardware and security incidents.",
            categories: ["Network", "Hardware", "Security"],
            head: "rahul.agent@zybisys.com",
            members: ["rahul.agent@zybisys.com"],
        },
        {
            title: "Application Support",
            description: "Owns application and access incidents.",
            categories: ["Application", "Access"],
            head: "priya.agent@zybisys.com",
            members: ["priya.agent@zybisys.com"],
        },
    ];

    const byCategory = new Map();
    let created = 0;

    for (const spec of DEPARTMENTS) {
        const head = usersByEmail.get(spec.head);
        const memberIds = spec.members.map((email) => usersByEmail.get(email)._id);
        const categoryIds = spec.categories.map((name) => categoriesByName.get(name)._id);

        const department = await Department.create({
            title: spec.title,
            description: spec.description,
            categories: categoryIds,
            headOfDepartment: head._id,
        });

        await DepartmentUser.insertMany(
            memberIds.map((user) => ({
                user,
                department: department._id,
                assignedBy: adminId,
            }))
        );

        spec.categories.forEach((name) => byCategory.set(name, department._id));
        created += 1;
    }

    logger.info(`Created ${created} departments`);
    return byCategory;
};

const seedIncidents = async (usersByEmail, categoriesByName, departmentsByCategory) => {
    let incidentCount = 0;
    let commentCount = 0;

    for (const spec of INCIDENTS) {
        const reporter = usersByEmail.get(spec.reporter);
        const assignee = spec.assignee ? usersByEmail.get(spec.assignee) : null;
        const category = categoriesByName.get(spec.category);

        const createdAt = hoursAgo(spec.ageHours);

        const incident = new Incident({
            title: spec.title,
            description: spec.description,
            category: category._id,
            priority: spec.priority,
            status: spec.status,
            reportedBy: reporter._id,
            assignedTo: assignee ? assignee._id : null,
            // Each seeded agent sits in the department that owns their category.
            department: departmentsByCategory.get(spec.category) || null,
            resolutionNote: spec.resolutionNote || "",
            commentCount: spec.comments.length,
            createdAt,
            updatedAt: createdAt,
        });

        if (spec.resolvedAfterHours !== undefined) {
            incident.resolvedAt = new Date(
                createdAt.getTime() + spec.resolvedAfterHours * 3600000
            );
        }

        if (spec.closedAfterHours !== undefined) {
            incident.closedAt = new Date(
                createdAt.getTime() + spec.closedAfterHours * 3600000
            );
        }

        await incident.save();
        incidentCount += 1;

        // Build a matching audit trail so the activity tab is not empty.
        const activity = [
            {
                incident: incident._id,
                action: ACTIVITY_ACTIONS.CREATED,
                performedBy: reporter._id,
                note: "Incident raised",
                createdAt,
            },
        ];

        if (assignee) {
            activity.push({
                incident: incident._id,
                action: ACTIVITY_ACTIONS.ASSIGNED,
                performedBy: usersByEmail.get("admin@zybisys.com")._id,
                field: "assignedTo",
                oldValue: "Unassigned",
                newValue: assignee.name,
                createdAt: new Date(createdAt.getTime() + 1800000),
            });
        }

        if (spec.status !== STATUS.NEW) {
            activity.push({
                incident: incident._id,
                action: ACTIVITY_ACTIONS.STATUS_CHANGED,
                performedBy: assignee ? assignee._id : reporter._id,
                field: "status",
                oldValue: "New",
                newValue: spec.status,
                createdAt: new Date(createdAt.getTime() + 3600000),
            });
        }

        await ActivityLog.insertMany(activity);

        for (let index = 0; index < spec.comments.length; index += 1) {
            const comment = spec.comments[index];

            await Comment.create({
                incident: incident._id,
                author: usersByEmail.get(comment.author)._id,
                message: comment.message,
                isInternal: Boolean(comment.internal),
                createdAt: new Date(createdAt.getTime() + (index + 1) * 5400000),
            });

            commentCount += 1;
        }
    }

    logger.info(`Created ${incidentCount} incidents and ${commentCount} comments`);
};

/**
 * V4 - Problem Management demo data (FR4). Two Problems: one Known Error with
 * a workaround, a problem-scoped RCA (reusing the existing RCA model) and a
 * couple of linked incidents; one in "New" awaiting investigation. Links are
 * written directly onto the incidents' problemId so the seeded set demos the
 * incident <-> problem navigation.
 */
const seedProblems = async (usersByEmail, categoriesByName) => {
    const admin = usersByEmail.get("admin@zybisys.com");
    const agentRahul = usersByEmail.get("rahul.agent@zybisys.com");
    const agentPriya = usersByEmail.get("priya.agent@zybisys.com");

    const findIncident = (title) => Incident.findOne({ title }).exec();

    // ---- 1. Known Error (FR4-03) --------------------------------
    const knownError = await Problem.create({
        title: "Recurring VPN connectivity failures for the finance team",
        description:
            "Intermittent VPN disconnections across the finance team share the same root cause. Sporadic drops occur roughly every five minutes during peak usage.",
        status: PROBLEM_STATUS.KNOWN_ERROR,
        category: categoriesByName.get("Network")._id,
        ownerId: agentRahul._id,
        workaround:
            "Reconnect with the R77 client and switch the connection profile to the backup concentrator until the firmware is fixed.",
    });

    // Link the two Network incidents to this problem.
    const vpnIncident = await findIncident("VPN disconnects every few minutes for the finance team");
    const wifiIncident = await findIncident("Wi-Fi signal is very weak in the ground floor training room");
    if (vpnIncident) { vpnIncident.problemId = knownError._id; await vpnIncident.save(); }
    if (wifiIncident) { wifiIncident.problemId = knownError._id; await wifiIncident.save(); }

    // Problem-scoped RCA reusing the existing RootCauseAnalysis structure (FR4-06).
    await RootCauseAnalysis.create({
        problem: knownError._id,
        rootCauseCategory: "technology",
        rootCauseDescription:
            "The concentrator firmware load-balances sessions incorrectly under sustained load, causing periodic session resets for any client.",
        why1: "Why were sessions reset?", "why2": "Why did the concentrator mishandle load?",
        why3: "Why was the firmware not optimised?", "why4": "Why was the load path changed?",
        why5: "Why had the peak profile not been load-tested?",
        correctiveActions: "Apply the patched concentrator firmware across all regions.",
        preventiveActions: "Add peak-load simulation to the release checklist for concentrator firmware.",
        status: "approved",
        author: admin._id,
        reviewedBy: admin._id,
    });

    await ActivityLog.insertMany([
        {
            problem: knownError._id,
            action: ACTIVITY_ACTIONS.PROBLEM_CREATED,
            performedBy: admin._id,
            note: "Problem created and assigned to Rahul Verma",
        },
        {
            problem: knownError._id,
            action: ACTIVITY_ACTIONS.PROBLEM_STATUS_CHANGED,
            performedBy: agentRahul._id,
            field: "status",
            oldValue: "New",
            newValue: "Known Error",
        },
        {
            problem: knownError._id,
            action: ACTIVITY_ACTIONS.INCIDENT_PROBLEM_LINKED,
            performedBy: admin._id,
            note: `Linked to ${vpnIncident ? vpnIncident.incidentNumber : "VPN incident"}`,
        },
    ]);

    // ---- 2. New problem awaiting investigation ------------------
    const newProblem = await Problem.create({
        title: "Payroll portal reports intermittently returning 500 errors",
        description:
            "The payroll portal's Monthly Summary report intermittently returns 500 errors under load. Underlying cause is still being investigated.",
        status: PROBLEM_STATUS.NEW,
        category: categoriesByName.get("Application")._id,
        ownerId: agentPriya._id,
        workaround: "",
    });

    const payrollIncident = await findIncident("Payroll portal returns a 500 error on the reports page");
    if (payrollIncident) { payrollIncident.problemId = newProblem._id; await payrollIncident.save(); }

    await ActivityLog.insertMany([
        {
            problem: newProblem._id,
            action: ACTIVITY_ACTIONS.PROBLEM_CREATED,
            performedBy: admin._id,
            note: "Problem created and assigned to Priya Nair",
        },
        {
            problem: newProblem._id,
            action: ACTIVITY_ACTIONS.INCIDENT_PROBLEM_LINKED,
            performedBy: admin._id,
            note: `Linked to ${payrollIncident ? payrollIncident.incidentNumber : "Payroll incident"}`,
        },
    ]);

    logger.info(`Created ${2} problems`);
    return { knownError, newProblem };
};

const run = async () => {
    validateEnv();
    await connectDB();

    if (env.seedResetsData) {
        await clearCollections();
    } else {
        const existing = await User.countDocuments();
        if (existing > 0) {
            logger.warn(
                `SEED_RESET is false and ${existing} users already exist - aborting to avoid duplicates`
            );
            await disconnectDB();
            return;
        }
    }

    const usersByEmail = await seedUsers();
    const admin = usersByEmail.get("admin@zybisys.com");
    const categoriesByName = await seedCategories(admin._id);
    const departmentsByCategory = await seedDepartments(admin._id, usersByEmail, categoriesByName);

    await seedIncidents(usersByEmail, categoriesByName, departmentsByCategory);
    await seedProblems(usersByEmail, categoriesByName);

    // Make sure the indexes declared in the schemas actually exist, so a fresh
    // database behaves like a long-running one.
    await Promise.all([
        User.syncIndexes(),
        Category.syncIndexes(),
        Incident.syncIndexes(),
        Comment.syncIndexes(),
        ActivityLog.syncIndexes(),
        Notification.syncIndexes(),
        Department.syncIndexes(),
        DepartmentUser.syncIndexes(),
        Problem.syncIndexes(),
        RootCauseAnalysis.syncIndexes(),
    ]);

    console.log("\n=========================================================");
    console.log("  Demo data ready. Sign in with any of these accounts:");
    console.log("---------------------------------------------------------");
    USERS.forEach((user) => {
        console.log(`  ${user.role.padEnd(14)} ${user.email.padEnd(30)} ${DEMO_PASSWORD}`);
    });
    console.log("=========================================================\n");

    await disconnectDB();
};

const systemUser = await User.findOneAndUpdate(
  { email: 'rajappanrajappan982@gmail.com' },
  {
    email: 'rajappanrajappan982@gmail.com',
    name: 'Automated Intake',
    role: ROLES.AGENT, // "support_agent" — matches your real ROLES enum
    password: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10), // random, unused login
  },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);
console.log('INTAKE_SYSTEM_USER_ID=', systemUser._id.toString());

run()
    .then(() => process.exit(0))
    .catch(async (error) => {
        logger.error("Seeding failed", error);
        await mongoose.connection.close().catch(() => {});
        process.exit(1);
    });
