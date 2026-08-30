import client from "./client";

export const departmentApi = {
    list: () => client.get("/departments"),
    get: (id) => client.get(`/departments/${id}`),
    create: (payload) => client.post("/departments", payload),
    update: (id, payload) => client.patch(`/departments/${id}`, payload),
    remove: (id) => client.delete(`/departments/${id}`),
};
