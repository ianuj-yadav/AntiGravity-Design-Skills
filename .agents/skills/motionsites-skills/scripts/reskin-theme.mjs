#!/usr/bin/env node
/**
 * reskin-theme.mjs — #4: codegen for component-spec (Tailwind-v4 @theme) templates.
 *
 * These are multi-file (index.css with @theme tokens + App.tsx component). Reskin =
 *   - index.css: remap @theme font tokens → brand fonts (+ font @import), append brand :root vars.
 *   - App.tsx:   tokenize colors by role (same var(--role, default) approach as the single-file
 *                tokenizer) + apply copy overrides.
 * Cleaner than single-file string-tokenization because fonts already live in @theme; only the
 * App's inline colors need role-tokenizing. Writes .bak backups (restore with --restore).
 *
 * Usage: node scripts/reskin-theme.mjs <srcDir> [brandKit] [--restore]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] || '/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/shamoni-landing/src';
const brandPath = (process.argv[3] && !process.argv[3].startsWith('--')) ? process.argv[3] : 'brand-kits/thoughtseed.json';
const RESTORE = process.argv.includes('--restore');
const cssPath = path.join(SRC, 'index.css');
const appPath = path.join(SRC, 'App.tsx');

if (RESTORE) {
  for (const f of [cssPath, appPath]) if (fs.existsSync(f + '.bak')) { fs.copyFileSync(f + '.bak', f); fs.unlinkSync(f + '.bak'); console.log('restored', path.basename(f)); }
  process.exit(0);
}

const brand = JSON.parse(fs.readFileSync(path.join(ROOT, brandPath), 'utf8'));
const P = brand.palette;
const stat = {};

// ── index.css: fonts + brand :root ──
let css = fs.readFileSync(cssPath, 'utf8');
fs.writeFileSync(cssPath + '.bak', css);
const bodyNative = 'Manrope'; // shamoni's @theme --font-sans; generalize via brand mapping below
for (const [role, fam] of [['sans', brand.fonts.body], ['serif', brand.fonts.display], ['script', brand.fonts.accent]]) {
  if (!fam) continue;
  const m = css.match(new RegExp(`--font-${role}:\\s*"([^"]+)"`));
  if (m && m[1].toLowerCase() !== fam.toLowerCase()) { const n = css.split(m[1]).length - 1; css = css.split(m[1]).join(fam); stat[`font:${m[1]}→${fam}`] = n; }
}
if (!css.includes(':root{') && !css.includes(':root {')) css += `\n:root{--bg:${P.bg};--surface:${P.surface || P.bg};--fg:${P.fg};--border:${P.border};--accent:${P.accent};--accent2:${P.accent2 || P.accent};}\n`;
fs.writeFileSync(cssPath, css);

// ── App.tsx: color tokenization + copy ──
let app = fs.readFileSync(appPath, 'utf8');
fs.writeFileSync(appPath + '.bak', app);
// accent literals (template-specific) → var(--accent)
for (const lit of ['#FDFFB7', '#fdffb7']) { if (app.includes(lit)) { const n = app.split(lit).length - 1; app = app.split(lit).join(`var(--accent, ${lit})`); stat[`accent:${lit}→--accent`] = n; } }
// Tailwind utilities (full-opacity only)
const UTIL = [[/\bbg-black\b(?!\/)/g, 'bg-[var(--bg)]'], [/\bbg-white\b(?!\/)/g, 'bg-[var(--surface)]'], [/\btext-black\b(?!\/)/g, 'text-[var(--fg)]'], [/\btext-white\b(?!\/)/g, 'text-[var(--fg)]'], [/\bborder-black\b(?!\/)/g, 'border-[var(--border)]']];
for (const [re, rep] of UTIL) { const n = (app.match(re) || []).length; if (n) { app = app.replace(re, rep); stat['util:' + rep] = (stat['util:' + rep] || 0) + n; } }
// inline hex by property
const C = '(#[0-9a-fA-F]{3,8}|rgba?\\([^)]*\\))';
const byProp = (re, role) => { let n = 0; app = app.replace(re, (m, p, q, v) => { n++; return `${p}${q || ''}var(--${role}, ${v})${q || ''}`; }); if (n) stat['prop→--' + role] = (stat['prop→--' + role] || 0) + n; };
byProp(new RegExp(`(background(?:Color|-color)?\\s*:\\s*)(["'])?${C}\\2?`, 'g'), 'bg');
byProp(new RegExp(`((?<![-\\w])color\\s*:\\s*)(["'])?${C}\\2?`, 'g'), 'fg');
byProp(new RegExp(`(\\b(?:fill|stroke)=)(["'])${C}\\2`, 'g'), 'fg');
// copy
const copyMap = (brand.copyOverrides && brand.copyOverrides['shamoni']) || { Shamoni: 'Thoughtseed' };
for (const [f, t] of Object.entries(copyMap).sort((a, b) => b[0].length - a[0].length)) { const n = app.split(f).length - 1; if (n) { app = app.split(f).join(t); stat[`copy:"${f.slice(0, 18)}"`] = n; } }
fs.writeFileSync(appPath, app);

console.log(`reskin-theme: ${path.basename(path.dirname(SRC))} → ${brand.name}`);
for (const [k, v] of Object.entries(stat)) console.log(`  ${String(v).padStart(3)} × ${k}`);
console.log('  backups: index.css.bak, App.tsx.bak (restore: --restore)');
