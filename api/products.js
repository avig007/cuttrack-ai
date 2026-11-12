// Packaged food search, backed by Open Food Facts (free, open database of product labels).
// Public GET, no sign-in needed: it only reads open data. Indian products are listed first.
// GET /api/products?q=amul+protein
import { send } from "./_lib.js";

const UA = "CutTrackAI/1.0 (https://cuttrack-ai-psi.vercel.app)";
const FIELDS = "code,product_name,product_name_en,brands,quantity,serving_size,serving_quantity,product_quantity,product_quantity_unit,nutriments,countries_tags";
const cache = new Map();

const num = (v) => { const n = typeof v === "string" ? parseFloat(v) : v; return Number.isFinite(n) ? Math.round(n * 10) / 10 : null; };

function norm(p) {
  const n = p.nutriments || {};
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal == null && num(n["energy_100g"]) != null) kcal = Math.round(num(n["energy_100g"]) / 4.184);
  const name = String(p.product_name_en || p.product_name || "").trim();
  if (!name || kcal == null) return null;
  const unitMl = /ml|l$/i.test(String(p.product_quantity_unit || "")) || /\d\s*(ml|l)\b/i.test(String(p.quantity || ""));
  const tags = Array.isArray(p.countries_tags) ? p.countries_tags : [];
  return {
    code: String(p.code || ""),
    name,
    brand: String(p.brands || "").split(",")[0].trim(),
    quantity: String(p.quantity || "").trim(),
    packG: num(p.product_quantity),
    serving: String(p.serving_size || "").trim(),
    servingG: num(p.serving_quantity),
    ml: unitMl,
    india: tags.includes("en:india"),
    per100: { kcal, p: num(n.proteins_100g) ?? 0, c: num(n.carbohydrates_100g) ?? 0, f: num(n.fat_100g) ?? 0, fib: num(n.fiber_100g) ?? 0, sug: num(n.sugars_100g) ?? 0 },
  };
}

async function getJson(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctl.signal });
    if (!r.ok) throw new Error("status " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

// Newer search service first, older search API as a fallback.
async function lookup(q) {
  const enc = encodeURIComponent;
  const tries = [
    async () => (await getJson(`https://search.openfoodfacts.org/search?q=${enc(q + ' countries_tags:"en:india"')}&page_size=30&fields=${FIELDS}`)).hits,
    async () => (await getJson(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${enc(q)}&tagtype_0=countries&tag_contains_0=contains&tag_0=india&search_simple=1&action=process&json=1&page_size=30&fields=${FIELDS}`)).products,
    async () => (await getJson(`https://search.openfoodfacts.org/search?q=${enc(q)}&page_size=30&fields=${FIELDS}`)).hits,
  ];
  let last;
  for (const fn of tries) {
    try {
      const list = (await fn() || []).map(norm).filter(Boolean);
      if (list.length) return list;
    } catch (e) { last = e; }
  }
  if (last) throw last;
  return [];
}

export default async function handler(req, res) {
  const q = String((req.query && req.query.q) || new URL(req.url, "http://x").searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return send(res, 400, { error: "Type at least 2 letters" });
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600e3) return send(res, 200, { products: hit.list, cached: true });
  try {
    const seen = new Set();
    const list = (await lookup(q))
      .filter((p) => { const k = (p.brand + "|" + p.name).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => (b.india ? 1 : 0) - (a.india ? 1 : 0))
      .slice(0, 20);
    cache.set(key, { at: Date.now(), list });
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    send(res, 200, { products: list, source: "Open Food Facts" });
  } catch (e) {
    send(res, 502, { error: "The packaged food database didn't answer. Try again in a minute.", code: "upstream" });
  }
}
