# MotionSites asset fetcher

`fetch-motionsites.mjs` — incremental, rate-limited, resumable. Re-harvests **new** prompt
templates and downloads media not yet saved, skipping anything already on disk.

## One-time setup

Node 18+ and `ffmpeg` are required (both present on this machine). No npm install needed.

Create a file named `.env` in `motionsites-export/` (this dir's parent) with:

```dotenv
# Public defaults are baked into the script; only set these to override.
SUPABASE_URL=https://xgdzyqfalbibzelpdpvr.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...   # the public anon key

# Needed ONLY to fetch text for NEW *paid* prompts. Free prompts + all media need nothing.
MOTIONSITES_BEARER=

# Leave BLANK unless using --allow-refresh (rotating the refresh token signs your browser out).
MOTIONSITES_REFRESH_TOKEN=
MOTIONSITES_COOKIE=
```

### Getting a FRESH access token (capture right before a run)

1. Log in at <https://motionsites.ai>.
2. DevTools → **Application → Local Storage → https://motionsites.ai** → key
   `sb-xgdzyqfalbibzelpdpvr-auth-token` → copy the `access_token` value into `MOTIONSITES_BEARER`.
   *(Alternative: Network tab → open any prompt → the `get-prompt` request → copy the value after
   `authorization: Bearer ` in its request headers.)*

The script **never refreshes the token by default**, so your browser session stays logged in
(refresh-token rotation is what signed the session out on the Jun 9 run).

## Usage

```bash
node scripts/fetch-motionsites.mjs --dry-run     # preview: new prompts (free/paid) + missing media. No token needed.
node scripts/fetch-motionsites.mjs --prompts     # fetch text for new prompts (paid need a token)
node scripts/fetch-motionsites.mjs --media       # download missing media (auth-free)
node scripts/fetch-motionsites.mjs               # --all (both); default
```

### Rate-limit / deferred / resume flags

| Flag | Default | Purpose |
|------|---------|---------|
| `--rate-ms=N` | 1500 | Min ms between Supabase calls (gentle, avoids auth rate limits) |
| `--batch=N` | all | Fetch only N new prompts this run (deferred pull) |
| `--media-limit=N` | all | Download only N media files this run |
| `--media-concurrency=N` | 3 | Parallel direct downloads |
| `--types=video,image,font` | all | Restrict media types |
| `--max-bytes=N` | none | Skip direct files larger than N bytes |
| `--no-preview-videos` | off | Skip per-prompt Mux preview videos |
| `--force` | off | Re-fetch/re-download even if already saved |
| `--allow-refresh` | off | Opt-in token refresh (⚠ may log your browser out) |
| `--stats` | off | Also regenerate `prompt-corpus-stats.json` |

All progress is tracked in `harvest-manifest.json` (prompts) and `downloads/download-manifest.json`
(media). Interrupt any time and re-run — it resumes and skips what's done. If the token expires
mid-run, paid prompts are marked `deferred_auth`; paste a fresh token and re-run.

## Outputs

- `prompts-with-text.json` — slug-keyed master (new prompts appended; `.bak` kept)
- `prompts/<slug>.txt`, `prompt-assets/<slug>.json` — per new prompt
- `prompts-index.tsv`, URL lists, `catalog-current.json` — regenerated/updated
- `downloads/{videos,images,fonts}/` + `download-manifest.json` — media cache (gitignored)
