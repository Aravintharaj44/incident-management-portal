import client from "./client";
export const chatbotApi = { sendMessage: (payload) => payload.form ? client.post("/chatbot/message", payload.form, { headers: { "Content-Type": "multipart/form-data" } }) : client.post("/chatbot/message", payload) };
