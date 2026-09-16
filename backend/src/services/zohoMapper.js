/**
 * Zoho People returns each employee wrapped like:
 *   { "355152000000308581": [ { EmailID, FirstName, LastName, ... } ] }
 * inside response.result - an array of these single-key wrapper objects.
 *
 * flattenRawResult() strips that wrapper so callers just get a plain array
 * of raw Zoho employee objects.
 */
const flattenRawResult = (result = []) => {
    return result.map((wrapper) => {
        const [, records] = Object.entries(wrapper)[0];
        return records[0];
    });
};

/**
 * "Active" employees can still have Employeestatus "Active" on the day they
 * exit if Dateofexit was just set and the status hasn't been changed yet, so
 * both signals are checked. Anything else (On Hold, Terminated, Relieved,
 * or an exit date present) is treated as not currently employed.
 */
const isCurrentlyActive = (raw) => {
    return raw.Employeestatus === "Active" && !raw.Dateofexit;
};

/**
 * The single source of truth for "what a Zoho employee record means to our
 * app". Takes one raw Zoho object (already flattened) and returns a plain,
 * normalised shape that lines up with what User.js and DepartmentUser.js
 * need - nothing downstream needs to know Zoho's field names.
 *
 * Returns null for records that can't be synced at all (no email), so the
 * caller can skip them with a clear reason instead of half-creating a user.
 */
const mapEmployeeToUser = (raw) => {
    if (!raw || !raw.EmailID) {
        return null;
    }

    const name = [raw.FirstName, raw.LastName]
        .filter((part) => part && String(part).trim())
        .join(" ")
        .trim();

    return {
        // Stable identifier from Zoho, kept around for logging even though
        // we currently match on email (see zohoSyncService.js).
        sourceId: String(raw.Zoho_ID || raw.EmployeeID || ""),
        email: String(raw.EmailID).toLowerCase().trim(),
        // Falls back to the email's local part if both name fields are blank,
        // so User.name (required) is never left empty.
        name: name || raw.EmailID.split("@")[0],
        department: raw.Department || null,
        // Zoho's own unique ID for the department itself (distinct from the
        // department *name*, which can be renamed). Comes through as a
        // literal "Department.ID" key in the raw record. Used as the
        // primary match key when resolving/creating departments — see
        // resolveDepartment() in zohoSyncService.js.
        departmentZohoId: raw["Department.ID"] ? String(raw["Department.ID"]) : null,
        designation: raw.Designation || null,
        isActive: isCurrentlyActive(raw),
    };
};

/**
 * Convenience: raw Zoho API response -> array of normalised employee objects,
 * skipping (and reporting) any record with no usable email.
 */
const mapEmployees = (apiResponseResult = []) => {
    const flattened = flattenRawResult(apiResponseResult);
    const mapped = [];
    const skipped = [];

    flattened.forEach((raw) => {
        const employee = mapEmployeeToUser(raw);
        if (employee) {
            mapped.push(employee);
        } else {
            skipped.push({ zohoId: raw.Zoho_ID, reason: "No EmailID" });
        }
    });

    return { employees: mapped, skipped };
};

module.exports = { mapEmployees, mapEmployeeToUser, isCurrentlyActive };