const cron = require("node-cron");

const ActionItem = require("../models/ActionItem");
const {
    ACTION_ITEM_STATUS,
} = require("../constants");
const notificationService = require("../services/notificationService");

const logger = require("../utils/logger");

const DUE_SOON_HOURS = 24;

/**
 * V4 - RCA Action Item scheduler (FR4-08).
 *
 * Reuses the existing node-cron architecture (see overdueIncidentJob.js). The
 * job is safe to run repeatedly: notification timestamps are only stamped when
 * the fan-out to the owner's in-app + email succeeds, so a crashed run does not
 * lose the notification and a successful run cannot duplicate it.
 *
 * 1. Any Open/In Progress item whose dueDate has passed is moved to Overdue.
 *    Done items are never touched, and an item that is Done never becomes
 *    Overdue regardless of its due date.
 * 2. Owners receive an in-app + email reminder when an item is still open and
 *    its due date is within the DUE_SOON_HOURS window (once per item).
 * 3. Owners receive an in-app + email reminder once an item has gone Overdue
 *    (once per item).
 */

/** Fans out one reminder; returns true when the owner was notified. */
const remindOwner = async (actionItem, kind) => {
    if (!actionItem.ownerId) return true;

    if (kind === "dueSoon") {
        return notificationService.notifyActionItemDueSoon({ actionItem, owner: actionItem.ownerId });
    }
    return notificationService.notifyActionItemOverdue({ actionItem, owner: actionItem.ownerId });
};

const processOverdueActionItems = async () => {
    try {
        const now = new Date();

        logger.info("Checking for overdue action items...");

        // 1. Roll Open / In Progress items past their due date into Overdue.
        await ActionItem.updateMany(
            {
                status: { $in: [ACTION_ITEM_STATUS.OPEN, ACTION_ITEM_STATUS.IN_PROGRESS] },
                dueDate: { $ne: null, $lt: now },
            },
            { $set: { status: ACTION_ITEM_STATUS.OVERDUE } }
        );

        // 2. Send one-shot due-soon reminders to the owners of items that are
        //    still open and within the reminder window.
        const dueSoonWindowEnd = new Date(now.getTime() + DUE_SOON_HOURS * 3600000);
        const dueSoonItems = await ActionItem.find({
            status: { $in: [ACTION_ITEM_STATUS.OPEN, ACTION_ITEM_STATUS.IN_PROGRESS] },
            dueDate: { $ne: null, $gt: now, $lte: dueSoonWindowEnd },
            dueSoonNotifiedAt: null,
        })
            .populate("rcaId", "incident problem status")
            .lean();

        for (const item of dueSoonItems) {
            const sent = await remindOwner(item, "dueSoon");
            if (sent) {
                await ActionItem.updateOne(
                    { _id: item._id, dueSoonNotifiedAt: null },
                    { $set: { dueSoonNotifiedAt: now } }
                );
            }
        }

        // 3. Send one-shot overdue reminders. Items moved to Overdue in step 1
        //    are picked up here, provided their owner exists and is active.
        const overdueItems = await ActionItem.find({
            status: ACTION_ITEM_STATUS.OVERDUE,
            dueDate: { $ne: null, $lt: now },
            overdueNotifiedAt: null,
        })
            .populate("rcaId", "incident problem status")
            .lean();

        for (const item of overdueItems) {
            const sent = await remindOwner(item, "overdue");
            if (sent) {
                await ActionItem.updateOne(
                    { _id: item._id, overdueNotifiedAt: null },
                    { $set: { overdueNotifiedAt: now } }
                );
            }
        }

        logger.info(
            `Action item check complete (${dueSoonItems.length} due soon, ${overdueItems.length} overdue).`
        );
    } catch (error) {
        logger.error(`Overdue action item cron failed: ${error.message}`);
    }
};

/**
 * Runs every minute, matching the existing incident overdue job. Kept as a
 * standalone exported function so tests can exercise it directly.
 */
const startOverdueActionItemJob = () => {
    cron.schedule("* * * * *", async () => {
        await processOverdueActionItems();
    });

    logger.info("Overdue action item cron job started. Running every minute.");
};

module.exports = {
    startOverdueActionItemJob,
    processOverdueActionItems,
};