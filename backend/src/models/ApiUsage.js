const mongoose = require("mongoose");

/**
 * FR5-09 - Daily API usage tracking for the public OAuth REST API.
 *
 * Each document represents one OAuth client's usage on a single UTC calendar
 * day. The compound unique index on (clientId, date) prevents duplicate records
 * and enables atomic upserts via findOneAndUpdate, so concurrent requests
 * cannot bypass the daily credit limit.
 *
 * Old documents naturally belong to previous days - no cron or cleanup is
 * needed. Daily usage resets automatically because a new UTC day produces a
 * new date key.
 */
const apiUsageSchema = new mongoose.Schema(
    {
        clientId: {
            type: String,
            required: [true, "clientId is required"],
            index: true,
        },

        /**
         * UTC calendar day in "YYYY-MM-DD" format. Each (clientId, date)
         * pair is unique, so one document per client per day.
         */
        date: {
            type: String,
            required: [true, "date is required"],
        },

        /**
         * Number of API credits consumed on this day by this client.
         * Incremented atomically via $inc in findOneAndUpdate.
         */
        count: {
            type: Number,
            default: 0,
            min: [0, "count cannot be negative"],
        },
    },
    {
        timestamps: false,
    }
);

apiUsageSchema.index({ clientId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("ApiUsage", apiUsageSchema);
