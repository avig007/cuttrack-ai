import { protectedPost, fail } from "./_lib.js";
import { provider, transcribe } from "./_ai.js";

// Voice notes -> text. The phone sends the recording as base64.
const EXT = { "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "m4a", "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/wav": "wav" };
const HINT = "Food log: roti, chapati, paratha, dal, rajma, chole, paneer, dahi, poha, upma, idli, dosa, biryani, chicken tikka, Amul, Country Delight, Epigamia, Yoga Bar, MuscleBlaze, whey, katori, grams.";

export default protectedPost(async (body) => {
  const b64 = String(body.audio || "");
  if (!b64) throw fail(400, "bad_request", "No audio");
  if (b64.length > 4_000_000) throw fail(413, "audio_too_long", "Recording too long");
  const type = String(body.type || "audio/mp4").split(";")[0];
  const text = await transcribe(provider(), Buffer.from(b64, "base64"), type, `voice.${EXT[type] || "m4a"}`, HINT);
  return { text };
});
