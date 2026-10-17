// Shared helpers for the CutTrack server functions. Files starting with "_" are not deployed as routes.
import crypto from "node:crypto";

export const env = (k, d = "") => (process.env[k] ?? d).trim();

function key() {
  const secret = env("SESSION_SECRET");
  if (secret.length < 16) throw Object.assign(new Error("SESSION_SECRET must be set (at least 16 characters)"), { status: 500, code: "not_configured" });
  return crypto.createHash("sha256").update(secret).digest();
}

// Encrypt the Google refresh token into an opaque session string the phone keeps.
export function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64url");
}

export function unseal(token) {
  try {
    const b = Buffer.from(token, "base64url");
    const d = crypto.createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8"));
  } catch {
    return null;
  }
}

export const sign = (s) => crypto.createHmac("sha256", key()).update(s).digest("base64url");

// Returns the signed-in session or null. Every AI and Drive route requires one,
// so nobody else can spend your Groq key or touch your Drive.
export function session(req) {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  const s = t ? unseal(t) : null;
  if (!s?.rt) return null;
  const allowed = env("ALLOWED_EMAIL").toLowerCase();
  if (allowed && String(s.email || "").toLowerCase() !== allowed) return null;
  return s;
}

export function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

export function appUrl(req) {
  const u = env("APP_URL").replace(/\/+$/, "");
  return u || `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
}

export async function readJson(req) {
  if (req.body != null && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  if (Buffer.isBuffer(req.body)) return req.body.length ? JSON.parse(req.body.toString("utf8")) : {};
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const t = Buffer.concat(chunks).toString("utf8");
  return t ? JSON.parse(t) : {};
}

// Wraps a handler: POST only, signed in, JSON in/out, errors mapped to codes the app understands.
export function protectedPost(fn) {
  return async (req, res) => {
    if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
    let s;
    try { s = session(req); } catch (e) { return send(res, 500, { error: e.code || "not_configured", message: e.message }); }
    if (!s) return send(res, 401, { error: "not_signed_in" });
    try {
      const body = await readJson(req);
      const out = await fn(body, s, req);
      send(res, 200, out);
    } catch (e) {
      const status = e.status || 500;
      send(res, status, { error: e.code || "server_error", message: String(e.message || e).slice(0, 300) });
    }
  };
}

export const fail = (status, code, message) => Object.assign(new Error(message || code), { status, code });
