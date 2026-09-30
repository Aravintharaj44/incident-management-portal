const OpenAI = require("openai");
const { GoogleGenAI } = require("@google/genai");
const { env } = require("../config/env");
const logger = require("../utils/logger");

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const retryable = (error) => RETRYABLE_STATUS.has(error?.status || error?.response?.status) || ["ECONNABORTED", "ETIMEDOUT", "ENETUNREACH", "ECONNRESET"].includes(error?.code);
const failure = (provider, error) => ({ success: false, provider, retryable: retryable(error), errorCode: String(error?.status || error?.response?.status || error?.code || "PROVIDER_ERROR"), message: "AI service is temporarily unavailable." });
const log = (level, message, meta) => logger[level](message, meta);

class GeminiProvider {
  constructor({ apiKey = env.ai.gemini.apiKey, model = env.ai.gemini.model, clientFactory = (key) => new GoogleGenAI({ apiKey: key }) } = {}) { this.apiKey = apiKey; this.model = model; this.clientFactory = clientFactory; }
  get configured() { return Boolean(this.apiKey && this.model); }
  async complete({ operation, prompt, image }) {
    if (!this.configured) return { success: false, provider: "gemini", retryable: false, errorCode: "NOT_CONFIGURED", message: "Gemini is not configured." };
    const started = Date.now();
    try {
      const parts = [{ text: prompt }];
      if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.buffer.toString("base64") } });
      const response = await this.clientFactory(this.apiKey).models.generateContent({ model: this.model, contents: [{ role: "user", parts }], config: { temperature: 0 } });
      const result = response.text || response.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
      if (!result) throw Object.assign(new Error("Malformed provider response"), { status: 502 });
      log("info", "[AI Provider]", { provider: "gemini", model: this.model, operation, durationMs: Date.now() - started, status: "success" });
      return { success: true, provider: "gemini", model: this.model, result };
    } catch (error) { const output = failure("gemini", error); log("warn", "[AI Provider]", { provider: "gemini", model: this.model, operation, durationMs: Date.now() - started, status: "failure", errorCode: output.errorCode }); return output; }
  }
}

class CodeCraftProvider {
  constructor({ apiKey = env.ai.codecraft.apiKey, model = env.ai.codecraft.model, baseURL = env.ai.codecraft.baseURL, supportsImages = env.ai.codecraft.supportsImages, clientFactory = (options) => new OpenAI(options) } = {}) { this.apiKey = apiKey; this.model = model; this.baseURL = baseURL; this.supportsImages = supportsImages; this.clientFactory = clientFactory; }
  get configured() { return Boolean(this.apiKey && this.model && this.baseURL); }
  async complete({ operation, prompt, image }) {
    if (!this.configured) return { success: false, provider: "codecraft", retryable: false, errorCode: "NOT_CONFIGURED", message: "CodeCraft is not configured." };
    if (image && !this.supportsImages) return { success: false, provider: "codecraft", retryable: false, errorCode: "IMAGE_UNSUPPORTED", message: "The configured CodeCraft endpoint has not been enabled for image input." };
    const started = Date.now();
    try {
      const content = image ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: "data:" + image.mimeType + ";base64," + image.buffer.toString("base64") } }] : prompt;
      const response = await this.clientFactory({ apiKey: this.apiKey, baseURL: this.baseURL, timeout: 30000 }).chat.completions.create({ model: this.model, temperature: 0, max_tokens: 500, messages: [{ role: "user", content }] });
      const result = response?.choices?.[0]?.message?.content;
      if (!result) throw Object.assign(new Error("Malformed provider response"), { status: 502 });
      log("info", "[AI Provider]", { provider: "codecraft", model: this.model, operation, durationMs: Date.now() - started, status: "success" });
      return { success: true, provider: "codecraft", model: this.model, result };
    } catch (error) { const output = failure("codecraft", error); log("warn", "[AI Provider]", { provider: "codecraft", model: this.model, operation, durationMs: Date.now() - started, status: "failure", errorCode: output.errorCode }); return output; }
  }
}

class AiProviderService {
  constructor({ gemini = new GeminiProvider(), codecraft = new CodeCraftProvider(), cooldownSeconds = env.ai.geminiCooldownSeconds, failureThreshold = env.ai.geminiFailureThreshold } = {}) { this.gemini = gemini; this.codecraft = codecraft; this.cooldownMs = cooldownSeconds * 1000; this.failureThreshold = failureThreshold; this.rateLimitFailures = 0; this.unavailableUntil = 0; }
  async complete(request) {
    const circuitOpen = Date.now() < this.unavailableUntil;
    const primary = circuitOpen ? { success: false, provider: "gemini", retryable: true, errorCode: "CIRCUIT_OPEN" } : await this.gemini.complete(request);
    if (primary.success) { this.rateLimitFailures = 0; return primary; }
    if (!primary.retryable) return primary;
    if (primary.errorCode === "429" || /quota|rate.limit/i.test(String(primary.errorCode))) { this.rateLimitFailures += 1; if (this.rateLimitFailures >= this.failureThreshold) this.unavailableUntil = Date.now() + this.cooldownMs; }
    log("warn", "[AI Provider Fallback]", { from: "gemini", to: "codecraft", reason: primary.errorCode, operation: request.operation });
    return this.codecraft.complete(request);
  }
}
module.exports = { AiProviderService, GeminiProvider, CodeCraftProvider, aiProviderService: new AiProviderService(), retryable };
