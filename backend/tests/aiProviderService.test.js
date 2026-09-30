const test = require("node:test");
const assert = require("node:assert/strict");
const { AiProviderService, CodeCraftProvider } = require("../src/services/aiProviderService");

const ok = (provider, result = "ok") => ({ success: true, provider, model: "test", result });
const retry = (code) => ({ success: false, provider: "gemini", retryable: true, errorCode: String(code) });

test("Gemini retryable errors fall back to CodeCraft", async () => {
  for (const code of [429, "ETIMEDOUT", 503]) {
    let calls = 0;
    const service = new AiProviderService({ gemini: { complete: async () => retry(code) }, codecraft: { complete: async () => { calls += 1; return ok("codecraft"); } }, cooldownSeconds: 1, failureThreshold: 2 });
    assert.equal((await service.complete({ operation: "intent-classification", prompt: "hi" })).provider, "codecraft");
    assert.equal(calls, 1);
  }
});
test("Gemini authentication failures do not fall back", async () => {
  let fallback = false;
  const service = new AiProviderService({ gemini: { complete: async () => ({ success: false, provider: "gemini", retryable: false, errorCode: "401" }) }, codecraft: { complete: async () => { fallback = true; return ok("codecraft"); } } });
  const result = await service.complete({ operation: "intent-classification", prompt: "hi" });
  assert.equal(result.provider, "gemini"); assert.equal(fallback, false);
});
test("CodeCraft image requests require explicit endpoint image support", async () => {
  const provider = new CodeCraftProvider({ apiKey: "key", model: "claude-sonnet-5", baseURL: "https://example.test/v1", supportsImages: false });
  const result = await provider.complete({ operation: "image-analysis", prompt: "describe", image: { mimeType: "image/png", buffer: Buffer.from("png") } });
  assert.equal(result.errorCode, "IMAGE_UNSUPPORTED");
});
test("CodeCraft uses the repository's OpenAI-compatible chat API", async () => {
  let request;
  const provider = new CodeCraftProvider({ apiKey: "key", model: "claude-sonnet-5", baseURL: "https://example.test/v1", supportsImages: true, clientFactory: () => ({ chat: { completions: { create: async (body) => { request = body; return { choices: [{ message: { content: "description" } }] }; } } } }) });
  const result = await provider.complete({ operation: "image-analysis", prompt: "describe", image: { mimeType: "image/png", buffer: Buffer.from("image") } });
  assert.equal(result.provider, "codecraft"); assert.equal(request.messages[0].content[1].type, "image_url");
});
