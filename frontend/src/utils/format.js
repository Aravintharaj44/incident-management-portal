import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

/** Formatting helpers shared by every screen, so dates look the same throughout. */

export const formatDate = (value) => (value ? dayjs(value).format("DD MMM YYYY") : "-");

export const formatDateTime = (value) =>
    value ? dayjs(value).format("DD MMM YYYY, HH:mm") : "-";

/** "3 hours ago" - used in timelines and comment threads. */
export const fromNow = (value) => (value ? dayjs(value).fromNow() : "-");

/**
 * Human-readable time until (or since) an SLA deadline.
 * Returns "Overdue by 2h" once the target has passed.
 */
export const formatDueBy = (dueBy, isOverdue) => {
    if (!dueBy) return "-";

    const target = dayjs(dueBy);
    const diffHours = target.diff(dayjs(), "hour");

    if (isOverdue || diffHours < 0) {
        const overdueBy = Math.abs(diffHours);
        return overdueBy >= 24
            ? `Overdue by ${Math.floor(overdueBy / 24)}d`
            : `Overdue by ${overdueBy}h`;
    }

    if (diffHours >= 24) return `Due in ${Math.floor(diffHours / 24)}d`;
    if (diffHours >= 1) return `Due in ${diffHours}h`;

    return `Due in ${target.diff(dayjs(), "minute")}m`;
};

export const formatFileSize = (bytes) => {
    if (!bytes) return "0 B";

    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const size = bytes / 1024 ** index;

    return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

/** Initials for an avatar, e.g. "Priya Nair" -> "PN". */
export const initials = (name) => {
    if (!name) return "?";

    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join("");
};

/** A stable avatar colour derived from the name, so a user looks consistent. */
const AVATAR_COLORS = [
    "#1677ff",
    "#52c41a",
    "#fa8c16",
    "#eb2f96",
    "#722ed1",
    "#13c2c2",
    "#f5222d",
];

export const avatarColor = (name = "") => {
    const sum = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
    return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};

export const truncate = (text, length = 80) => {
    if (!text) return "";
    return text.length > length ? `${text.slice(0, length)}...` : text;
};
