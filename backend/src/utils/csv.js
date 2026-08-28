const { Parser } = require("json2csv");

/**
 * Serialises an array of flat objects to a CSV string (FR-12).
 *
 * `fields` is a list of { label, value } pairs so the exported column headers
 * are human-readable rather than raw database field names.
 */
const toCsv = (rows, fields) => {
    // json2csv throws on an empty data set, so emit a header-only file instead.
    if (!rows.length) {
        return `${fields.map((field) => `"${field.label}"`).join(",")}\n`;
    }

    const parser = new Parser({ fields, withBOM: true });
    return parser.parse(rows);
};

/** Sets the headers that make a browser download the response as a file. */
const sendCsv = (res, filename, csv) => {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    // Lets the browser read the filename when the response is fetched via XHR.
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    return res.status(200).send(csv);
};

module.exports = { toCsv, sendCsv };
