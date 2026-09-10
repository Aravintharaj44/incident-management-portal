import client from "./client";

/**
 * intakeApi
 * FR4-20 — talks to backend/src/routes/intakeRoutes.js
 *
 * Same shape as the other api/*.js files (incidentApi, categoryApi, etc):
 * an object of methods, each resolving to the parsed JSON body
 * ({ success, message, data }) — matching how components already do
 * `response.data.items` after calling e.g. incidentApi.list(...).
 */
export const intakeApi = {
    list: (params = {}) => {
        const queryParams = { ...params };

        // Transform frontend 'Failed' filter to match database 'Flagged' enum
        if (queryParams.status && queryParams.status.toLowerCase() === "failed") {
            queryParams.status = "Flagged";
        }

        return client.get("/intake/failures", { params: queryParams }).then((res) => res.data);
    },

    get: (id) => client.get(`/intake/failures/${id}`).then((res) => res.data),

    resolve: (id, resolvedIncidentId) =>
        client
            .patch(`/intake/failures/${id}/resolve`, { resolvedIncidentId })
            .then((res) => res.data),

    dismiss: (id) => client.patch(`/intake/failures/${id}/dismiss`).then((res) => res.data),
};