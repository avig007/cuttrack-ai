import { env, protectedPost, fail } from "./_lib.js";

// Voice notes -> text with Groq Whisper. The phone sends the recording as base64.
const ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";
const EXT = { "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "m4a", "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/wav": "wav" };

export default protectedPost(async (body) => {
  if (!env("GROQ_API_KEY")) throw fail(500, "groq_key", "GROQ_API_KEY is not set");
  const b64 = String(body.audio || "");
  if (!b64) throw fail(400, "bad_request", "No audio");
  if (b64.length > 4_000_000) throw fail(413, "audio_too_long", "Recording too long");
  const type = String(body.type || "audio/mp4").split(";")[0];
  const buf = Buffer.from(b64, "base64");

  const form = new FormData();
  form.append("file", new Blob([buf], { type }), `voice.${EXT[type] || "m4a"}`);
  form.append("model", env("GROQ_STT_MODEL", "whisper-large-v3-turbo"));
  form.append("language", "en");
  form.append("response_format", "json");
  form.append("temperature", "0");
  // A hint list improves spelling of Indian food words.
  form.append("prompt", "Food log: roti, chapati, paratha, dal, rajma, chole, paneer, dahi, poha, upma, idli, dosa, biryani, chicken tikka, Amul, Country Delight, Epigamia, Yoga Bar, MuscleBlaze, whey, katori, grams.");

  const r = await fetch(ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${env("GROQ_API_KEY")}` }, body: form });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) throw fail(500, "groq_key", "Groq rejected the API key");
  if (r.status === 429) throw fail(429, "rate_limited", "Groq rate limit");
  if (!r.ok) throw fail(502, "upstream_error", j.error?.message || `Groq ${r.status}`);
  return { text: String(j.text || "").trim() };
});
