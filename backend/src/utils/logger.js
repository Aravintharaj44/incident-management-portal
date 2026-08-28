/**
 * Tiny structured logger.
 *
 * V1 deliberately avoids pulling in Winston (that is a V2 item), but every log
 * call already goes through one module with a consistent shape - so swapping
 * the implementation later is a one-file change rather than a hunt for stray
 * console.log calls.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const currentLevel =
    LEVELS[process.env.LOG_LEVEL] !== undefined
        ? LEVELS[process.env.LOG_LEVEL]
        : process.env.NODE_ENV === "test"
          ? LEVELS.error
          : LEVELS.info;

const write = (level, message, meta) => {
    if (LEVELS[level] > currentLevel) return;

    const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;

    if (meta === undefined) {
        console[level === "debug" ? "log" : level](line);
    } else {
        console[level === "debug" ? "log" : level](line, meta);
    }
};

module.exports = {
    error: (message, meta) => write("error", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    info: (message, meta) => write("info", message, meta),
    debug: (message, meta) => write("debug", message, meta),

    /** Audit-style event log: login, incident created, status changed, ... */
    event: (name, payload) => write("info", `event=${name}`, payload),
};
