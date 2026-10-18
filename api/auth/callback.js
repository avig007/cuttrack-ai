import { env, appUrl, sign, seal, emailAllowed } from "../_lib.js";

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function page(res, status, title, message, token, email) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const script = token
    ? `<script>try{localStorage.setItem("cuttrack.session",${JSON.stringify(token)});localStorage.setItem("cuttrack.email",${JSON.stringify(email)});}catch(e){}location.replace("/");</script>`
    : "";
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)}</title>
<style>body{font:16px/1.5 system-ui,-apple-system,sans-serif;margin:0;padding:32px 20px;background:#F3F5F1;color:#17221C}@media(prefers-color-scheme:dark){body{background:#0E1411;color:#E6ECE7}}a{color:#0F7B5A;font-weight:600}</style></head>
<body><h1 style="font-size:1.4rem">${escHtml(title)}</h1><p>${escHtml(message)}</p><p><a href="/">Back to CutTrack</a></p>${script}</body></html>`);
}

export default async function handler(req, res) {
  const u = new URL(req.url, "http://localhost");
  if (u.searchParams.get("error")) return page(res, 400, "Sign-in cancelled", "Google sign-in was cancelled. Go back and tap Sign in again.");
  const code = u.searchParams.get("code");
  const [ts, sig] = (u.searchParams.get("state") || "").split(".");
  try {
    if (!code || !ts || sig !== sign("state:" + ts) || Date.now() - parseInt(ts, 36) > 15 * 60 * 1000) {
      return page(res, 400, "Sign-in expired", "That sign-in link is no longer valid. Go back and tap Sign in again.");
    }
  } catch (e) {
    return page(res, 500, "Server not set up", e.message);
  }

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      redirect_uri: `${appUrl(req)}/api/auth/callback`,
      grant_type: "authorization_code",
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return page(res, 400, "Sign-in failed", j.error_description || j.error || "Google refused the sign-in.");
  if (!String(j.scope || "").includes("drive.file")) {
    return page(res, 400, "Drive permission needed", "CutTrack needs permission to create its files in your Drive. Sign in again and tick the Google Drive box.");
  }
  if (!j.refresh_token) {
    return page(res, 400, "Sign-in incomplete", "Google didn't return a long-lived sign-in. Remove CutTrack at myaccount.google.com/permissions, then sign in again.");
  }

  let email = "";
  try { email = JSON.parse(Buffer.from(j.id_token.split(".")[1], "base64url").toString("utf8")).email || ""; } catch {}
  if (!emailAllowed(email)) {
    return page(res, 403, "Not on the list", `${email || "This Google account"} isn't allowed to use this CutTrack yet. Ask the owner to add it, then sign in again.`);
  }

  const token = seal({ rt: j.refresh_token, email, iat: Date.now() });
  return page(res, 200, "Signed in", "Opening CutTrack…", token, email);
}
