const SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

const escapeRegex = (value) =>
    String(value === null || value === undefined ? "" : value).replace(
        SPECIAL_CHARS,
        "\\$&"
    );
const containsPattern = (value) => new RegExp(escapeRegex(String(value).trim()), "i");

module.exports = escapeRegex;
module.exports.escapeRegex = escapeRegex;
module.exports.containsPattern = containsPattern;