// Which AI service to use. OpenAI is used when OPENAI_API_KEY is set; Groq is the backup
// when GROQ_API_KEY is set. Set AI_PROVIDER=groq to force Groq.
import { env, fail } from "./_lib.js";

const PROVIDERS = {
  openai: {
    key: () => env("OPENAI_API_KEY"),
    chatUrl: "https://api.openai.com/v1/chat/completions",
    sttUrl: "https://api.openai.com/v1/audio/transcriptions",
    textModel: () => env("OPENAI_TEXT_MODEL", "gpt-6-luna"),
    visionModel: () => env("OPENAI_VISION_MODEL", "gpt-6-luna"),
    sttModel: () => env("OPENAI_STT_MODEL", "gpt-4o-mini-transcribe"),
    // Reasoning models: keep thinking short for snappy logging; no temperature.
    extra: (kind) => ({ reasoning_effort: kind === "chat" ? "low" : "low" }),
  },
  groq: {
    key: () => env("GROQ_API_KEY"),
    chatUrl: "https://api.groq.com/openai/v1/chat/completions",
    sttUrl: "https://api.groq.com/openai/v1/audio/transcriptions",
    textModel: () => env("GROQ_TEXT_MODEL", "llama-3.3-70b-versatile"),
    visionModel: () => env("GROQ_VISION_MODEL", "qwen/qwen3.8-27b"),
    sttModel: () => env("GROQ_STT_MODEL", "whisper-large-v3-turbo"),
    extra: (kind) => ({ temperature: kind === "chat" ? 0.5 : 0.2 }),
  },
};

export function provider() {
  const forced = env("AI_PROVIDER").toLowerCase();
  if (forced && PROVIDERS[forced]?.key()) return { name: forced, ...PROVIDERS[forced] };
  if (PROVIDERS.openai.key()) return { name: "openai", ...PROVIDERS.openai };
  if (PROVIDERS.groq.key()) return { name: "groq", ...PROVIDERS.groq };
  throw fail(500, "ai_key", "Neither OPENAI_API_KEY nor GROQ_API_KEY is set in Vercel");
}

export const aiConfigured = () => !!(env("OPENAI_API_KEY") || env("GROQ_API_KEY"));

export async function chatCompletion(p, body) {
  const r = await fetch(p.chatUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${p.key()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  const msg = j.error?.message || `${p.name} ${r.status}`;
  if (r.status === 401 || r.status === 403) throw fail(500, "ai_key", `${p.name} rejected the API key`);
  if (r.status === 429) {
    if (/quota|billing|credit/i.test(msg)) throw fail(402, "ai_quota", msg);
    throw fail(429, "rate_limited", msg);
  }
  if (!r.ok) throw Object.assign(fail(502, "upstream_error", msg), { aiStatus: r.status });
  return j.choices?.[0]?.message?.content || "";
}

export async function transcribe(p, buf, type, filename, prompt) {
  const form = new FormData();
  form.append("file", new Blob([buf], { type }), filename);
  form.append("model", p.sttModel());
  form.append("language", "en");
  form.append("response_format", "json");
  if (prompt) form.append("prompt", prompt);
  const r = await fetch(p.sttUrl, { method: "POST", headers: { Authorization: `Bearer ${p.key()}` }, body: form });
  const j = await r.json().catch(() => ({}));
  const msg = j.error?.message || `${p.name} ${r.status}`;
  if (r.status === 401 || r.status === 403) throw fail(500, "ai_key", `${p.name} rejected the API key`);
  if (r.status === 429) throw fail(/quota|billing/i.test(msg) ? 402 : 429, /quota|billing/i.test(msg) ? "ai_quota" : "rate_limited", msg);
  if (!r.ok) throw fail(502, "upstream_error", msg);
  return String(j.text || "").trim();
}
