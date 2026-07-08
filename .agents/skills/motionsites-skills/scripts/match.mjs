#!/usr/bin/env node
/**
 * match.mjs — M1: greedy min-cost asset→slot assignment for one template.
 *
 * Demonstrates the M1 cost function on real data: for each owned-asset slot (image/video) in a
 * template's interface, rank the asset pool by cost = aspect-mismatch + alpha-mismatch +
 * duration-fit (+ optional color cohesion), then assign the best `card` distinct assets.
 * code/CDN slots (font/svg/icon) are skipped (skin params, not matched).
 *
 * Hungarian / min-cost-flow is the optimal upgrade; this greedy v1 proves the cost surface.
 *
 * Usage: node scripts/match.mjs [templateId=luxury-botanical] [--cohesion]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv.find(a => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1]) || 'luxury-botanical';
const COHESION = process.argv.includes('--cohesion');

const iface = JSON.parse(fs.readFileSync(path.join(ROOT, 'interfaces', id + '.json'), 'utf8'));
const feat = JSON.parse(fs.readFileSync(path.join(ROOT, 'asset-features.json'), 'utf8')).assets;
const pool = Object.entries(feat).map(([rel, a]) => ({ rel, ...a }));

const RATIO = { '16:9': 16 / 9, '9:16': 9 / 16, '4:3': 4 / 3, '3:4': 3 / 4, '1:1': 1, ultrawide: 2.4, landscape: 1.6, portrait: 0.62, 'square-ish': 1 };
function slotRatio(s) {
  if (!s.aspect || s.aspect === 'auto') return null;
  if (RATIO[s.aspect] != null) return RATIO[s.aspect];
  const m = String(s.aspect).match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  return m ? (+m[1] / +m[2]) : null;
}
const deltaE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); // CIE76 (fast); CIEDE2000 = upgrade
function cost(slot, a, centroid) {
  if (a.type !== slot.type) return Infinity; // hard type constraint
  let c = 0;
  const sr = slotRatio(slot);
  if (sr && a.aspect) c += 1.0 * Math.abs(Math.log(sr / a.aspect)); // log-ratio aspect distance
  if (slot.alpha === true && !a.hasAlpha) c += 0.8;                 // transparency requirement
  if (slot.type === 'video' && slot.loop !== false) {
    const d = a.duration || 8; c += 0.2 * Math.min(2, Math.abs(Math.log(d / 8))); // prefer ~8s loops
  }
  if (centroid && a.color) c += 0.01 * deltaE(a.color.lab, centroid); // intra-set color cohesion
  return c;
}

console.log(`M1 match — template "${id}" (role ${iface.role}) | pool ${pool.length} assets | cohesion=${COHESION}\n`);
const used = new Set();
for (const slot of iface.slots) {
  if (slot.type === 'font' || slot.type === 'svg' || slot.type === 'icon') {
    console.log(`· ${slot.id} [${slot.type} ×${slot.card || 1}] → code/CDN-supplied (skin param, skip M1)`);
    continue;
  }
  let centroid = null;
  const pick = [];
  for (let k = 0; k < (slot.card || 1); k++) {
    const ranked = pool.filter(a => !used.has(a.rel)).map(a => ({ a, c: cost(slot, a, COHESION ? centroid : null) }))
      .filter(x => x.c < Infinity).sort((x, y) => x.c - y.c);
    if (!ranked.length) break;
    const best = ranked[0]; used.add(best.a.rel); pick.push(best);
    if (COHESION && best.a.color) { // update running centroid for cohesion
      const labs = pick.filter(p => p.a.color).map(p => p.a.color.lab);
      centroid = [0, 1, 2].map(i => labs.reduce((s, l) => s + l[i], 0) / labs.length);
    }
  }
  console.log(`· ${slot.id} [${slot.type} ${slot.aspect || 'auto'}${slot.alpha ? ' alpha' : ''} ×${slot.card || 1}]  — ${slot.notes ? slot.notes.slice(0, 60) : ''}`);
  pick.forEach(p => console.log(`    cost ${p.c.toFixed(3)}  ${p.a.rel}  [${p.a.aspectLabel || '?'}${p.a.hasAlpha ? ' α' : ''}${p.a.duration ? ' ' + p.a.duration + 's' : ''}${p.a.color ? ' ' + p.a.color.hex : ''}]`));
  if (!pick.length) console.log('    (no type-compatible asset in pool)');
}
