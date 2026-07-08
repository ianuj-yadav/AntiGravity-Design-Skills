#!/usr/bin/env node
/**
 * fetch-motionsites.mjs — incremental, rate-limited, resumable MotionSites asset fetcher.
 *
 * Re-harvests NEW prompt templates and downloads media that isn't saved yet, skipping
 * anything already on disk. Built to NOT log your browser session out (see Auth notes).
 *
 * Modes (default --all):
 *   --prompts        List catalog, diff vs saved, fetch text for NEW prompts (free=anon, paid=your token)
 *   --media          Download referenced media (videos/images/fonts) not already saved
 *   --all            Both (default)
 *   --stats          Also regenerate prompt-corpus-stats.json (best-effort)
 *
 * Flags:
 *   --dry-run                  Report what WOULD be fetched; write nothing. (No token needed.)
 *   --force                    Ignore skip logic; refetch/redownload everything in scope.
 *   --batch=N                  Max NEW prompts to fetch this run (deferred pull). Default: all.
 *   --rate-ms=N                Min ms between Supabase requests. Default 1500.
 *   --types=video,image,font   Restrict media types. Default: all three.
 *   --media-limit=N            Max media files to download this run. Default: all.
 *   --media-concurrency=N      Parallel direct downloads. Default 3.
 *   --max-bytes=N              Skip direct files larger than N bytes (still recorded). Default: none.
 *   --allow-refresh            Opt-in token refresh (WARNING: rotates refresh token, may log out browser).
 *   --no-preview-videos        Skip the per-prompt Mux preview videos (only fetch prompt-embedded media).
 *
 * Auth (only needed for NEW *paid* prompts; media + free prompts need nothing):
 *   Put a FRESH access token in .env as MOTIONSITES_BEARER (see .env.example). Capture it right
 *   before running. The script never refreshes by default, so your browser session stays valid.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

// ───────────────────────── paths & constants ─────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const P = {
  master: path.join(ROOT, 'prompts-with-text.json'),
  index: path.join(ROOT, 'prompts-index.tsv'),
  catalog: path.join(ROOT, 'catalog-current.json'),
  urlsFlat: path.join(ROOT, 'urls-found-in-prompts.txt'),
  urlsNdjson: path.join(ROOT, 'prompt-embedded-urls.ndjson'),
  stats: path.join(ROOT, 'prompt-corpus-stats.json'),
  promptsDir: path.join(ROOT, 'prompts'),
  assetsDir: path.join(ROOT, 'prompt-assets'),
  harvestManifest: path.join(ROOT, 'harvest-manifest.json'),
  dlDir: path.join(ROOT, 'downloads'),
  dlManifest: path.join(ROOT, 'downloads', 'download-manifest.json'),
};

loadEnv(path.join(ROOT, '.env'));

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://xgdzyqfalbibzelpdpvr.supabase.co').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnZHp5cWZhbGJpYnplbHBkcHZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MzUwMDYsImV4cCI6MjA4NzQxMTAwNn0.u8lH5Y14xx2WxrNEBp8ngkJlijIYHJASq_gOzTaINZY';
const PROMPT_COLS = 'id,title,category,type,page_type,is_free,sort_order,created_at,image_preview_url,video_preview_url';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const REFERER = 'https://motionsites.ai/';

// ───────────────────────── arg parsing ─────────────────────────
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const opt = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : dflt;
};
const num = (name, dflt) => { const v = opt(name, null); return v == null ? dflt : Number(v); };

const MODE = {
  prompts: has('--prompts') || has('--all') || (!has('--prompts') && !has('--media')),
  media: has('--media') || has('--all') || (!has('--prompts') && !has('--media')),
  stats: has('--stats'),
};
const DRY = has('--dry-run');
const FORCE = has('--force');
const ALLOW_REFRESH = has('--allow-refresh');
const RETRY_FAILED = has('--retry-failed');
const NO_PREVIEW_VIDEOS = has('--no-preview-videos');
const BATCH = num('batch', Infinity);
const RATE_MS = num('rate-ms', 1500);
const MEDIA_LIMIT = num('media-limit', Infinity);
const MEDIA_CONC = Math.max(1, num('media-concurrency', 3));
const MAX_BYTES = num('max-bytes', Infinity);
const TYPES = new Set(String(opt('types', 'video,image,font')).split(',').map((s) => s.trim()).filter(Boolean));

let USER_TOKEN = process.env.MOTIONSITES_BEARER || null;
let REFRESH_TOKEN = process.env.MOTIONSITES_REFRESH_TOKEN || null;
const COOKIE = process.env.MOTIONSITES_COOKIE || null;

// ───────────────────────── tiny utils ─────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const warn = (...a) => console.warn(...a);
const nowIso = () => new Date().toISOString();
const sha256File = (f) => new Promise((res, rej) => {
  const h = crypto.createHash('sha256'); const s = fs.createReadStream(f);
  s.on('error', rej); s.on('data', (d) => h.update(d)); s.on('end', () => res(h.digest('hex')));
});

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] == null) process.env[m[1]] = v;
  }
}
function readJson(file, dflt) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return dflt; } }
function writeJsonAtomic(file, obj, pretty = true) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, pretty ? JSON.stringify(obj, null, 2) : JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

// ───────────────────────── rate-limited fetch w/ backoff ─────────────────────────
let lastSupaCall = 0;
async function throttle() {
  const wait = RATE_MS - (Date.now() - lastSupaCall);
  if (wait > 0) await sleep(wait);
  lastSupaCall = Date.now();
}
/** thunk must return a fresh fetch() promise each call (so retries re-request). */
async function withBackoff(thunk, { label = 'request', maxRetries = 5 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try { res = await thunk(); }
    catch (e) {
      if (attempt >= maxRetries) throw e;
      const w = Math.min(60000, 1000 * 2 ** attempt);
      warn(`  ⏳ ${label}: network error (${e.message}); retry in ${Math.round(w / 1000)}s`);
      await sleep(w); continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      const ra = parseInt(res.headers.get('retry-after') || '', 10);
      const w = Number.isFinite(ra) ? ra * 1000 : Math.min(60000, 1000 * 2 ** attempt);
      warn(`  ⏳ ${label}: HTTP ${res.status}; backing off ${Math.round(w / 1000)}s (attempt ${attempt + 1})`);
      await sleep(w); continue;
    }
    return res;
  }
}
async function supaFetch(url, init = {}, label = 'supabase') {
  await throttle();
  return withBackoff(() => fetch(url, init), { label });
}

// ───────────────────────── auth ─────────────────────────
function authHeaders(useUserToken) {
  const h = { apikey: ANON, Authorization: `Bearer ${(useUserToken && USER_TOKEN) || ANON}` };
  if (COOKIE) h.Cookie = COOKIE;
  return h;
}
async function tryRefresh() {
  if (!ALLOW_REFRESH || !REFRESH_TOKEN) return false;
  warn('  🔁 --allow-refresh: rotating refresh token (this may sign your browser out)…');
  const res = await supaFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: REFRESH_TOKEN }),
  }, 'auth/refresh');
  if (!res.ok) { warn(`  ⚠ refresh failed: HTTP ${res.status}`); return false; }
  const j = await res.json();
  if (!j.access_token) return false;
  USER_TOKEN = j.access_token;
  REFRESH_TOKEN = j.refresh_token || REFRESH_TOKEN;
  log('  ✓ token refreshed.');
  return true;
}

// ───────────────────────── supabase reads ─────────────────────────
async function fetchCatalog() {
  const all = []; const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const res = await supaFetch(
      `${SUPABASE_URL}/rest/v1/prompts?select=${PROMPT_COLS}&order=created_at.desc`,
      { headers: { ...authHeaders(false), Range: `${from}-${to}`, 'Range-Unit': 'items' } },
      'rest/prompts',
    );
    if (res.status !== 200 && res.status !== 206) throw new Error(`catalog HTTP ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}
/** Returns {status, locked, data}. locked=true => paid/expired/insufficient. */
async function fetchPromptText(slug) {
  const res = await supaFetch(`${SUPABASE_URL}/functions/v1/get-prompt`, {
    method: 'POST',
    headers: { ...authHeaders(true), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt_id: slug }),
  }, `fn/get-prompt(${slug})`);
  let data = {}; try { data = await res.json(); } catch { /* */ }
  const locked = res.status === 401 || res.status === 403 ||
    data?.code === 'paid_only' || data?.error === 'Paid prompt' ||
    (data?.prompt_text == null && !data?.sections?.length);
  return { status: res.status, locked, data };
}

// ───────────────────────── url extraction & classify ─────────────────────────
const URL_RE = /https?:\/\/[^\s"'`)<>\]\\}]+/g;
function extractUrls(text) {
  if (!text) return [];
  const out = new Set();
  for (const m of text.matchAll(URL_RE)) {
    let u = m[0].replace(/[.,;:!?'")\]]+$/, '');
    if (u.length > 8) out.add(u);
  }
  return [...out];
}
function classify(url) {
  let u; try { u = new URL(url); } catch { return 'other'; }
  const p = u.pathname.toLowerCase();
  const host = u.hostname.toLowerCase();
  if (/\.(mp4|webm|mov|m4v|avi|mkv|m3u8)$/.test(p) || host.includes('stream.mux.com') || host.includes('cloudflarestream.com')) return 'video';
  if (/\.(jpe?g|png|gif|webp|avif|svg|bmp|ico)$/.test(p)) return 'image';
  if (/\.(woff2?|ttf|otf|eot)$/.test(p)) return 'font';
  if (/(res\.cloudinary\.com|images\.pexels\.com|images\.unsplash\.com|i\.pravatar\.cc|picsum\.photos|api\.dicebear\.com|images\.higgs\.ai|cdn\.prod\.website-files\.com|assets\.website-files\.com|media\.cleanshot\.cloud)/.test(host)) return 'image';
  return 'other';
}
const isMux = (url) => /stream\.mux\.com/.test(url) || /\.m3u8(\?|$)/.test(url);
const muxId = (url) => (url.match(/stream\.mux\.com\/([^./?]+)/) || [])[1] || null;

function destFor(url, type) {
  const dir = path.join(P.dlDir, `${type}s`);
  const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 8);
  if (isMux(url)) return path.join(dir, `mux_${muxId(url) || hash}.mp4`);
  let u; try { u = new URL(url); } catch { u = null; }
  let base = u ? path.basename(u.pathname) : 'asset';
  base = base.split('?')[0] || 'asset';
  let ext = path.extname(base);
  let stem = base.slice(0, base.length - ext.length).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60) || 'asset';
  const host = (u ? u.hostname : 'cdn').replace(/[^a-z0-9.]/gi, '_');
  return path.join(dir, `${host}__${stem}_${hash}${ext}`);
}
const PERMA_HTTP = new Set([400, 401, 403, 404, 405, 410]);
// A failure we should NOT keep retrying (dead/private/protected). Transient (timeout,
// connection refused, 5xx, network) returns false so it stays retryable on re-run.
function isPermanentFailure(r) {
  if (!r || r.status === 'ok') return false;
  if (PERMA_HTTP.has(r.http)) return true;
  return /\b(400|401|403|404|410)\b|Bad Request|Not Found|Forbidden|Unauthorized/i.test(r.error || '');
}
const extFromContentType = (ct) => ({
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
  'image/avif': '.avif', 'image/svg+xml': '.svg', 'video/mp4': '.mp4', 'video/webm': '.webm',
  'font/woff2': '.woff2', 'font/woff': '.woff', 'font/ttf': '.ttf', 'font/otf': '.otf',
  'application/font-woff2': '.woff2',
}[(ct || '').split(';')[0].trim().toLowerCase()] || '');

// ───────────────────────── downloads ─────────────────────────
async function downloadDirect(url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const H = { 'User-Agent': BROWSER_UA, Referer: REFERER, Accept: '*/*' };
  let res = await withBackoff(() => fetch(url, { redirect: 'follow', headers: H }), { label: `dl ${path.basename(dest)}` });
  if (res.status === 401 || res.status === 403) { // hotlink protection: retry without referer
    res = await withBackoff(() => fetch(url, { redirect: 'follow', headers: { 'User-Agent': BROWSER_UA, Accept: '*/*' } }), { label: `dl(no-ref) ${path.basename(dest)}` });
  }
  if (!res.ok) return { status: 'error', http: res.status, error: `HTTP ${res.status}` };
  const len = Number(res.headers.get('content-length') || 0);
  if (Number.isFinite(MAX_BYTES) && len > MAX_BYTES) return { status: 'skipped_too_large', http: res.status, bytes: len };
  let finalDest = dest;
  if (!path.extname(finalDest)) finalDest += extFromContentType(res.headers.get('content-type'));
  const tmp = `${finalDest}.part`;
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
  fs.renameSync(tmp, finalDest);
  const bytes = fs.statSync(finalDest).size;
  if (bytes < 64) { fs.unlinkSync(finalDest); return { status: 'error', http: res.status, error: `tiny (${bytes}b)` }; }
  return { status: 'ok', http: res.status, dest: finalDest, bytes, sha256: await sha256File(finalDest) };
}
function downloadHls(url, dest) {
  return new Promise((resolve) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.part.mp4`;
    const cp = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-user_agent', BROWSER_UA, '-headers', `Referer: ${REFERER}\r\n`, '-i', url, '-c', 'copy', '-bsf:a', 'aac_adtstoasc', tmp], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    cp.stderr.on('data', (d) => { err += d; });
    cp.on('error', (e) => resolve({ status: 'error', error: `spawn: ${e.message}` }));
    cp.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(tmp)) {
        try { fs.existsSync(tmp) && fs.unlinkSync(tmp); } catch { /* */ }
        return resolve({ status: 'error', error: `ffmpeg: ${err.trim().slice(0, 160)}` });
      }
      fs.renameSync(tmp, dest);
      resolve({ status: 'ok', dest, bytes: fs.statSync(dest).size });
    });
  });
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

// ───────────────────────── per-prompt file + index writers ─────────────────────────
function writePromptFiles(rec) {
  if (DRY) return;
  fs.mkdirSync(P.promptsDir, { recursive: true });
  fs.mkdirSync(P.assetsDir, { recursive: true });
  fs.writeFileSync(path.join(P.promptsDir, `${rec.id}.txt`), rec.prompt_text || '');
  const { prompt_text, ...meta } = rec;
  writeJsonAtomic(path.join(P.assetsDir, `${rec.id}.json`), meta);
}
function regenIndex(masterPrompts) {
  if (DRY) return;
  const rows = masterPrompts.map((p) => [
    p.id, p.title ?? '', p.category ?? '', p.type ?? '', p.page_type ?? '',
    String(!!p.is_free), String((p.prompt_text || '').length),
  ].map((c) => String(c).replace(/\t/g, ' ').replace(/\n/g, ' ')).join('\t'));
  fs.writeFileSync(P.index, rows.join('\n') + '\n');
}
function appendUrlLists(newEntries) {
  // newEntries: [{id,title,urls:[...]}]
  if (DRY || !newEntries.length) return;
  const existing = new Set(fs.existsSync(P.urlsFlat) ? fs.readFileSync(P.urlsFlat, 'utf8').split('\n').filter(Boolean) : []);
  const freshFlat = [];
  for (const e of newEntries) for (const u of e.urls) if (!existing.has(u)) { existing.add(u); freshFlat.push(u); }
  if (freshFlat.length) fs.appendFileSync(P.urlsFlat, freshFlat.join('\n') + '\n');
  fs.appendFileSync(P.urlsNdjson, newEntries.map((e) => JSON.stringify(e)).join('\n') + '\n');
}

// ───────────────────────── main ─────────────────────────
(async function main() {
  log(`\n🌱 MotionSites fetch — ${DRY ? 'DRY RUN' : 'LIVE'} | modes: ${Object.entries(MODE).filter(([, v]) => v).map(([k]) => k).join('+')}`);
  log(`   rate=${RATE_MS}ms  batch=${BATCH === Infinity ? 'all' : BATCH}  media-limit=${MEDIA_LIMIT === Infinity ? 'all' : MEDIA_LIMIT}  types=${[...TYPES].join(',')}  refresh=${ALLOW_REFRESH}`);

  const master = readJson(P.master, { exported_at: nowIso(), prompts: [] });
  const savedSlugs = new Set((master.prompts || []).map((p) => p.id));
  const harvest = readJson(P.harvestManifest, { updated_at: null, prompts: {} });

  // 1) Catalog + diff
  log('\n[1] Fetching catalog…');
  const catalog = await fetchCatalog();
  if (!DRY) writeJsonAtomic(P.catalog, { fetched_at: nowIso(), count: catalog.length, prompts: catalog });
  const newPrompts = catalog.filter((p) => !savedSlugs.has(p.id));
  const newFree = newPrompts.filter((p) => p.is_free);
  const newPaid = newPrompts.filter((p) => !p.is_free);
  log(`   catalog=${catalog.length}  saved=${savedSlugs.size}  NEW=${newPrompts.length} (free=${newFree.length}, paid=${newPaid.length})`);
  if (newPrompts.length) log('   new slugs: ' + newPrompts.map((p) => `${p.id}${p.is_free ? '' : '🔒'}`).join(', '));

  // 2) Fetch NEW prompt text
  const newlySaved = [];
  if (MODE.prompts && newPrompts.length) {
    const targets = newPrompts.slice(0, BATCH === Infinity ? newPrompts.length : BATCH);
    if (!DRY) {
      log(`\n[2] Fetching text for ${targets.length} new prompt(s)…`);
      const needToken = targets.some((p) => !p.is_free);
      if (needToken && !USER_TOKEN) {
        warn('   ⚠ New PAID prompts exist but no MOTIONSITES_BEARER set. Will save free prompts now;');
        warn('     paid ones marked deferred_auth — add a fresh token to .env and re-run.');
      }
      let authStopped = false;
      for (const p of targets) {
        if (!p.is_free && authStopped) { harvest.prompts[p.id] = { is_free: false, status: 'deferred_auth', at: nowIso() }; continue; }
        if (!p.is_free && !USER_TOKEN) { harvest.prompts[p.id] = { is_free: false, status: 'deferred_auth', at: nowIso() }; continue; }
        let r = await fetchPromptText(p.id);
        if (r.locked && !p.is_free && USER_TOKEN && ALLOW_REFRESH && await tryRefresh()) r = await fetchPromptText(p.id);
        if (r.locked && !p.is_free) {
          warn(`   🔒 ${p.id}: locked (HTTP ${r.status}) — token expired/insufficient. Stopping paid fetches.`);
          harvest.prompts[p.id] = { is_free: false, status: 'deferred_auth', at: nowIso() };
          authStopped = true; continue;
        }
        if (!r.data?.prompt_text) { harvest.prompts[p.id] = { is_free: p.is_free, status: 'empty', at: nowIso() }; warn(`   ∅ ${p.id}: no text returned`); continue; }
        const rec = {
          id: p.id, title: p.title, category: p.category, sort_order: p.sort_order,
          type: p.type, types: null, created_at: p.created_at, page_type: p.page_type,
          row_span: 1, is_free: p.is_free, image_preview_url: p.image_preview_url,
          video_preview_url: p.video_preview_url, prompt_text: r.data.prompt_text,
          sections: r.data.sections || [], section_names: r.data.section_names || [],
        };
        master.prompts.push(rec);
        writePromptFiles(rec);
        newlySaved.push(rec);
        harvest.prompts[p.id] = { is_free: p.is_free, status: 'ok', chars: rec.prompt_text.length, at: nowIso() };
        log(`   ✓ ${p.id} (${rec.prompt_text.length} chars)`);
      }
      // persist prompt-side outputs
      if (newlySaved.length) {
        fs.copyFileSync(P.master, P.master + '.bak');
        master.count = master.prompts.length; master.updated_at = nowIso();
        writeJsonAtomic(P.master, master, false);
        regenIndex(master.prompts);
        appendUrlLists(newlySaved.map((r) => ({ id: r.id, title: r.title, urls: extractUrls(r.prompt_text) })));
      }
      harvest.updated_at = nowIso();
      writeJsonAtomic(P.harvestManifest, harvest);
    } else {
      log(`\n[2] (dry) would fetch text for ${targets.length} new prompt(s); ${targets.filter((p) => !p.is_free).length} paid need your token.`);
    }
  } else if (MODE.prompts) {
    log('\n[2] No new prompts to fetch.');
  }

  // 3) Media
  if (MODE.media) {
    log('\n[3] Building media set…');
    const dlManifest = readJson(P.dlManifest, { updated_at: null, assets: {} });
    const urlSet = new Set();
    const cleanUrl = (u) => u.trim().replace(/[.,;:!?'"`)\]}>]+$/, ''); // strip trailing-punctuation artifacts
    // a) URLs embedded in prompt text (existing flat list + newly saved)
    if (fs.existsSync(P.urlsFlat)) for (const u of fs.readFileSync(P.urlsFlat, 'utf8').split('\n')) { const c = cleanUrl(u); if (c.length > 8 && /^https?:\/\//.test(c)) urlSet.add(c); }
    for (const r of newlySaved) for (const u of extractUrls(r.prompt_text)) urlSet.add(u);
    // b) per-prompt preview videos / images from current catalog
    if (!NO_PREVIEW_VIDEOS) for (const p of catalog) { if (p.video_preview_url) urlSet.add(p.video_preview_url); if (p.image_preview_url) urlSet.add(p.image_preview_url); }

    const candidates = [];
    for (const url of urlSet) {
      const type = classify(url);
      if (!TYPES.has(type)) continue; // skips 'other' and filtered types
      const dest = destFor(url, type);
      const done = dlManifest.assets[url];
      const onDisk = done?.dest && fs.existsSync(done.dest) && fs.statSync(done.dest).size > 0;
      if (!FORCE && done?.status === 'ok' && onDisk) continue;
      if (!FORCE && !RETRY_FAILED && done && done.status !== 'ok' && done.permanent) continue; // skip known-dead/private/protected
      candidates.push({ url, type, dest });
    }
    const byType = (t) => candidates.filter((c) => c.type === t).length;
    log(`   media URLs: ${urlSet.size} total | candidates to fetch: ${candidates.length} (video=${byType('video')}, image=${byType('image')}, font=${byType('font')})`);

    if (!DRY && candidates.length) {
      const batch = candidates.slice(0, MEDIA_LIMIT === Infinity ? candidates.length : MEDIA_LIMIT);
      const direct = batch.filter((c) => !isMux(c.url));
      const hls = batch.filter((c) => isMux(c.url));
      log(`\n   downloading ${batch.length} (direct=${direct.length} @conc${MEDIA_CONC}, hls=${hls.length} via ffmpeg)…`);
      let ok = 0, fail = 0, n = 0;
      const record = (url, type, r) => {
        dlManifest.assets[url] = { type, dest: r.dest ? path.relative(ROOT, r.dest) : null, bytes: r.bytes ?? null, sha256: r.sha256 ?? null, status: r.status, http: r.http ?? null, error: r.error ?? null, permanent: isPermanentFailure(r) || undefined, fetched_at: nowIso() };
        if (r.status === 'ok') ok++; else fail++;
      };
      await pool(direct, MEDIA_CONC, async (c) => {
        let r; try { r = await downloadDirect(c.url, c.dest); } catch (e) { r = { status: 'error', error: e.message }; }
        record(c.url, c.type, r);
        if ((++n) % 10 === 0 || r.status !== 'ok') log(`     [${n}/${batch.length}] ${r.status} ${c.type} ${path.basename(r.dest || c.dest)}${r.error ? ' — ' + r.error : ''}`);
        if (n % 25 === 0) writeJsonAtomic(P.dlManifest, { ...dlManifest, updated_at: nowIso() });
      });
      const HLS_CONC = Math.min(4, Math.max(1, MEDIA_CONC));
      await pool(hls, HLS_CONC, async (c) => {
        let r; try { r = await downloadHls(c.url, c.dest); } catch (e) { r = { status: 'error', error: e.message }; }
        record(c.url, c.type, r);
        if ((++n) % 10 === 0 || r.status !== 'ok') log(`     [hls ${n}/${batch.length}] ${r.status} ${path.basename(c.dest)}${r.error ? ' — ' + r.error : ''}`);
        if (n % 15 === 0) writeJsonAtomic(P.dlManifest, { ...dlManifest, updated_at: nowIso() });
      });
      dlManifest.updated_at = nowIso();
      writeJsonAtomic(P.dlManifest, dlManifest);
      log(`   media done: ok=${ok} fail=${fail}. Re-run to retry failures / continue deferred batches.`);
    } else if (DRY) {
      log('   (dry) no downloads performed.');
    } else {
      log('   nothing missing — all in-scope media already saved. ✓');
    }
  }

  // 4) Stats (best-effort)
  if (MODE.stats && !DRY) {
    try { regenStats(master.prompts); log('\n[4] prompt-corpus-stats.json regenerated.'); }
    catch (e) { warn(`\n[4] stats regen skipped: ${e.message}`); }
  }

  log('\n✅ Done.\n');
})().catch((e) => { console.error('\n❌ Fatal:', e.stack || e.message); process.exit(1); });

function regenStats(prompts) {
  const lens = prompts.map((p) => (p.prompt_text || '').length).filter((n) => n > 0).sort((a, b) => a - b);
  const median = lens.length ? lens[Math.floor(lens.length / 2)] : 0;
  const tally = (key) => { const m = new Map(); for (const p of prompts) { const v = p[key]; if (v == null) continue; m.set(v, (m.get(v) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const domains = new Map();
  for (const p of prompts) for (const u of extractUrls(p.prompt_text)) { try { const h = new URL(u).hostname; domains.set(h, (domains.get(h) || 0) + 1); } catch { /* */ } }
  writeJsonAtomic(P.stats, {
    generated_at: nowIso(),
    count: prompts.length,
    length: { min: lens[0] || 0, median, mean: lens.length ? +(lens.reduce((a, b) => a + b, 0) / lens.length).toFixed(2) : 0, max: lens[lens.length - 1] || 0 },
    page_types: tally('page_type'), types: tally('type'), categories: tally('category'),
    top_domains: [...domains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40),
  });
}
