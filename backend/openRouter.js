const OpenAI = require("openai");
require("dotenv").config();

const MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";
const APIKEY = process.env.OPENROUTER_API_KEY;
const ALLOWED = {
    os_or_application: ["Operating System", "Application", "Both", "Unknown"],
    vulnerability_type: [
        "Application", "Network", "Operating System", "Database", "Web",
        "Authentication", "Configuration", "Cryptographic", "Hardware", "Other",
    ],
    vulnerability_category: [
        "Information Disclosure", "Authentication Bypass", "Privilege Escalation",
        "Remote Code Execution", "Denial of Service", "Misconfiguration",
        "Unsupported Software", "Security Control Failure", "Other",
    ],
    attack_vector: ["Local", "Network", "Physical", "Adjacent Network", "Unknown"],
    severity: ["Critical", "High", "Medium", "Low", "Informational", "Unknown"],
};

function buildPrompt(vulnerabilityText) {
    return `
Analyze the vulnerability alert below and return a structured classification.

VULNERABILITY ALERT:
"""
${vulnerabilityText}
"""

RULES:
- Use ONLY information present in the alert plus well-established general knowledge.
  Do NOT invent protocols, services, CVEs or causes. If unsure, use "Unknown" or "Other".
- "os_or_application": decide WHERE the behavior lives.
  * "Operating System" = the alert names OS versions/builds and describes behavior of the
    OS itself (kernel, network stack, built-in services, defaults).
  * "Application" = the flaw is in a specific installed application/software package.
  * "Both" only if the alert clearly involves both. Otherwise "Unknown".
- "vulnerability_category": choose the risk that the behavior creates
  (e.g. remote disclosure of system information = "Information Disclosure"),
  not merely a description of the symptom.
- "severity": base it on real-world impact. Low-impact information leaks are "Low" or "Informational".
- "reasoning": mention any part of your answer that is an inference rather than stated in the alert.

Return ONLY valid JSON with exactly these keys:
{
  "os_or_application": one of ${JSON.stringify(ALLOWED.os_or_application)},
  "vulnerability_type": one of ${JSON.stringify(ALLOWED.vulnerability_type)},
  "vulnerability_category": one of ${JSON.stringify(ALLOWED.vulnerability_category)},
  "summary": string,
  "affected_component": string,
  "attack_vector": one of ${JSON.stringify(ALLOWED.attack_vector)},
  "severity": one of ${JSON.stringify(ALLOWED.severity)},
  "confidence": integer 0-100,
  "remediation": string,
  "reasoning": string
}
No Markdown, no text outside the JSON.
`;
}

function extractJson(text) {
    const cleaned = text.replace(/```json|```/gi, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON object found");
    return JSON.parse(cleaned.slice(start, end + 1));
}

function validate(result) {
    const problems = [];
    for (const [key, allowed] of Object.entries(ALLOWED)) {
        if (!allowed.includes(result[key])) {
            problems.push(`${key}: "${result[key]}" is not one of [${allowed.join(", ")}]`);
        }
    }
    const c = result.confidence;
    if (!Number.isInteger(c) || c < 0 || c > 100) {
        problems.push(`confidence: "${c}" is not an integer 0-100`);
    }
    return problems;
}

async function analyzeVulnerability(vulnerabilityText) {

    const client = new OpenAI({
        apiKey: APIKEY,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
            "X-Title": "incident-management-portal",
        },
    });

    const response = await client.chat.completions.create({
        model: MODEL,
        temperature: 0,
        messages: [
            {
                role: "system",
                content:
                    "You are an expert cybersecurity vulnerability analyst. Classify alerts accurately, never fabricate details, and return only JSON.",
            },
            { role: "user", content: buildPrompt(vulnerabilityText) },
        ],
    });

    console.log("MODEL USED:", response.model);

    const content = response.choices?.[0]?.message?.content;
    console.log("RAW RESPONSE:\n" + content);

    if (!content) {
        console.error("Model returned an empty response. Try again or pick another free model.");
        return null;
    }

    let result;
    try {
        result = extractJson(content);
    } catch (err) {
        console.error("Model did not return valid JSON:", err.message);
        return null;
    }

    const problems = validate(result);
    if (problems.length) {
        console.warn("\nValidation warnings:\n- " + problems.join("\n- "));
    }

    console.log("\nVULNERABILITY ANALYSIS:");
    console.log(JSON.stringify(result, null, 2));
    return result;
}

const vulnerability = `
Timestamps returned from machines running Windows Vista / 7 / 2008 / 2008 R2
are deliberately incorrect, but usually within 1000 seconds of the actual
system time.
`;

analyzeVulnerability(vulnerability).catch((e) => {
    console.error("API ERROR:", e.status || "", e.message);
    process.exitCode = 1;
});