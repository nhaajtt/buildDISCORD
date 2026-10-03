import { config } from "../config.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const PER_MINUTE = 10;

export class AiError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // off | key | quota | busy | bad
  }
}

let cachedModel = null;
const recent = [];

export const aiEnabled = () => Boolean(config.geminiApiKey);

export function resetAiState() {
  cachedModel = null;
  recent.length = 0;
}

// Free keys have a low shared quota, so the whole bot is capped per minute before Google has to say no
function takeSlot(now = Date.now()) {
  while (recent.length && now - recent[0] > 60_000) recent.shift();
  if (recent.length >= PER_MINUTE) throw new AiError("busy", "Too many AI requests in the last minute");
  recent.push(now);
}

async function call(path, init = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "content-type": "application/json", "x-goog-api-key": config.geminiApiKey, ...init.headers },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new AiError("bad", `Gemini request failed: ${error.message}`);
  }
  if (response.ok) return response.json();
  if (response.status === 429) throw new AiError("quota", "Gemini quota exhausted");
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    const body = await response.text().catch(() => "");
    if (/API key|PERMISSION|UNAUTHENTICATED/i.test(body) || response.status !== 400) throw new AiError("key", "Gemini rejected the API key");
    throw new AiError("bad", `Gemini rejected the request: ${body.slice(0, 200)}`);
  }
  throw new AiError(response.status === 404 ? "model" : "bad", `Gemini returned ${response.status}`);
}

// "models/gemini-2.5-flash" -> [2, 5]
const versionOf = (name) => (name.match(/gemini-(\d+)(?:\.(\d+))?/)?.slice(1).map((n) => Number(n ?? 0)) ?? [0, 0]);

// Picks a fast stable model the key can use, unless GEMINI_MODEL says otherwise
export async function resolveModel() {
  if (config.geminiModel) return config.geminiModel;
  if (cachedModel) return cachedModel;
  const data = await call("/models?pageSize=200");
  const candidates = (data.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((name) => /flash/.test(name) && !/lite|preview|exp|thinking|tts|image|live|audio|latest|\d{3,}/.test(name));
  if (!candidates.length) throw new AiError("bad", "No usable Gemini model found for this key");
  candidates.sort((a, b) => {
    const [a1, a2] = versionOf(a);
    const [b1, b2] = versionOf(b);
    return b1 - a1 || b2 - a2;
  });
  cachedModel = candidates[0];
  return cachedModel;
}

// Asks for JSON that follows the given schema and returns the parsed value
export async function generateJson({ system, prompt, schema }) {
  if (!aiEnabled()) throw new AiError("off", "AI is not configured");
  takeSlot();

  const attempt = async () => {
    const model = await resolveModel();
    const data = await call(`/models/${model}:generateContent`, {
      method: "POST",
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 1, maxOutputTokens: 4096 },
      }),
    });
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
    if (!text) throw new AiError("bad", "Gemini returned no text");
    try {
      return JSON.parse(text);
    } catch {
      throw new AiError("bad", "Gemini returned invalid JSON");
    }
  };

  try {
    return await attempt();
  } catch (error) {
    if (error.kind === "model" && !config.geminiModel) {
      cachedModel = null;
      return attempt();
    }
    if (error.kind === "bad") return attempt();
    throw error;
  }
}
