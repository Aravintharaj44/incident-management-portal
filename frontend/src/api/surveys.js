import publicClient from "./publicClient";

export const surveyApi = {
    get: (token) => publicClient.get(`/surveys/${token}`),

    submit: (token, payload) =>
        publicClient.post(`/surveys/${token}`, payload),
};