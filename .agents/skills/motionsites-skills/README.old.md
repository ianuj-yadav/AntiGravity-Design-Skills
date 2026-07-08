# motionsites-skills

A catalogued library of [MotionSites.ai](https://motionsites.ai) landing-page / hero-section
**prompt templates** (build specs for React + Tailwind + Vite pages), plus a reusable, rate-limited,
resumable fetcher that keeps the catalogue and its media in sync.

> **Note:** Prompt text and media are sourced from MotionSites.ai. This repository is a personal
> archive/working set; respect MotionSites' terms for any reuse.

## What's here

| Path | What |
|------|------|
| `prompts-with-text.json` | Canonical corpus — one record per prompt (id, title, category, type, `prompt_text`, sections) |
| `prompts/<id>.txt` | Each prompt's build spec as plain text (id = MotionSites slug, or numeric for older prompts) |
| `prompt-assets/<id>.json` | Per-prompt metadata (no text) |
| `prompts-index.tsv` | Flat index: `id ⇥ title ⇥ category ⇥ type ⇥ page_type ⇥ is_free ⇥ length` |
| `prompt-corpus-stats.json` | Aggregate stats (counts, length distribution, categories, top domains) |
| `catalog-current.json` | Latest catalogue snapshot (all prompt metadata + preview URLs) |
| `asset-index.json` | Per-template asset map (preview + images/videos/fonts) |
| `missing-assets-report.json` | Templates whose referenced assets couldn't be fetched (private/dead) |
| `scripts/` | `fetch-motionsites.mjs` (sync), `organize-assets.mjs` (layout), `README.md` |

**Media is not committed** (≈3.3 GB) — it's a local cache under `assets/` (gitignored), fully
re-fetchable via the scripts. Layout: `assets/<template-id>/preview.mp4` + `assets/<template-id>/{images,videos,fonts}/…`, with assets shared across templates in `assets/_shared/`.

## Counts

265 prompts (243 slug-id + 22 legacy numeric-id) · 624 media assets fetched across 225 templates.

## Usage

Requires Node 18+ and `ffmpeg`. See [`scripts/README.md`](scripts/README.md) for full flags.

```bash
node scripts/fetch-motionsites.mjs            # incremental sync: new prompts + missing media
node scripts/organize-assets.mjs              # lay media out under assets/<template>/…
node scripts/fetch-motionsites.mjs --dry-run  # preview what's new without writing
```

The fetcher is **incremental and idempotent** (skips anything already saved), **rate-limited**
(gentle on the API), and **resumable** (manifests track progress). Fetching paid prompt text needs
a MotionSites access token in `.env` (see `scripts/README.md`); free prompts and all media need none.
