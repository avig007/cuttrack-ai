import { env, protectedPost, fail } from "./_lib.js";

// Groq proxy. Your GROQ_API_KEY lives only in Vercel's environment variables.
const GROQ = "https://api.groq.com/openai/v1/chat/completions";
const TEXT_MODEL = () => env("GROQ_TEXT_MODEL", "llama-3.3-70b-versatile");
const VISION_MODEL = () => env("GROQ_VISION_MODEL", "qwen/qwen3.8-27b");

async function groq(body) {
  if (!env("GROQ_API_KEY")) throw fail(500, "groq_key", "GROQ_API_KEY is not set");
  const r = await fetch(GROQ, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("GROQ_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) throw fail(500, "groq_key", "Groq rejected the API key");
  if (r.status === 429) throw fail(429, "rate_limited", j.error?.message || "Groq rate limit");
  if (!r.ok) throw Object.assign(fail(502, "upstream_error", j.error?.message || `Groq ${r.status}`), { groqStatus: r.status });
  return j.choices?.[0]?.message?.content || "";
}

const stripThink = (t) => String(t || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

function parseJson(text) {
  const t = stripThink(text);
  try { return JSON.parse(t); } catch {}
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  throw fail(502, "invalid_json", "The AI reply wasn't valid JSON");
}

async function jsonCall(prompt, image) {
  const user = image
    ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: image } }]
    : prompt;
  const base = {
    model: image ? VISION_MODEL() : TEXT_MODEL(),
    messages: [
      { role: "system", content: "You are a precise nutrition data extractor. Reply with one valid JSON object and nothing else." },
      { role: "user", content: user },
    ],
    temperature: 0.2,
    max_completion_tokens: 2048,
  };
  try {
    return parseJson(await groq({ ...base, response_format: { type: "json_object" } }));
  } catch (e) {
    // Some models reject json mode; retry once without it.
    if (e.groqStatus === 400 || e.code === "invalid_json") return parseJson(await groq(base));
    throw e;
  }
}

export default protectedPost(async (body) => {
  if (body.mode === "json") {
    const prompt = String(body.prompt || "").slice(0, 60000);
    if (!prompt) throw fail(400, "bad_request", "Missing prompt");
    const image = typeof body.image === "string" && body.image.startsWith("data:image/") ? body.image : null;
    if (image && image.length > 4_000_000) throw fail(413, "image_rejected", "Image too large");
    return { data: await jsonCall(prompt, image) };
  }
  if (body.mode === "chat") {
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m) => m && ["system", "user", "assistant"].includes(m.role) && typeof m.content === "string")
      .slice(-14)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 20000) }));
    if (!messages.length) throw fail(400, "bad_request", "No messages");
    const text = stripThink(await groq({ model: TEXT_MODEL(), messages, temperature: 0.5, max_completion_tokens: 700 }));
    if (!text) throw fail(502, "empty_completion", "Empty reply");
    return { text };
  }
  throw fail(400, "bad_request", "Unknown mode");
});
