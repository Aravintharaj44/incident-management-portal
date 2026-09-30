import client from "./client";
export const vulnerabilityApi = { analyze: (vulnerability) => client.post("/vulnerabilities/analyze", { vulnerability }, { timeout: 90000 }) };