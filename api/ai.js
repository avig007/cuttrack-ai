import { protectedPost, fail } from "./_lib.js";
import { withFallback, chatCompletion } from "./_ai.js";

// AI proxy. API keys live only in Vercel's environment variables, never on the phone.
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

// Try the full request; if the model refuses a parameter (400), retry once with the plainest request.
async function call(p, req) {
  try {
    return await chatCompletion(p, req);
  } catch (e) {
    if (e.aiStatus !== 400) throw e;
    const { reasoning_effort, temperature, response_format, ...plain } = req;
    return chatCompletion(p, plain);
  }
}

async function jsonCall(p, prompt, image) {
  const user = image ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: image } }] : prompt;
  const req = {
    model: image ? p.visionModel() : p.textModel(),
    messages: [
      { role: "system", content: "You are a precise nutrition data extractor. Reply with one valid JSON object and nothing else." },
      { role: "user", content: user },
    ],
    max_completion_tokens: 4000,
    response_format: { type: "json_object" },
    ...p.extra("json"),
  };
  return { data: parseJson(await call(p, req)) };
}

export default protectedPost(async (body) => {
  if (body.mode === "json") {
    const prompt = String(body.prompt || "").slice(0, 60000);
    if (!prompt) throw fail(400, "bad_request", "Missing prompt");
    const image = typeof body.image === "string" && body.image.startsWith("data:image/") ? body.image : null;
    if (image && image.length > 4_000_000) throw fail(413, "image_rejected", "Image too large");
    return withFallback((p) => jsonCall(p, prompt, image));
  }
  if (body.mode === "chat") {
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m) => m && ["system", "user", "assistant"].includes(m.role) && typeof m.content === "string")
      .slice(-14)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 20000) }));
    if (!messages.length) throw fail(400, "bad_request", "No messages");
    return withFallback(async (p) => {
      const text = stripThink(await call(p, { model: p.textModel(), messages, max_completion_tokens: 1500, ...p.extra("chat") }));
      if (!text) throw fail(502, "empty_completion", `${p.name}: empty reply`);
      return { text };
    });
  }
  throw fail(400, "bad_request", "Unknown mode");
});
