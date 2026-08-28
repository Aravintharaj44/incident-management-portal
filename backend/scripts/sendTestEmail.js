require("dotenv").config();

const { isEmail } = require("validator");
const emailService = require("../src/services/emailService");

const recipient = process.argv[2];

if (!recipient || !isEmail(recipient)) {
    console.error("Usage: npm run mail:test -- recipient@example.com");
    process.exit(1);
}

const run = async () => {
    const verification = await emailService.verifyConnection();

    if (!verification.ok) {
        console.error("SMTP verification failed:", verification.error || "email is disabled");
        process.exitCode = 1;
        return;
    }

    const result = await emailService.send({
        to: recipient,
        subject: "Incident Management Portal - email configuration test",
        html: `
            <p>This is a test email from the Incident Management Portal.</p>
            <p>Gmail SMTP is configured correctly if you received this message.</p>
        `,
    });

    if (result.skipped) {
        console.error("Test email was not sent:", result.error || "email is disabled");
        process.exitCode = 1;
        return;
    }

    console.log(`Test email sent to ${recipient}. Message ID: ${result.messageId}`);
};

run().catch((error) => {
    console.error("Test email failed:", error.message);
    process.exit(1);
});
