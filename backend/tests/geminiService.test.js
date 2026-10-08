const test = require("node:test");
const assert = require("node:assert/strict");
const { createGeminiClassifier } = require("../src/services/geminiService");

const classify = async (payload) => {
    const client = { models: { generateContent: async () => ({ text: JSON.stringify(payload) }) } };
    return createGeminiClassifier({ client, model: "test-model", nodeEnv: "test" });
};

test("Gemini classification accepts only the configured structured intents", async () => {
    const scenarios = [
        ["hi", { intent: "GREETING", categoryHint: null, incidentNumber: null, description: null, query: null }, "GREETING"],
        ["I want to create an incident", { intent: "CREATE_INCIDENT", categoryHint: null, incidentNumber: null, description: "I want to create an incident", query: null }, "CREATE_INCIDENT"],
        ["My network is not working", { intent: "CREATE_INCIDENT", categoryHint: "Network", incidentNumber: null, description: "My network is not working", query: null }, "CREATE_INCIDENT"],
        ["show my incidents", { intent: "LIST_MY_INCIDENTS", categoryHint: null, incidentNumber: null, description: null, query: null }, "LIST_MY_INCIDENTS"],
        ["status of INC-123456", { intent: "GET_MY_INCIDENT", categoryHint: null, incidentNumber: "inc-123456", description: null, query: null }, "GET_MY_INCIDENT"],
    ];
    for (const [, response, intent] of scenarios) {
        const classifier = await classify(response);
        const actual = await classifier("test message");
        assert.equal(actual.intent, intent);
    }
});

test("Gemini failure and invalid intents have safe null fallbacks", async () => {
    const failing = createGeminiClassifier({ client: { models: { generateContent: async () => { throw new Error("unavailable"); } } }, model: "test-model", nodeEnv: "test" });
    assert.equal(await failing("hi"), null);
    const invalid = await classify({ intent: "GET_ALL_USERS", categoryHint: null, incidentNumber: null, description: null, query: null });
    assert.equal(await invalid("show all users"), null);
});

test("Gemini prompt never receives a user identity or database authority", async () => {
    let request;
    const client = { models: { generateContent: async (value) => { request = value; return { text: JSON.stringify({ intent: "GREETING", categoryHint: null, incidentNumber: null, description: null, query: null }) }; } } };
    const classifier = createGeminiClassifier({ client, model: "test-model", nodeEnv: "test" });
    await classifier("hello");
    assert.equal(request.contents.includes("userId"), false);
    assert.match(request.contents, /never access data/i);
});
