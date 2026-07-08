#!/usr/bin/env node
/**
 * organize-assets.mjs — consolidate downloads/ into assets/<template>/{preview,images,videos,fonts}.
 *
 * Maps each downloaded file back to the template(s) that reference it:
 *   - a template's video_preview_url / image_preview_url  → assets/<slug>/preview.<ext>
 *   - an embedded asset used by exactly ONE template       → assets/<slug>/<type>s/<name>
 *   - an embedded asset used by MULTIPLE templates          → assets/_shared/<type>s/<name>
 *   - an asset that maps to no template                     → assets/_unmapped/<type>s/<name>
 *
 * Moves (renames) files — no duplication. Updates download-manifest dest paths so the fetcher's
 * skip/idempotency still works. Re-runnable (skips already-placed files). Writes asset-index.json
 * and missing-assets-report.json (templates whose referenced assets couldn't be fetched).
 *
 * Usage: node scripts/organize-assets.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');
const P = {
  dlm: path.join(ROOT, 'downloads', 'download-manifest.json'),
  cat: path.join(ROOT, 'catalog-current.json'),
  master: path.join(ROOT, 'prompts-with-text.json'),
  assets: path.join(ROOT, 'assets'),
  index: path.join(ROOT, 'asset-index.json'),
  missing: path.join(ROOT, 'missing-assets-report.json'),
};
const nowIso = () => new Date().toISOString();
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const clean = (u) => u.trim().replace(/[.,;:!?'"`)\]}>]+$/, '');
const urlKey = (u) => { try { const x = new URL(clean(u)); return x.host + x.pathname; } catch { return clean(u); } }; // host+path, ignores query
const sani = (s) => (s || '').replace(/[^A-Za-z0-9._-]/g, '_').replace(/_+/g, '_').slice(0, 60) || 'asset';
const muxId = (u) => (u.match(/stream\.mux\.com\/([^./?]+)/) || [])[1];

const man = J(P.dlm, { assets: {} });
const cat = J(P.cat, { prompts: [] });

// preview URL → slug (takes precedence over embedded mapping)
const previewSlug = new Map();
for (const p of cat.prompts) {
  if (p.video_preview_url) previewSlug.set(clean(p.video_preview_url), p.id);
  if (p.image_preview_url) previewSlug.set(clean(p.image_preview_url), p.id);
}
// embedded URL (host+path) → set of slugs, built by scanning ACTUAL prompt text (authoritative)
const URL_RE = /https?:\/\/[^\s"'`)<>\]\\}]+/g;
const emb = new Map();
const master = J(P.master, { prompts: [] });
for (const p of master.prompts) {
  const text = p.prompt_text || ''; const seen = new Set();
  for (const m of text.matchAll(URL_RE)) {
    const k = urlKey(m[0]); if (seen.has(k)) continue; seen.add(k);
    if (!emb.has(k)) emb.set(k, new Set()); emb.get(k).add(p.id);
  }
}

const idx = { generated_at: nowIso(), templates: {}, _shared: { images: [], videos: [], fonts: [] }, _unmapped: { images: [], videos: [], fonts: [] } };
const ensureT = (s) => (idx.templates[s] ||= { preview: null, images: [], videos: [], fonts: [] });

const nameFor = (url, ext) => {
  if (/stream\.mux\.com/.test(url)) return 'mux_' + (muxId(url) || crypto.createHash('sha1').update(url).digest('hex').slice(0, 8)) + (ext || '.mp4');
  let bn = 'asset';
  try { bn = path.basename(new URL(url).pathname).split('?')[0] || 'asset'; } catch { /* */ }
  const stem = sani(bn.slice(0, bn.length - path.extname(bn).length));
  return stem + '_' + crypto.createHash('sha1').update(url).digest('hex').slice(0, 6) + ext;
};

let moved = 0, placed = 0;
for (const [url, a] of Object.entries(man.assets)) {
  if (a.status !== 'ok' || !a.dest) continue;
  const src = path.join(ROOT, a.dest);
  if (!fs.existsSync(src)) continue;
  const type = a.type; const ext = path.extname(src) || '';
  const cu = clean(url);
  let target;
  if (previewSlug.has(cu)) {
    const slug = previewSlug.get(cu); ensureT(slug);
    target = path.join(P.assets, slug, 'preview' + (ext || '.mp4'));
    idx.templates[slug].preview = path.relative(ROOT, target);
  } else {
    const slugs = emb.has(urlKey(url)) ? [...emb.get(urlKey(url))] : [];
    const base = nameFor(url, ext);
    if (slugs.length === 1) { const slug = slugs[0]; ensureT(slug); target = path.join(P.assets, slug, type + 's', base); idx.templates[slug][type + 's'].push(path.relative(ROOT, target)); }
    else if (slugs.length > 1) { target = path.join(P.assets, '_shared', type + 's', base); idx._shared[type + 's'].push(path.relative(ROOT, target)); }
    else { target = path.join(P.assets, '_unmapped', type + 's', base); idx._unmapped[type + 's'].push(path.relative(ROOT, target)); }
  }
  placed++;
  if (path.resolve(src) === path.resolve(target)) continue; // already placed
  if (!DRY) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.renameSync(src, target); man.assets[url].dest = path.relative(ROOT, target); }
  moved++;
}

// prune STALE failures whose cleaned twin already succeeded (dirty-URL artifacts)
const okKeys = new Set();
for (const [u, a] of Object.entries(man.assets)) if (a.status === 'ok') okKeys.add(urlKey(u));
let pruned = 0;
for (const [u, a] of Object.entries(man.assets)) if (a.status !== 'ok' && okKeys.has(urlKey(u))) { delete man.assets[u]; pruned++; }

// templates whose referenced assets GENUINELY failed (no successful twin)
const missingByT = {};
for (const [url, a] of Object.entries(man.assets)) {
  if (a.status === 'ok') continue;
  const cu = clean(url);
  const slugs = emb.has(urlKey(url)) ? [...emb.get(urlKey(url))] : (previewSlug.has(cu) ? [previewSlug.get(cu)] : []);
  const reason = a.http === 401 ? 'private(signed-url)' : a.http === 403 ? 'protected(hotlink)' : a.http === 404 ? 'dead' : 'other';
  for (const s of slugs) { (missingByT[s] = missingByT[s] || []).push({ url: url.slice(0, 100), http: a.http || null, reason }); }
}

const nT = Object.keys(idx.templates).length;
const sh = idx._shared.images.length + idx._shared.videos.length + idx._shared.fonts.length;
const un = idx._unmapped.images.length + idx._unmapped.videos.length + idx._unmapped.fonts.length;
if (!DRY) {
  fs.writeFileSync(P.index, JSON.stringify(idx, null, 2));
  fs.writeFileSync(P.missing, JSON.stringify({ generated_at: idx.generated_at, templates_with_missing: Object.keys(missingByT).length, byTemplate: missingByT }, null, 2));
  man.updated_at = idx.generated_at; fs.writeFileSync(P.dlm, JSON.stringify(man, null, 2));
}
console.log((DRY ? '(DRY) ' : '') + `placed ${placed} files (moved ${moved}) across ${nT} templates | _shared=${sh} | _unmapped=${un}`);
const genuineMissing = Object.values(missingByT).reduce((s, a) => s + a.length, 0);
console.log(`pruned ${pruned} stale dirty-URL failures | GENUINELY missing: ${genuineMissing} assets across ${Object.keys(missingByT).length} templates`);
