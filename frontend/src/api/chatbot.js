import client from "./client";
export const chatbotApi = { sendMessage: (payload) => client.post("/chatbot/message", payload) };
