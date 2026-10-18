import { env, appUrl, sign, send, allowedEmails } from "../_lib.js";

// Sends you to Google to approve CutTrack. Scope drive.file means the app can only
// see and change files it created itself, nothing else in your Drive.
export default function handler(req, res) {
  if (!env("GOOGLE_CLIENT_ID") || !env("GOOGLE_CLIENT_SECRET")) {
    return send(res, 500, { error: "not_configured", message: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel." });
  }
  let state;
  try {
    const ts = Date.now().toString(36);
    state = `${ts}.${sign("state:" + ts)}`;
  } catch (e) {
    return send(res, 500, { error: "not_configured", message: e.message });
  }
  const p = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"),
    redirect_uri: `${appUrl(req)}/api/auth/callback`,
    response_type: "code",
    scope: "openid email https://www.googleapis.com/auth/drive.file",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (allowedEmails().length === 1) p.set("login_hint", allowedEmails()[0]);
  p.set("prompt", "consent select_account");
  res.statusCode = 302;
  res.setHeader("Location", `https://accounts.google.com/o/oauth2/v2/auth?${p}`);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}
