import { env, protectedPost, fail } from "./_lib.js";

// Google Drive storage. Layout:
//   My Drive/CutTrack AI/cuttrack-data.json          <- full app data, used to restore on any device
//   My Drive/CutTrack AI/2026/10 - October/2026-10-18.txt   <- one readable file per day
const FILES = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER = "application/vnd.google-apps.folder";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ROOT_NAME = () => env("DRIVE_FOLDER_NAME", "CutTrack AI") || "CutTrack AI";

const tokenCache = new Map(); // refresh token -> {at, exp}
const folderCache = new Map(); // email|key -> folder id (per warm instance)

async function accessToken(s) {
  const c = tokenCache.get(s.rt);
  if (c && c.exp > Date.now() + 60_000) return c.at;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), refresh_token: s.rt, grant_type: "refresh_token" }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (j.error === "invalid_grant") throw fail(401, "not_signed_in", "Google sign-in expired or was removed");
    throw fail(502, "drive_error", j.error_description || "Couldn't refresh Google access");
  }
  tokenCache.set(s.rt, { at: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 });
  return j.access_token;
}

async function g(at, url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${at}`, ...(opts.headers || {}) } });
  if (r.status === 401) throw fail(401, "not_signed_in", "Google rejected the access token");
  if (r.status === 404) throw fail(404, "drive_missing", "A Drive folder or file was not found");
  if (!r.ok) throw fail(502, "drive_error", `Drive ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}

const q = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

async function find(at, name, parent, isFolder) {
  const query = `name = '${q(name)}' and '${parent}' in parents and trashed = false and mimeType ${isFolder ? "=" : "!="} '${FOLDER}'`;
  const r = await g(at, `${FILES}?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=10&spaces=drive`);
  return (await r.json()).files || [];
}

async function folder(at, s, key, name, parent) {
  const ck = `${s.email}|${key}`;
  if (folderCache.has(ck)) return folderCache.get(ck);
  let id = (await find(at, name, parent, true))[0]?.id;
  if (!id) {
    const r = await g(at, `${FILES}?fields=id`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }) });
    id = (await r.json()).id;
  }
  folderCache.set(ck, id);
  return id;
}

async function trash(at, id) {
  await g(at, `${FILES}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });
}

// Update the file in place when it exists, otherwise create it. Duplicates get binned.
async function upsert(at, name, parent, content, mime) {
  const existing = await find(at, name, parent, false);
  if (existing[0]) {
    await g(at, `${UPLOAD}/${existing[0].id}?uploadType=media`, { method: "PATCH", headers: { "Content-Type": `${mime}; charset=UTF-8` }, body: content });
    for (const d of existing.slice(1)) await trash(at, d.id).catch(() => {});
    return existing[0].id;
  }
  const boundary = "cuttrack" + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parent], mimeType: mime })}\r\n` +
    `--${boundary}\r\nContent-Type: ${mime}; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
  const r = await g(at, `${UPLOAD}?uploadType=multipart&fields=id`, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body });
  return (await r.json()).id;
}

async function rootFolder(at, s) {
  return folder(at, s, "root", ROOT_NAME(), "root");
}

async function monthFolder(at, s, date) {
  const [y, m] = date.split("-");
  const root = await rootFolder(at, s);
  const yf = await folder(at, s, `y${y}`, y, root);
  return folder(at, s, `m${y}-${m}`, `${m} - ${MONTHS[+m - 1]}`, yf);
}

async function sync(at, s, body) {
  const root = await rootFolder(at, s);
  if (body.data) await upsert(at, "cuttrack-data.json", root, JSON.stringify(body.data), "application/json");
  const days = Array.isArray(body.days) ? body.days.slice(0, 400) : [];
  for (const d of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d?.date || "")) continue;
    const mf = await monthFolder(at, s, d.date);
    const name = `${d.date}.txt`;
    if (d.text) await upsert(at, name, mf, String(d.text), "text/plain");
    else for (const f of await find(at, name, mf, false)) await trash(at, f.id).catch(() => {});
  }
  return { ok: true, folderUrl: `https://drive.google.com/drive/folders/${root}`, savedDays: days.length };
}

async function pull(at, s) {
  const root = await rootFolder(at, s);
  const f = (await find(at, "cuttrack-data.json", root, false))[0];
  if (!f) return { data: null, folderUrl: `https://drive.google.com/drive/folders/${root}` };
  const r = await g(at, `${FILES}/${f.id}?alt=media`);
  let data = null;
  try { data = await r.json(); } catch { data = null; }
  return { data, folderUrl: `https://drive.google.com/drive/folders/${root}` };
}

export default protectedPost(async (body, s) => {
  const at = await accessToken(s);
  const run = () => (body.action === "pull" ? pull(at, s) : body.action === "sync" ? sync(at, s, body) : Promise.reject(fail(400, "bad_request", "Unknown action")));
  try {
    return await run();
  } catch (e) {
    // A cached folder may have been deleted by hand: forget the cache and try once more.
    if (e.code === "drive_missing") {
      for (const k of [...folderCache.keys()]) if (k.startsWith(`${s.email}|`)) folderCache.delete(k);
      return run();
    }
    throw e;
  }
});
