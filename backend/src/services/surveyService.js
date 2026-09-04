const crypto = require("crypto");
const PostResolutionSurvey = require("../models/PostResolutionSurvey");
const logger = require("../utils/logger");

// const createPostResolutionSurvey = async (incident) => {
//     try {
//         if (!incident?.reportedBy) {
//             logger.warn(
//                 `Cannot create survey for ${incident?.incidentNumber || incident?._id}: reporter not found`
//             );
//             return null;
//         }

//         // Prevent duplicate surveys for the same incident.
//         const existingSurvey = await PostResolutionSurvey.findOne({
//             incident: incident._id,
//         });

//         if (existingSurvey) {
//             return existingSurvey;
//         }

//         const token = crypto.randomBytes(32).toString("hex");

//         const survey = await PostResolutionSurvey.create({
//             incident: incident._id,
//             reporterId: incident.reportedBy,
//             token,
//         });

//         return survey;
//     } catch (error) {
//         logger.error(
//             `Failed to create post-resolution survey: ${error.message}`
//         );

//         return null;
//     }
// };
const createPostResolutionSurvey = async (incident) => {
    const existing = await PostResolutionSurvey.findOne({ incident: incident._id });
    if (existing) {
        logger.info(`Survey already exists for ${incident.incidentNumber}, reusing`);
        return existing;
    }

    const survey = await PostResolutionSurvey.create({
        incident: incident._id,
        reporterId: incident.reportedBy,
        token: crypto.randomBytes(24).toString("hex"),
        status: SURVEY_STATUS.PENDING,
        sentAt: new Date(),
    });

    return survey;
};

module.exports = {
    createPostResolutionSurvey,
};