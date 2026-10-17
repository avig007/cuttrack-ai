import { session, send, env } from "../_lib.js";

export default function handler(req, res) {
  let s;
  try { s = session(req); } catch (e) { return send(res, 500, { error: "not_configured", message: e.message }); }
  if (!s) return send(res, 401, { error: "not_signed_in" });
  send(res, 200, { email: s.email, ai: !!env("GROQ_API_KEY") });
}
