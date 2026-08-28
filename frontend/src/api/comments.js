import client from "./client";

/** Comments live under their incident (FR-07). */
export const commentApi = {
    list: (incidentId) => client.get(`/incidents/${incidentId}/comments`),

    add: (incidentId, payload) =>
        client.post(`/incidents/${incidentId}/comments`, payload),

    update: (commentId, message) => client.patch(`/comments/${commentId}`, { message }),

    remove: (commentId) => client.delete(`/comments/${commentId}`),
};
