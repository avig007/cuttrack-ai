import { session, send } from "../_lib.js";
import { aiConfigured } from "../_ai.js";

export default function handler(req, res) {
  let s;
  try { s = session(req); } catch (e) { return send(res, 500, { error: "not_configured", message: e.message }); }
  if (!s) return send(res, 401, { error: "not_signed_in" });
  send(res, 200, { email: s.email, ai: aiConfigured() });
}
