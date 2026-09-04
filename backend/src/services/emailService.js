const nodemailer = require("nodemailer");
const { env } = require("../config/env");
const logger = require("../utils/logger");
const { STATUS_LABELS, PRIORITY_LABELS } = require("../constants");

/**
 * Email notifications (FR-09).
 *
 * Email is a *best-effort* side effect: if SMTP is not configured, or a send
 * fails, the incident operation still succeeds and the user still receives the
 * in-app notification. The portal must never fail a status change because a
 * mail server was unreachable.
 */

let transporter = null;

const getTransporter = () => {
    if (!env.mail.enabled) return null;

    if (!transporter) {
        if (!env.mail.host) {
            logger.warn("MAIL_ENABLED is true but SMTP_HOST is not set - email disabled");
            return null;
        }

        transporter = nodemailer.createTransport({
            host: env.mail.host,
            port: env.mail.port,
            secure: env.mail.secure,
            auth: env.mail.user ? { user: env.mail.user, pass: env.mail.pass } : undefined,
            // Prevent an unavailable SMTP server from holding up a notification
            // indefinitely. Email is deliberately a best-effort side effect.
            connectionTimeout: 15000,
            greetingTimeout: 15000,
            socketTimeout: 20000,
        });

        logger.info(`Email transport ready (${env.mail.host}:${env.mail.port})`);
    }

    return transporter;
};

const escapeHtml = (value) =>
    String(value === null || value === undefined ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

/** Shared HTML shell so every notification email looks the same. */
const layout = (heading, rows, bodyText, link) => `
<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f1f1f">
  <h2 style="color:#1677ff;margin:0 0 12px">${escapeHtml(heading)}</h2>
  <p style="margin:0 0 16px;line-height:1.6">${escapeHtml(bodyText)}</p>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    ${rows
        .map(
            ([label, value]) =>
                `<tr><td style="padding:6px 12px 6px 0;color:#8c8c8c;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:500">${escapeHtml(value)}</td></tr>`
        )
        .join("")}
  </table>
  <p style="margin:24px 0 0">
    <a href="${escapeHtml(link)}" style="background:#1677ff;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Open incident</a>
  </p>
  <p style="margin:24px 0 0;font-size:12px;color:#8c8c8c">
    Incident Management Portal - automated message, please do not reply.
  </p>
</div>`;

const incidentLink = (incident) => `${env.clientUrls[0]}/incidents/${incident._id}`;

const send = async ({ to, subject, html }) => {
    const mailer = getTransporter();

    if (!mailer) {
        // Not an error: this is the default configuration for local development.
        logger.debug(`Email suppressed (mail disabled): "${subject}" -> ${to}`);
        return { skipped: true };
    }

    try {
        const info = await mailer.sendMail({ from: env.mail.from, to, subject, html });
        logger.info(`Email sent: "${subject}" -> ${to}`);
        return { skipped: false, messageId: info.messageId };
    } catch (error) {
        logger.error(`Email failed: "${subject}" -> ${to}: ${error.message}`);
        return { skipped: true, error: error.message };
    }
};

const sendIncidentCreated = ({ to, incident, reporter }) =>
    send({
        to,
        subject: `[${incident.incidentNumber}] Incident logged: ${incident.title}`,
        html: layout(
            "A new incident has been logged",
            [
                ["Reference", incident.incidentNumber],
                ["Title", incident.title],
                ["Priority", PRIORITY_LABELS[incident.priority]],
                ["Reported by", reporter ? reporter.name : "Unknown"],
                ["Target resolution", new Date(incident.dueBy).toLocaleString()],
            ],
            "The incident below has been added to the queue.",
            incidentLink(incident)
        ),
    });

const sendIncidentAssigned = ({ to, incident, assignedBy }) =>
    send({
        to,
        subject: `[${incident.incidentNumber}] Assigned to you: ${incident.title}`,
        html: layout(
            "An incident has been assigned to you",
            [
                ["Reference", incident.incidentNumber],
                ["Title", incident.title],
                ["Priority", PRIORITY_LABELS[incident.priority]],
                ["Assigned by", assignedBy ? assignedBy.name : "System"],
                ["Target resolution", new Date(incident.dueBy).toLocaleString()],
            ],
            "You are now the owner of this incident.",
            incidentLink(incident)
        ),
    });

const sendStatusChanged = ({ to, incident, oldStatus, newStatus, changedBy }) =>
    send({
        to,
        subject: `[${incident.incidentNumber}] Status: ${STATUS_LABELS[newStatus]}`,
        html: layout(
            "Incident status updated",
            [
                ["Reference", incident.incidentNumber],
                ["Title", incident.title],
                ["Previous status", STATUS_LABELS[oldStatus] || oldStatus],
                ["New status", STATUS_LABELS[newStatus] || newStatus],
                ["Updated by", changedBy ? changedBy.name : "System"],
            ],
            "The status of the incident below has changed.",
            incidentLink(incident)
        ),
    });

const sendCommentAdded = ({ to, incident, author, message }) =>
    send({
        to,
        subject: `[${incident.incidentNumber}] New comment from ${author ? author.name : "a user"}`,
        html: layout(
            "New comment on an incident",
            [
                ["Reference", incident.incidentNumber],
                ["Title", incident.title],
                ["From", author ? author.name : "Unknown"],
                ["Comment", message.length > 300 ? `${message.slice(0, 300)}...` : message],
            ],
            "Someone commented on an incident you are following.",
            incidentLink(incident)
        ),
    });

const sendIncidentOverdue = ({ to, incident }) =>
    send({
        to,
        subject: `[${incident.incidentNumber}] OVERDUE: ${incident.title}`,
        html: layout(
            "Incident is overdue",
            [
                ["Reference", incident.incidentNumber],
                ["Title", incident.title],
                ["Priority", PRIORITY_LABELS[incident.priority]],
                ["Status", STATUS_LABELS[incident.status] || incident.status],
                ["Target resolution", new Date(incident.dueBy).toLocaleString()],
            ],
            "The incident below has passed its SLA target and requires immediate attention.",
            incidentLink(incident)
        ),
    });

/** Lets the health endpoint report whether SMTP settings actually work. */
const verifyConnection = async () => {
    const mailer = getTransporter();
    if (!mailer) return { enabled: false };

    try {
        await mailer.verify();
        return { enabled: true, ok: true };
    } catch (error) {
        return { enabled: true, ok: false, error: error.message };
    }
};

/** Shared shell for RCA Action Item emails (FR4-08). */
const actionItemLayout = (heading, rows, bodyText, link) => `
<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f1f1f">
  <h2 style="color:#1677ff;margin:0 0 12px">${escapeHtml(heading)}</h2>
  <p style="margin:0 0 16px;line-height:1.6">${escapeHtml(bodyText)}</p>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    ${rows
        .map(
            ([label, value]) =>
                `<tr><td style="padding:6px 12px 6px 0;color:#8c8c8c;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:500">${escapeHtml(value)}</td></tr>`
        )
        .join("")}
  </table>
  <p style="margin:24px 0 0">
    <a href="${escapeHtml(link)}" style="background:#1677ff;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Open action item</a>
  </p>
  <p style="margin:24px 0 0;font-size:12px;color:#8c8c8c">
    Incident Management Portal - automated message, please do not reply.
  </p>
</div>`;

/**
 * The RCA an action item hangs off is either incident- or problem-scoped; build
 * the appropriate client URL so the notification lands somewhere useful.
 */
const actionItemLink = (rca) => {
    const base = env.clientUrls[0];
    if (rca && rca.incident) return `${base}/incidents/${rca.incident}`;
    if (rca && rca.problem) return `${base}/problems/${rca.problem}`;
    return `${base}/dashboard`;
};

const sendActionItemAssigned = ({ to, actionItem, owner, assignedBy }) =>
    send({
        to,
        subject: "Action item assigned to you",
        html: actionItemLayout(
            "An action item has been assigned to you",
            [
                ["Description", actionItem.description],
                ["Due date", new Date(actionItem.dueDate).toLocaleString()],
                ["Status", (actionItem.status || "").replace("_", " ")],
                ["Assigned by", assignedBy ? assignedBy.name : "System"],
            ],
            `You have been assigned an action item with a due date of ${new Date(actionItem.dueDate).toLocaleString()}.`,
            actionItemLink(actionItem.rca)
        ),
    });

const sendActionItemDueSoon = ({ to, actionItem }) =>
    send({
        to,
        subject: "Action item due soon",
        html: actionItemLayout(
            "Your action item is due soon",
            [
                ["Description", actionItem.description],
                ["Due date", new Date(actionItem.dueDate).toLocaleString()],
                ["Status", (actionItem.status || "").replace("_", " ")],
            ],
            "An action item assigned to you is approaching its due date.",
            actionItemLink(actionItem.rca)
        ),
    });

const sendActionItemOverdue = ({ to, actionItem }) =>
    send({
        to,
        subject: "Action item is OVERDUE",
        html: actionItemLayout(
            "Your action item is overdue",
            [
                ["Description", actionItem.description],
                ["Due date", new Date(actionItem.dueDate).toLocaleString()],
                ["Status", "Overdue"],
            ],
            "An action item assigned to you has passed its due date and is still unresolved. Please take action.",
            actionItemLink(actionItem.rca)
        ),
    });
const surveyLink = (token) =>
    `${env.clientUrls[0]}/survey/${token}`;

const sendPostResolutionSurvey = ({ to, incident, token }) =>
    send({
        to,
        subject: `[${incident.incidentNumber}] How was your support experience?`,
        html: `
<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f1f1f">

    <h2 style="color:#1677ff;margin:0 0 12px">
        How was your support experience?
    </h2>

    <p style="line-height:1.6">
        Your incident <strong>${escapeHtml(incident.incidentNumber)}</strong>
        has been resolved/closed.
    </p>

    <p style="line-height:1.6">
        Please take a moment to rate your support experience.
        Your feedback helps us improve our service.
    </p>

    <p style="margin:24px 0">
        <a
            href="${escapeHtml(surveyLink(token))}"
            style="
                background:#1677ff;
                color:#fff;
                padding:10px 18px;
                border-radius:6px;
                text-decoration:none;
                display:inline-block;
            "
        >
            Give Feedback
        </a>
    </p>

    <p style="font-size:12px;color:#8c8c8c">
        Incident Management Portal - automated message.
    </p>

</div>
    `,
    });

module.exports = {
    send,
    sendIncidentCreated,
    sendIncidentAssigned,
    sendStatusChanged,
    sendCommentAdded,
    verifyConnection,
    sendIncidentOverdue,
    sendActionItemAssigned,
    sendActionItemDueSoon,
    sendActionItemOverdue,
    sendPostResolutionSurvey
};
