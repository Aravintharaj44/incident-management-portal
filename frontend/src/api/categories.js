import client from "./client";

/** Category master list (FR-04, FR-13). */
export const categoryApi = {
    list: (includeInactive = false) =>
        client.get("/categories", { params: includeInactive ? { includeInactive: true } : {} }),

    withCounts: () => client.get("/categories/with-counts"),

    create: (payload) => client.post("/categories", payload),

    update: (id, payload) => client.patch(`/categories/${id}`, payload),

    remove: (id) => client.delete(`/categories/${id}`),
};
