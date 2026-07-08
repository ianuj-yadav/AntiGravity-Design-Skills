#!/usr/bin/env node
/**
 * capture-references.mjs — skill component (v2 capture pass).
 *
 * Renders each RUNNABLE template (single-file HTML prompt) and captures reference frames at key
 * scroll states → references/<id>/scroll-NNN.png. These frames are the *visual compositional
 * contract* — the asset in its place — that pairs with the interface's prose slot.notes to form the
 * generate-to-fit brief, and serves as the verify ground-truth (render brand page → diff vs these).
 *
 * Reusable + incremental: skips already-captured templates (unless --force); re-run as the corpus
 * grows. Component-spec templates (not standalone HTML) are skipped with `needs-build` (future:
 * codegen+build then capture). Same component re-points at a brand page for verification.
 *
 * Resolves Playwright from the existing landingpage-ts-2026 install (no new dependency here).
 *
 * Usage:
 *   node scripts/capture-references.mjs <id> [<id> ...]   # specific templates
 *   node scripts/capture-references.mjs --all [--force]   # whole corpus
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PW_BASE = '/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/website/landingpage-ts-2026/package.json';
const { chromium } = createRequire(PW_BASE)('playwright');

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ALL = args.includes('--all');
const STATES = [0, 0.25, 0.5, 0.75, 0.99]; // scroll fractions — the asset's role changes through scroll
const VIEWPORT = { width: 1440, height: 900 };

const ids = ALL
  ? fs.readdirSync(path.join(ROOT, 'prompts')).filter((f) => f.endsWith('.txt')).map((f) => f.replace('.txt', ''))
  : args.filter((a) => !a.startsWith('--'));

const isRunnable = (html) => /^\s*<!doctype html|^\s*<html[\s>]/i.test(html.slice(0, 300));

async function serve(html) {
  const server = http.createServer((_q, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); });
  await new Promise((r) => server.listen(0, r));
  return { url: `http://localhost:${server.address().port}/`, close: () => server.close() };
}

async function capture(browser, id) {
  const file = path.join(ROOT, 'prompts', id + '.txt');
  if (!fs.existsSync(file)) return { id, status: 'no-prompt' };
  const html = fs.readFileSync(file, 'utf8');
  if (!isRunnable(html)) return { id, status: 'needs-build' };
  const outDir = path.join(ROOT, 'references', id);
  if (!FORCE && fs.existsSync(outDir) && fs.readdirSync(outDir).some((f) => f.endsWith('.png'))) return { id, status: 'cached' };
  fs.mkdirSync(outDir, { recursive: true });

  const { url, close } = await serve(html);
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  let frames = 0;
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(2000); // let CDN React/Babel mount + fonts/video begin
    const maxScroll = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - window.innerHeight));
    for (const f of STATES) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.round(f * maxScroll));
      await page.waitForTimeout(700); // settle scroll-driven anims
      await page.screenshot({ path: path.join(outDir, `scroll-${String(Math.round(f * 100)).padStart(3, '0')}.png`) });
      frames++;
    }
    fs.writeFileSync(path.join(outDir, '_meta.json'), JSON.stringify({ id, capturedAt: new Date().toISOString(), states: STATES, viewport: VIEWPORT, maxScroll }, null, 2));
  } finally { await page.close(); await ctx.close(); close(); }
  return { id, status: 'captured', frames };
}

(async () => {
  if (!ids.length) { console.error('Usage: capture-references.mjs <id ...> | --all [--force]'); process.exit(1); }
  console.log(`capture-references: ${ALL ? 'ALL (' + ids.length + ')' : ids.length + ' template(s)'} | states ${STATES.map((s) => Math.round(s * 100)).join(',')}%`);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const id of ids) {
    let r; try { r = await capture(browser, id); } catch (e) { r = { id, status: 'error', err: e.message }; }
    results.push(r);
    console.log(`  ${r.status.padEnd(11)} ${id}${r.frames ? ` (${r.frames} frames)` : ''}${r.err ? ' — ' + r.err.slice(0, 80) : ''}`);
  }
  await browser.close();
  const tally = {}; for (const r of results) tally[r.status] = (tally[r.status] || 0) + 1;
  console.log('\nsummary: ' + JSON.stringify(tally));
})();
