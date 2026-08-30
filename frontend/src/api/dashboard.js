import client from "./client";

/** Dashboard aggregations (FR-11). */
export const dashboardApi = {
    summary: () => client.get("/dashboard/summary"),

    charts: (days = 30) => client.get("/dashboard/charts", { params: { days } }),

    recent: (limit = 5) => client.get("/dashboard/recent", { params: { limit } }),

    advanced: (params = {}) => client.get("/dashboard/advanced", { params }),

    /** Admin only. */
    workload: () => client.get("/dashboard/workload"),
};
