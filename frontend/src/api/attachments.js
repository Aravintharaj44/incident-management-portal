import client, { getStoredToken } from "./client";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1";

/** Attachments (FR-08). */
export const attachmentApi = {
    list: (incidentId) => client.get(`/incidents/${incidentId}/attachments`),

    upload: (incidentId, files, onProgress) => {
        const form = new FormData();
        files.forEach((file) => form.append("files", file));

        return client.post(`/incidents/${incidentId}/attachments`, form, {
            // Let the browser set the multipart boundary itself.
            headers: { "Content-Type": undefined },
            onUploadProgress: (event) => {
                if (onProgress && event.total) {
                    onProgress(Math.round((event.loaded / event.total) * 100));
                }
            },
        });
    },

    remove: (attachmentId) => client.delete(`/attachments/${attachmentId}`),

    /**
     * Downloads are authenticated, so the token travels as a query parameter -
     * a plain <a href> cannot set an Authorization header.
     */
    downloadUrl: (attachmentId) =>
        `${BASE_URL}/attachments/${attachmentId}/download?token=${getStoredToken()}`,
};
