#!/usr/bin/env node
/**
 * reskin.mjs — Phase 4 codegen (v1): apply M3 (type) + M2 (palette) brand skin to a template's
 * 1:1 source, emitting a runnable page. Structure/motion are copied verbatim; only the skin moves.
 *
 * v1 scope (safe, no false renders):
 *   - M3 type: remap each font-role's native family → the brand family (by role).
 *   - M2 palette: remap ACCENT roles (and unambiguous single-role, non-neutral colors) → brand.
 *     SKIP polarity-sensitive neutrals (bg/fg/surface used pervasively or as multiple roles) and
 *     log them — those require the additive-tokenization pass (a value that is both bg and fg, or a
 *     ubiquitous #000/#fff, can't be safely string-replaced; that's the documented next step).
 *
 * Usage: node scripts/reskin.mjs [templateId=luxury-botanical] [brandKit=brand-kits/thoughtseed.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2] || 'luxury-botanical';
const brandPath = process.argv[3] || 'brand-kits/thoughtseed.json';

const src = fs.readFileSync(path.join(ROOT, 'prompts', id + '.txt'), 'utf8');
const iface = JSON.parse(fs.readFileSync(path.join(ROOT, 'interfaces', id + '.json'), 'utf8'));
const brand = JSON.parse(fs.readFileSync(path.join(ROOT, brandPath), 'utf8'));
const fontRoles = (iface.skin && iface.skin.fontRoles) || {};
const colorRoles = (iface.skin && iface.skin.colorRoles) || {};

// ── M3: type remap (by role) ──
const fontMap = {};
for (const [role, native] of Object.entries(fontRoles)) {
  const bf = brand.fonts[role];
  if (!bf || !native) continue;
  const nativeName = String(native).replace(/^["']|["'].*$/g, '').trim(); // strip quotes / fallback list
  if (nativeName && nativeName.toLowerCase() !== bf.toLowerCase()) fontMap[nativeName] = bf;
}

// ── M2: palette remap (accent-safe v1) ──
const NEUTRAL = new Set(['#000', '#000000', '#fff', '#ffffff', 'white', 'black', 'transparent']);
const valueRoleCount = {};
for (const v of Object.values(colorRoles)) valueRoleCount[v] = (valueRoleCount[v] || 0) + 1;
const ACCENT_ROLES = new Set(['accent', 'accent2']);
const colorMap = {}; const skipped = [];
for (const [role, val] of Object.entries(colorRoles)) {
  const bv = brand.palette[role];
  if (!bv) { if (!ACCENT_ROLES.has(role)) skipped.push({ role, val, why: 'no brand value' }); continue; }
  if (ACCENT_ROLES.has(role) && !NEUTRAL.has(String(val).toLowerCase()) && valueRoleCount[val] === 1) {
    colorMap[val] = bv;                       // safe: signature accent, single role, non-neutral
  } else {
    skipped.push({ role, val, why: NEUTRAL.has(String(val).toLowerCase()) ? 'ubiquitous neutral → needs tokenization' : valueRoleCount[val] > 1 ? 'value serves multiple roles → needs tokenization' : 'polarity-sensitive neutral → needs tokenization' });
  }
}

// ── apply (literal, longest-key-first) ──
let out = src;
const apply = (map) => { for (const k of Object.keys(map).sort((a, b) => b.length - a.length)) out = out.split(k).join(map[k]); };
const before = out;
apply(fontMap); apply(colorMap);

const outDir = path.join(ROOT, 'reskins');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${id}__${brand.name.toLowerCase()}.html`);
fs.writeFileSync(outFile, out);

const subs = before.length - out.length; // net char delta (sanity)
console.log(`reskin: ${id} → ${brand.name}`);
console.log(`  M3 fonts: ${JSON.stringify(fontMap)}`);
console.log(`  M2 colors (applied): ${JSON.stringify(colorMap)}`);
console.log(`  M2 skipped (need tokenization): ${skipped.map(s => `${s.role}:${s.val} (${s.why})`).join(' | ') || 'none'}`);
console.log(`  → ${path.relative(ROOT, outFile)}  (net Δ ${subs} chars)`);
