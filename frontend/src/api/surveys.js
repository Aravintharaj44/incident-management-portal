import publicClient from "./publicClient";
import client from "./client";

export const surveyApi = {
    get: (token) => publicClient.get(`/surveys/${token}`),
    submit: (token, payload) =>
        publicClient.post(`/surveys/${token}`, payload),
};

/** Staff-only dashboard widget data (FR4-26..29). */
export const csatDashboardApi = {
    summary: () => client.get('/surveys/csat'),
    trend: (days = 30) => client.get('/surveys/csat/trend', { params: { days } }),
};
