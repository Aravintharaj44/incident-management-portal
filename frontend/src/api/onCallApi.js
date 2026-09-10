import client from "./client"; // Adjust relative path if needed

export const getOnCallCalendar = async (params) => {
    const response = await client.get("/on-call/calendar", { params });
    return response.data;
};

export const createOnCallRoster = async (rosterData) => {
    const response = await client.post("/on-call/roster", rosterData);
    return response.data;
};

export const acknowledgeOnCallIncident = async (incidentId) => {
    const response = await client.post(`/on-call/incidents/${incidentId}/acknowledge`);
    return response.data;
};