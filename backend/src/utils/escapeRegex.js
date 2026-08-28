/**
 * Escapes every character that has special meaning inside a RegExp.
 *
 * Every keyword search in this API builds a RegExp from user input. Without
 * escaping, a search for "c++" or "(" would either throw or - worse - let a
 * caller inject an expensive pattern and stall the event loop.
 */
const SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

const escapeRegex = (value) =>
    String(value === null || value === undefined ? "" : value).replace(
        SPECIAL_CHARS,
        "\\$&"
    );

/** Convenience wrapper: a case-insensitive "contains" matcher. */
const containsPattern = (value) => new RegExp(escapeRegex(String(value).trim()), "i");

module.exports = escapeRegex;
module.exports.escapeRegex = escapeRegex;
module.exports.containsPattern = containsPattern;
