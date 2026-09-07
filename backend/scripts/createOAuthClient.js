require("dotenv").config();

const { connectDB, disconnectDB } = require("../src/config/db");
const { env, validateEnv } = require("../src/config/env");
const User = require("../src/models/User");
const OAuthClient = require("../src/models/OAuthClient");
const {
    generateClientId,
    generateClientSecret,
} = require("../src/services/oauthService");
const { ROLES, ROLE_VALUES } = require("../src/constants");

const args = process.argv.slice(2);

const readArg = (name) => {
    const index = args.indexOf(`--${name}`);
    return index !== -1 && args[index + 1] ? args[index + 1] : null;
};

const name = readArg("name");
let role = readArg("role") || ROLES.AGENT;

if (!name) {
    console.error("Usage: npm run oauth:create-client -- --name \"Client Name\" [--role support_agent|admin]");
    process.exit(1);
}

if (!ROLE_VALUES.includes(role)) {
    console.error(`Invalid role "${role}". Allowed: ${ROLE_VALUES.join(", ")}`);
    process.exit(1);
}

if (role === ROLES.USER) {
    console.error("An OAuth client must map to a service account with staff privileges (support_agent or admin).");
    process.exit(1);
}

const run = async () => {
    validateEnv();
    await connectDB();

    let serviceAccount = await User.findOne({ role: { $in: [ROLES.ADMIN, ROLES.AGENT] }, isActive: true })
        .sort({ createdAt: 1 })
        .exec();

    if (!serviceAccount) {
        serviceAccount = await User.create({
            name: "System Integration",
            email: `integration-${generateClientId().slice(0, 8).toLowerCase()}@zybisys.com`,
            password: generateClientSecret(),
            role: ROLES.AGENT,
        });
    }

    const clientId = generateClientId();
    const clientSecret = generateClientSecret();

    await OAuthClient.create({
        clientId,
        clientSecretHash: clientSecret, // hashed by the model's pre-save hook
        name,
        user: serviceAccount._id,
        grantTypes: ["client_credentials"],
        isActive: true,
    });

    console.log("\n=========================================================");
    console.log("  OAuth client created");
    console.log("---------------------------------------------------------");
    console.log(`  name        : ${name}`);
    console.log(`  client_id   : ${clientId}`);
    console.log(`  service user: ${serviceAccount.email} (${serviceAccount.role})`);
    console.log("  client_secret (shown once, do not share or commit):");
    console.log(`  ${clientSecret}`);
    console.log("\n  Call POST /api/v1/oauth/token with grant_type=client_credentials");
    console.log("  and the client_id/client_secret via HTTP Basic or the form body.");
    console.log("=========================================================\n");

    await disconnectDB();
};

run().catch((error) => {
    console.error("Failed to create OAuth client:", error.message);
    process.exit(1);
});