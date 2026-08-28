const cron = require("node-cron");

const Incident = require("../models/Incident");
const User = require("../models/User");

const {
    ROLES,
    TERMINAL_STATUSES,
} = require("../constants");

const {
    sendIncidentOverdue,
} = require("../services/emailService");

const logger = require("../utils/logger");

/**
 * Find overdue incidents and notify all
 * admins and support agents.
 */
const processOverdueIncidents = async () => {
    try {
        const now = new Date();

        logger.info("Checking for overdue incidents...");

        // Find incidents:
        // 1. dueBy has passed
        // 2. Incident is not resolved/closed
        // 3. Overdue email has not already been sent
        const overdueIncidents = await Incident.find({
            dueBy: { $ne: null, $lt: now },

            status: {
                $nin: TERMINAL_STATUSES,
            },

            overdueNotifiedAt: null,
        }).lean();

        if (overdueIncidents.length === 0) {
            logger.info("No overdue incidents found.");
            return;
        }

        logger.info(
            `Found ${overdueIncidents.length} overdue incident(s).`
        );

        // Get all admins and support agents
        const recipients = await User.find({
            role: {
                $in: [ROLES.ADMIN, ROLES.AGENT],
            },
            email: {
                $exists: true,
                $ne: "",
            },
        })
            .select("_id name email role")
            .lean();

        if (recipients.length === 0) {
            logger.warn(
                "No admin or support agent users with email addresses found."
            );
            return;
        }

        logger.info(
            `Sending overdue notifications to ${recipients.length} user(s).`
        );

        for (const incident of overdueIncidents) {
            let allEmailsSent = true;

            for (const recipient of recipients) {
                const result = await sendIncidentOverdue({
                    to: recipient.email,
                    incident,
                });

                if (result.skipped) {
                    allEmailsSent = false;

                    logger.warn(
                        `Failed to send overdue email for ${incident.incidentNumber} to ${recipient.email}`
                    );
                }
            }

            // Only mark as notified if all emails were successfully sent
            if (allEmailsSent) {
                await Incident.updateOne(
                    {
                        _id: incident._id,
                        overdueNotifiedAt: null,
                    },
                    {
                        $set: {
                            overdueNotifiedAt: new Date(),
                        },
                    }
                );

                logger.info(
                    `Overdue notification completed for ${incident.incidentNumber}`
                );
            }
        }
    } catch (error) {
        logger.error(
            `Overdue incident cron failed: ${error.message}`
        );
    }
};

/** for my understaning Aravind
 * Run every minute.
 *
 * Cron format:
 * ┌──────────── minute
 * │ ┌────────── hour
 * │ │ ┌──────── day of month
 * │ │ │ ┌────── month
 * │ │ │ │ ┌──── day of week
 * │ │ │ │ │
 * * * * * *
 */
const startOverdueIncidentJob = () => {
    cron.schedule("* * * * *", async () => {
        await processOverdueIncidents();
    });

    logger.info(
        "Overdue incident cron job started. Running every minute."
    );
};

module.exports = {
    startOverdueIncidentJob,
    processOverdueIncidents,
};