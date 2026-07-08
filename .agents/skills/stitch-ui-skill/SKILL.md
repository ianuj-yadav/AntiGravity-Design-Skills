---
name: stitch-ui
description: |
  Generate UI designs and export production-ready code via Google Stitch Remote MCP API.
  Supports API Key (recommended) and OAuth authentication. Includes Design System management.
  Use when: user asks to design a UI, generate a page/screen, create an app interface, build a landing page, make a dashboard, or mentions "Stitch", "Google Stitch", or "stitch.withgoogle.com".
  通过 Google Stitch Remote MCP API 生成 UI 设计并导出生产级代码。支持 API Key（推荐）和 OAuth 认证。包含设计系统管理。
---

# Stitch UI — Google Stitch Design Automation

Generate UI screens from text prompts and export production-ready HTML+Tailwind code via the official Stitch Remote MCP Server.

## First-Time Setup (API Key)

1. Go to [Stitch Settings](https://stitch.withgoogle.com) → API Keys → Create API Key
2. Run once in terminal:
```bash
claude mcp add stitch \
  --transport http https://stitch.googleapis.com/mcp \
  --header "X-Goog-Api-Key: YOUR_KEY" \
  -s user
```
For OAuth or other clients, see [references/mcp-setup.md](references/mcp-setup.md).

---

## MCP Tools — Correct Usage

### Project Management

**`create_project`** — creates a project container
```
title: "My App"   # optional
```

**`list_projects`** — lists all projects
```
filter: "view=owned"  # or "view=shared"
```

**`get_project`** — gets project details including screen instances (needed for apply_design_system)
```
name: "projects/PROJECT_ID"   # format: projects/{id}
```

---

### Screen Management

**`list_screens`** — lists all screens in a project
```
projectId: "PROJECT_ID"   # no "projects/" prefix
```

**`get_screen`** — retrieves screen details and HTML code
```
# Use ONLY the name field. projectId/screenId are deprecated.
name: "projects/PROJECT_ID/screens/SCREEN_ID"
```
> ⚠️ Always use `name` only. The old `projectId` + `screenId` params are deprecated.

---

### AI Generation

**`generate_screen_from_text`** — generates a new screen from prompt
```
projectId: "PROJECT_ID"        # no "projects/" prefix
prompt: "A pricing page..."
modelId: "GEMINI_3_FLASH"      # or GEMINI_3_1_PRO
deviceType: "DESKTOP"          # MOBILE | DESKTOP | TABLET | AGNOSTIC
```
> ⚠️ Takes 1–2 minutes. **DO NOT RETRY** on timeout — the generation may still be running.
> After call: if `output_components` contains suggestions (e.g. "Yes, add dark mode"), show them to the user. If user accepts one, call `generate_screen_from_text` again with that as the prompt.

**`edit_screens`** — edits existing screens with a prompt
```
projectId: "PROJECT_ID"
selectedScreenIds: ["SCREEN_ID"]   # no "screens/" prefix
prompt: "Switch to dark mode"
modelId: "GEMINI_3_FLASH"          # optional
```
> ⚠️ **DO NOT RETRY** on timeout.

**`generate_variants`** — generates design variations of existing screens
```
projectId: "PROJECT_ID"
selectedScreenIds: ["SCREEN_ID"]
prompt: "Explore color variations"
variantOptions:                    # REQUIRED
  variantCount: 3                  # 1–5, default 3
  creativeRange: "EXPLORE"         # REFINE | EXPLORE | REIMAGINE
  aspects: ["COLOR_SCHEME"]        # optional: LAYOUT | COLOR_SCHEME | IMAGES | TEXT_FONT | TEXT_CONTENT
```

---

### Design Systems

**`create_design_system`** — creates a design system with brand tokens
```
projectId: "PROJECT_ID"   # optional
designSystem:
  displayName: "My Brand"
  theme:
    colorMode: "LIGHT"         # LIGHT | DARK
    customColor: "#0056D2"     # seed/primary color (hex)
    headlineFont: "INTER"      # see font list below
    bodyFont: "INTER"
    roundness: "ROUND_EIGHT"   # ROUND_FOUR | ROUND_EIGHT | ROUND_TWELVE | ROUND_FULL
    colorVariant: "TONAL_SPOT" # optional: see color variants below
    overridePrimaryColor: "#0056D2"    # optional: override exact primary
    overrideSecondaryColor: "#7B2FF7"  # optional
    overrideTertiaryColor: "#00BFA5"   # optional
    overrideNeutralColor: "#F5F5F5"    # optional
    designMd: "## Brand Guidelines\n..." # optional: free-form markdown
```
> ⚠️ **Must call `update_design_system` immediately after** to apply and display in UI.

**`update_design_system`** — updates or finalizes a design system (call after create)
```
name: "assets/ASSET_ID"     # from create_design_system response
projectId: "PROJECT_ID"
designSystem: { ... }       # same structure as create
```

**`list_design_systems`** — lists all design systems for a project
```
projectId: "PROJECT_ID"   # optional
```
Returns `assetId` needed for `apply_design_system`.

**`apply_design_system`** — applies a design system to screens
```
projectId: "PROJECT_ID"
assetId: "ASSET_ID"        # from list_design_systems (no "assets/" prefix)
selectedScreenInstances:   # MUST come from get_project, NOT list_screens
  - id: "INSTANCE_ID"              # screen instance id (from get_project)
    sourceScreen: "projects/PROJECT_ID/screens/SCREEN_ID"
```
> ⚠️ `selectedScreenInstances.id` is the **instance ID**, not the screen ID.
> Get it from `get_project` response → screen instances list.

---

## Models

| Model | Speed | Quality | Use |
|-------|-------|---------|-----|
| `GEMINI_3_FLASH` | Fast | Good | Default for most tasks |
| `GEMINI_3_1_PRO` | Slower | Best | Complex or detailed UI |
| `GEMINI_3_PRO` | — | — | ⛔ Deprecated, do not use |

## Device Types

`MOBILE` · `DESKTOP` · `TABLET` · `AGNOSTIC`

## Font Options (headlineFont / bodyFont / labelFont)

`INTER` · `GEIST` · `DM_SANS` · `IBM_PLEX_SANS` · `MANROPE` · `MONTSERRAT` · `RUBIK` · `NUNITO_SANS` · `WORK_SANS` · `PLUS_JAKARTA_SANS` · `SPACE_GROTESK` · `SOURCE_SANS_THREE` · `SORA` · `LEXEND` · `PUBLIC_SANS` · `EPILOGUE` · `HANKEN_GROTESK` · `ARIMO` · `BE_VIETNAM_PRO` · `SPLINE_SANS` · `NEWSREADER` · `NOTO_SERIF` · `LITERATA` · `EB_GARAMOND` · `LIBRE_CASLON_TEXT` · `SOURCE_SERIF_FOUR` · `DOMINE` · `METROPOLIS`

## Color Variants (colorVariant)

`TONAL_SPOT` (default) · `MONOCHROME` · `NEUTRAL` · `VIBRANT` · `EXPRESSIVE` · `FIDELITY` · `CONTENT` · `RAINBOW` · `FRUIT_SALAD`

## Roundness Options

`ROUND_FOUR` · `ROUND_EIGHT` · `ROUND_TWELVE` · `ROUND_FULL`  _(ROUND_TWO is deprecated)_

---

## Typical Workflows

### Basic: Generate a screen
```
1. list_projects → find projectId (or create_project)
2. generate_screen_from_text → wait 1-2 min, check output_components for suggestions
3. get_screen (name only) → retrieve HTML code
4. edit_screens → iterate with follow-up prompts
```

### Brand: Apply design system
```
1. create_design_system → get asset name
2. update_design_system → apply immediately (required step)
3. get_project → get screen instances (id + sourceScreen)
4. apply_design_system → apply brand tokens to screens
```

### Variants: Explore alternatives
```
1. generate_variants → variantOptions required (variantCount, creativeRange, aspects)
2. list_screens → see all generated variants
3. get_screen → retrieve preferred variant's HTML
```

---

## Prompt Tips

- Specific: "Pricing page, 3 tier cards (Basic $9/mo, Pro $29/mo, Enterprise), yearly toggle, dark header"
- Reference real products: "Like Stripe's pricing page but for eSIM plans"
- Specify brand: "Primary #0056D2, dark theme, Inter font"
- Include real content: actual text, prices, feature names — not lorem ipsum

---

## Fallback: Playwright Browser Automation

If MCP is not configured, use the browser automation script:

```bash
node scripts/stitch-generate.js \
  --prompt "A dashboard with sidebar nav and stats cards" \
  --type web \
  --output ./my-output
```

Requires Chrome with CDP enabled. See [references/playwright-mode.md](references/playwright-mode.md).
