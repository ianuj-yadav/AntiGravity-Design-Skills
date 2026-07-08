#!/usr/bin/env node
/**
 * extract-asset-features.mjs — Phase 1: compute the M1 feature vector for every media asset.
 *
 * For each file under assets/: type, template, kind (preview|embedded), dims, aspect, alpha,
 * duration (video), and average color in sRGB + CIELAB (the M1 color term / M2 input).
 * Uses ffprobe (metadata) + ffmpeg (1x1 average color). Vector formats (svg) and fonts get no
 * raster features. Semantic embeddings are deferred (v2). Writes asset-features.json.
 *
 * Usage: node scripts/extract-asset-features.mjs [--concurrency=8]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'assets');
const OUT = path.join(ROOT, 'asset-features.json');
const CONC = Math.max(1, Number((process.argv.find(a => a.startsWith('--concurrency=')) || '').split('=')[1]) || 8);

const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi']);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'bmp', 'ico']);
const FONT_EXT = new Set(['woff', 'woff2', 'ttf', 'otf', 'eot']);

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.isFile() && !e.name.endsWith('.json')) acc.push(p);
  }
  return acc;
}
function run(cmd, args, binary = false) {
  return new Promise((resolve) => {
    const cp = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    const out = []; cp.stdout.on('data', d => out.push(d));
    cp.on('error', () => resolve({ code: -1, out: binary ? Buffer.alloc(0) : '' }));
    cp.on('close', (code) => resolve({ code, out: binary ? Buffer.concat(out) : Buffer.concat(out).toString() }));
  });
}
function rgb2lab(r, g, b) {
  const lin = v => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let Y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
  let Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = v => v > 0.008856 ? Math.cbrt(v) : (7.787 * v + 16 / 116);
  [X, Y, Z] = [f(X), f(Y), f(Z)];
  return [+(116 * Y - 16).toFixed(2), +(500 * (X - Y)).toFixed(2), +(200 * (Y - Z)).toFixed(2)];
}
const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
function aspectLabel(w, h) {
  if (!w || !h) return 'unknown';
  const r = w / h;
  const near = (a, b) => Math.abs(a - b) < 0.06;
  if (near(r, 1)) return '1:1';
  if (near(r, 16 / 9)) return '16:9';
  if (near(r, 9 / 16)) return '9:16';
  if (near(r, 4 / 3)) return '4:3';
  if (near(r, 3 / 4)) return '3:4';
  if (r >= 2.2) return 'ultrawide';
  if (r > 1.15) return 'landscape';
  if (r < 0.85) return 'portrait';
  return 'square-ish';
}

async function feature(file) {
  const rel = path.relative(ROOT, file);
  const segs = path.relative(ASSETS, file).split(path.sep);
  const template = segs[0];
  const base = path.basename(file);
  const ext = (path.extname(file).slice(1) || '').toLowerCase();
  const kind = /^preview\./i.test(base) ? 'preview' : 'embedded';
  const bytes = fs.statSync(file).size;
  let type = VIDEO_EXT.has(ext) ? 'video' : IMAGE_EXT.has(ext) ? 'image' : FONT_EXT.has(ext) ? 'font' : 'unknown';
  const rec = { template, kind, type, format: ext || null, bytes };

  if (type === 'font') return [rel, rec];

  // metadata
  const pr = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,pix_fmt,nb_frames,codec_type:format=duration', '-of', 'json', file]);
  try {
    const j = JSON.parse(pr.out || '{}');
    const s = (j.streams || [])[0] || {};
    if (s.width) { rec.width = s.width; rec.height = s.height; rec.aspect = +(s.width / s.height).toFixed(3); rec.aspectLabel = aspectLabel(s.width, s.height); }
    if (s.pix_fmt) rec.hasAlpha = /a|pal8|rgba|ya/.test(s.pix_fmt) && /a/.test(s.pix_fmt);
    const dur = parseFloat((j.format && j.format.duration) || s.duration);
    if (type === 'unknown') type = (Number.isFinite(dur) && dur > 0.4 && Number(s.nb_frames || 2) > 1) ? 'video' : 'image';
    rec.type = type;
    if (type === 'video' && Number.isFinite(dur)) rec.duration = +dur.toFixed(2);
  } catch { /* svg / undecodable */ rec.note = 'no-probe'; }

  // average color (1x1) — skip vector svg
  if (ext !== 'svg') {
    const fm = await run('ffmpeg', ['-v', 'error', '-i', file, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], true);
    if (fm.out && fm.out.length >= 3) {
      const [r, g, b] = [fm.out[0], fm.out[1], fm.out[2]];
      rec.color = { hex: hex(r, g, b), rgb: [r, g, b], lab: rgb2lab(r, g, b) };
    }
  } else { rec.note = 'vector-svg'; }
  return [rel, rec];
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; try { out[idx] = await fn(items[idx]); } catch { out[idx] = null; } if (++done % 50 === 0) process.stderr.write(`  ${done}/${items.length}\n`); }
  }));
  return out;
}

(async () => {
  const files = walk(ASSETS);
  console.log(`Scanning ${files.length} assets (concurrency ${CONC})…`);
  const pairs = (await pool(files, CONC, feature)).filter(Boolean);
  const assets = Object.fromEntries(pairs);
  const byType = {}, withColor = { yes: 0, no: 0 };
  for (const k in assets) { const a = assets[k]; byType[a.type] = (byType[a.type] || 0) + 1; (a.color ? withColor.yes++ : withColor.no++); }
  fs.writeFileSync(OUT, JSON.stringify({ generated_at: new Date().toISOString(), count: pairs.length, byType, assets }, null, 2));
  console.log(`\n✓ asset-features.json — ${pairs.length} assets | byType ${JSON.stringify(byType)} | color: ${withColor.yes} ok / ${withColor.no} none`);
})();
