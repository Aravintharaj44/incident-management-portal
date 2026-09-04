const crypto = require("crypto");
const PostResolutionSurvey = require("../models/PostResolutionSurvey");
const logger = require("../utils/logger");
const { SURVEY_STATUS } = require("../constants");

const createPostResolutionSurvey = async (incident) => {
    try {
        if (!incident?.reportedBy) {
            logger.warn(
                `Cannot create survey for ${
                    incident?.incidentNumber || incident?._id
                }: reporter not found`
            );

            return null;
        }

        if (!incident?.category) {
            logger.warn(
                `Cannot create survey for ${
                    incident?.incidentNumber || incident?._id
                }: category not found`
            );

            return null;
        }

        // Prevent duplicate surveys for the same incident.
        const existing = await PostResolutionSurvey.findOne({
            incident: incident._id,
        });

        if (existing) {
            logger.info(
                `Survey already exists for ${incident.incidentNumber}, reusing`
            );

            return existing;
        }

        const survey = await PostResolutionSurvey.create({
            incident: incident._id,

            reporterId: incident.reportedBy,

            // Snapshot the resolution context
            agentId: incident.assignedTo || null,
            departmentId: incident.department || incident.assignedDepartment || null,
            categoryId: incident.category,

            token: crypto.randomBytes(32).toString("hex"),

            status: SURVEY_STATUS.PENDING,

            sentAt: new Date(),
        });

        logger.info(
            `Post-resolution survey created for ${incident.incidentNumber}`
        );

        return survey;
    } catch (error) {
        logger.error(
            `Failed to create post-resolution survey: ${error.message}`
        );

        return null;
    }
};

module.exports = {
    createPostResolutionSurvey,
};