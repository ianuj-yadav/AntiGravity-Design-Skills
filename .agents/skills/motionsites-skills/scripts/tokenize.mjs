#!/usr/bin/env node
/**
 * tokenize.mjs — the keystone: additive role-tokenization for a FULL palette reskin.
 *
 * Rewrites a template's hardcoded colors into `var(--role, <original>)` keyed by CSS ROLE
 * (the property/utility tells the role: background→--bg/--surface, color/fill/stroke→--fg,
 * border→--border, the template's accent values→--accent*), then injects the brand's :root.
 *
 * Because each occurrence is tokenized by role, light→dark polarity flips correctly and contrast
 * is preserved — the thing plain value-replacement can't do (a literal #000 that is both a
 * background and a text color resolves to --bg in one place and --fg in another). Original values
 * stay as the var fallback, so the template is still template-ready with no :root override.
 *
 * v1 scope: Tailwind black/white utilities (by prefix), inline-style + CSS hex/rgba (by property),
 * SVG fill/stroke, and the interface's accent values. Opacity modifiers on utilities are dropped
 * (acceptable v1). Usage: node scripts/tokenize.mjs [templateId] [brandKit]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2] || 'luxury-botanical';
const brandPath = (process.argv[3] && !process.argv[3].startsWith('--')) ? process.argv[3] : 'brand-kits/thoughtseed.json';
const BIND = process.argv.includes('--bind'); // M1: swap source asset URLs for brand-pool picks

let out = fs.readFileSync(path.join(ROOT, 'prompts', id + '.txt'), 'utf8');
const iface = JSON.parse(fs.readFileSync(path.join(ROOT, 'interfaces', id + '.json'), 'utf8'));
const brand = JSON.parse(fs.readFileSync(path.join(ROOT, brandPath), 'utf8'));
const cr = (iface.skin && iface.skin.colorRoles) || {};
const fr = (iface.skin && iface.skin.fontRoles) || {};
const stat = {};

// ── M3 fonts (role remap, same as reskin.mjs) ──
for (const [role, native] of Object.entries(fr)) {
  const bf = brand.fonts[role]; if (!bf || !native) continue;
  const name = String(native).replace(/^["']|["'].*$/g, '').trim();
  if (name && name.toLowerCase() !== bf.toLowerCase()) { const n = (out.split(name).length - 1); out = out.split(name).join(bf); stat['font:' + name + '→' + bf] = n; }
}

// ── #3 M1 asset binding: replace source asset URLs with brand-pool picks (original URLs) ──
if (BIND) {
  const feat = JSON.parse(fs.readFileSync(path.join(ROOT, 'asset-features.json'), 'utf8')).assets;
  const manPath = path.join(ROOT, 'downloads', 'download-manifest.json');
  const man = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')).assets : {};
  const destToUrl = {}; for (const [url, a] of Object.entries(man)) if (a && a.dest && a.status === 'ok') destToUrl[a.dest] = url;
  const pool = Object.entries(feat).map(([rel, a]) => ({ rel, url: destToUrl[rel], ...a })).filter((a) => a.url);
  const RATIO = { '16:9': 16 / 9, '1:1': 1, '9:16': 9 / 16, '4:3': 4 / 3, '3:4': 3 / 4, landscape: 1.6, portrait: 0.62, ultrawide: 2.4, 'square-ish': 1 };
  const sr = (s) => RATIO[s.aspect] ?? (String(s.aspect || '').match(/^(\d+):(\d+)$/) ? (+RegExp.$1 / +RegExp.$2) : null);
  const used = new Set();
  const pickFor = (slot) => {
    const want = sr(slot);
    const ranked = pool.filter((a) => a.type === slot.type && !used.has(a.url))
      .map((a) => ({ url: a.url, d: (want && a.aspect ? Math.abs(Math.log(want / a.aspect)) : 0) + (slot.alpha && !a.hasAlpha ? 1 : 0) }))
      .sort((x, y) => x.d - y.d);
    const picks = []; for (let k = 0; k < (slot.card || 1) && k < ranked.length; k++) { used.add(ranked[k].url); picks.push(ranked[k].url); }
    return picks;
  };
  const imgPicks = [], vidPicks = [];
  for (const slot of iface.slots) { if (slot.type === 'image') imgPicks.push(...pickFor(slot)); else if (slot.type === 'video') vidPicks.push(...pickFor(slot)); }
  let ii = 0, vi = 0, nb = 0;
  out = out.replace(/https?:\/\/[^\s"'`)]+\.(?:webp|png|jpe?g|gif|avif)(?:\?[^\s"'`)]*)?/gi, (u) => { const p = imgPicks[ii++]; if (p) { nb++; return p; } return u; });
  out = out.replace(/https?:\/\/[^\s"'`)]+\.(?:mp4|webm|m3u8)(?:\?[^\s"'`)]*)?/gi, (u) => { const p = vidPicks[vi++]; if (p) { nb++; return p; } return u; });
  stat[`bind:asset-urls→brand-pool`] = nb;
}

// ── accent values (template-specific) → brand accent var ──
for (const role of ['accent', 'accent2']) {
  const v = cr[role]; if (!v) continue;
  const n = out.split(v).length - 1; if (!n) continue;
  out = out.split(v).join(`var(--${role}, ${v})`); stat[`accent:${v}→--${role}`] = n;
}

// ── Tailwind utilities by prefix (role from prefix; drop /opacity) ──
// only FULL-opacity utilities; /opacity variants (bg-white/15 glass, bg-black/10 scrims) keep their look
const UTIL = [
  [/\bbg-black\b(?!\/)/g, 'bg-[var(--bg)]'],
  [/\bbg-white\b(?!\/)/g, 'bg-[var(--surface)]'],
  [/\btext-black\b(?!\/)/g, 'text-[var(--fg)]'],
  [/\btext-white\b(?!\/)/g, 'text-[var(--fg)]'],
  [/\bborder-black\b(?!\/)/g, 'border-[var(--border)]'],
  [/\bborder-white\b(?!\/)/g, 'border-[var(--border)]'],
  [/\bfill-(?:black|white)\b/g, 'fill-[var(--fg)]'],
];
for (const [re, rep] of UTIL) { const n = (out.match(re) || []).length; if (n) { out = out.replace(re, rep); stat['util:' + rep] = (stat['util:' + rep] || 0) + n; } }

// ── inline-style + CSS hex/rgba by property → role ──
const COLOR = '(#[0-9a-fA-F]{3,8}|rgba?\\([^)]*\\))';
const byProp = (re, role, label) => { let n = 0; out = out.replace(re, (m, p, q, v) => { n++; return `${p}${q || ''}var(--${role}, ${v})${q || ''}`; }); if (n) stat['prop:' + label + '→--' + role] = n; };
byProp(new RegExp(`(background(?:Color|-color)?\\s*:\\s*)(["'])?${COLOR}\\2?`, 'g'), 'bg', 'background');
byProp(new RegExp(`(border(?:Color|-color)?\\s*:\\s*)(["'])?${COLOR}\\2?`, 'g'), 'border', 'border');
byProp(new RegExp(`((?<![-\\w])color\\s*:\\s*)(["'])?${COLOR}\\2?`, 'g'), 'fg', 'color');
byProp(new RegExp(`(\\b(?:fill|stroke)=)(["'])${COLOR}\\2`, 'g'), 'fg', 'fill/stroke');

// ── copy → brand voice (unambiguous overrides, longest-first) ──
const copyMap = (brand.copyOverrides && brand.copyOverrides[id]) || {};
for (const [from, to] of Object.entries(copyMap).sort((a, b) => b[0].length - a[0].length)) {
  const n = out.split(from).length - 1; if (!n) continue;
  out = out.split(from).join(to); stat[`copy:"${from.slice(0, 22)}${from.length > 22 ? '…' : ''}"`] = n;
}

// ── media scrim: darken text-over-video sections for legibility ──
const P = brand.palette;
const rgb = (h) => { const m = String(h).replace('#', '').match(/.{2}/g); return m ? m.map((x) => parseInt(x, 16)) : [5, 5, 5]; };
const [sr, sg, sb] = rgb(P.bg || '#050505');
const scrim = `<div className="absolute inset-0 z-[1] pointer-events-none" style={{background:"linear-gradient(180deg, rgba(${sr},${sg},${sb},0.6) 0%, rgba(${sr},${sg},${sb},0.18) 36%, rgba(${sr},${sg},${sb},0.18) 64%, rgba(${sr},${sg},${sb},0.66) 100%)"}}></div>`;
if (out.includes('</video>')) { out = out.replace('</video>', `</video>\n${scrim}`); stat['scrim:over-video'] = 1; }

// ── inject brand :root ──
const root = `:root{--bg:${P.bg};--surface:${P.surface || P.bg};--fg:${P.fg};--fgMuted:${P.fgMuted};--border:${P.border};--accent:${P.accent};--accent2:${P.accent2 || P.accent};}`;
if (out.includes('<style>')) out = out.replace('<style>', `<style>\n${root}\n`);
else out = out.replace('</head>', `<style>${root}</style>\n</head>`);

const outDir = path.join(ROOT, 'reskins'); fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${id}__${brand.name.toLowerCase()}__tokenized.html`);
fs.writeFileSync(outFile, out);
console.log(`tokenize: ${id} → ${brand.name} (full-palette, polarity-aware)`);
for (const [k, v] of Object.entries(stat)) console.log(`  ${v.toString().padStart(3)} × ${k}`);
console.log(`  injected :root with brand --bg/--surface/--fg/--border/--accent`);
console.log(`  → ${path.relative(ROOT, outFile)}`);
