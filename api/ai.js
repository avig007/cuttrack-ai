import { protectedPost, fail } from "./_lib.js";
import { provider, chatCompletion } from "./_ai.js";

// AI proxy. Your API key lives only in Vercel's environment variables, never on the phone.
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
  const p = provider();
  const user = image ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: image } }] : prompt;
  const base = {
    model: image ? p.visionModel() : p.textModel(),
    messages: [
      { role: "system", content: "You are a precise nutrition data extractor. Reply with one valid JSON object and nothing else." },
      { role: "user", content: user },
    ],
    max_completion_tokens: 4000,
    ...p.extra("json"),
  };
  try {
    return parseJson(await chatCompletion(p, { ...base, response_format: { type: "json_object" } }));
  } catch (e) {
    // Some models reject JSON mode or a parameter; retry once with the plainest request.
    if (e.aiStatus === 400 || e.code === "invalid_json") {
      const { reasoning_effort, temperature, ...plain } = base;
      return parseJson(await chatCompletion(p, plain));
    }
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
    const p = provider();
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m) => m && ["system", "user", "assistant"].includes(m.role) && typeof m.content === "string")
      .slice(-14)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 20000) }));
    if (!messages.length) throw fail(400, "bad_request", "No messages");
    const req = { model: p.textModel(), messages, max_completion_tokens: 1500, ...p.extra("chat") };
    let text;
    try { text = await chatCompletion(p, req); }
    catch (e) {
      if (e.aiStatus !== 400) throw e;
      const { reasoning_effort, temperature, ...plain } = req;
      text = await chatCompletion(p, plain);
    }
    text = stripThink(text);
    if (!text) throw fail(502, "empty_completion", "Empty reply");
    return { text };
  }
  throw fail(400, "bad_request", "Unknown mode");
});
