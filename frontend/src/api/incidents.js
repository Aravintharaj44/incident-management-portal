import client, { getStoredToken } from "./client";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1";

/**
 * Drops empty filter values so the URL carries only what is actually set.
 * Array values are sent comma-separated, which is what the API expects.
 */
const cleanParams = (params = {}) =>
    Object.entries(params).reduce((acc, [key, value]) => {
        if (value === undefined || value === null || value === "") return acc;
        if (Array.isArray(value)) {
            if (!value.length) return acc;
            acc[key] = value.join(",");
            return acc;
        }
        acc[key] = value;
        return acc;
    }, {});

export const incidentApi = {
    list: (params) => client.get("/incidents", { params: cleanParams(params) }),

    get: (id) => client.get(`/incidents/${id}`),

    create: (payload) => client.post("/incidents", payload),

    update: (id, payload) => client.patch(`/incidents/${id}`, payload),

    updateStatus: (id, payload) => client.patch(`/incidents/${id}/status`, payload),

    assign: (id, assignedTo) => client.patch(`/incidents/${id}/assign`, { assignedTo }),

    listLinks: (id) => client.get(`/incidents/${id}/links`),

    createLink: (id, payload) => client.post(`/incidents/${id}/links`, payload),

    removeLink: (id, linkId) => client.delete(`/incidents/${id}/links/${linkId}`),

    remove: (id) => client.delete(`/incidents/${id}`),

    /**
     * CSV export (FR-12).
     *
     * Downloads through fetch rather than a plain link so the Authorization
     * header can be sent, then hands the browser a temporary object URL.
     */ 
    exportCsv: async (params) => {
        const query = new URLSearchParams(cleanParams(params)).toString();

        const response = await fetch(`${BASE_URL}/incidents/export/csv?${query}`, {
            headers: { Authorization: `Bearer ${getStoredToken()}` },
        });

        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.message || "Export failed");
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = `incidents-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();

        // Release the object URL, or the blob stays in memory for the session.
        link.remove();
        URL.revokeObjectURL(url);
    },
};
