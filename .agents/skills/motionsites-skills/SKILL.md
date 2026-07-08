---
name: motionsites-skills
description: Compose a coherent multi-page brand website by taking whole templates from the curated MotionSites library and rendering each one 1:1 in structure/layout/motion, while swapping its skin.
---
# Brand-Skin Composer â€” Skill Specification

*Working name: `brand-skin-composer` (final name TBD). Status: draft spec.*

## 0. Purpose & core principle

Compose a **coherent multi-page brand website** by taking whole templates from the curated
MotionSites library and rendering each one **1:1 in structure/layout/motion**, while swapping its
**skin** (font-family, assets, palette, copy) for a target brand's voice, tone, and aesthetic.

> **Invariant:** a template's reusable value is its *structure + motion + composition* (the IP).
> Its fonts/stock-assets/copy were always **placeholders**. Reskinning to a brand doesn't degrade
> the template â€” it **completes** it.

**Hard rules (settled with the principal):**
1. A landing page is **atomic** â€” used whole, never decomposed into our own pieces.
2. The only seams we touch are the ones the **template itself ships** (e.g. Bentley = `HeroOrbit /
   StaySection / Footer`). No finer slicing, no cross-template section recombination.
3. **Structure/motion = 1:1 verbatim.** **Skin (font / assets / color / copy) = always the brand.**
4. **Coherence comes from skin-invariance across pages**, not from forcing one layout.
5. Multi-page site â†’ **one shared brand nav** injected across pages. Standalone page â†’ keep the
   template's own nav, skinned.

## 1. The corpus we operate on (what we have)

- **265 templates** (`prompts-with-text.json`, `prompts/<id>.txt`). Each prompt **is the design-system
  spec** â€” it declares, inline, the fonts, palette, CSS, components, motion values, and asset URLs.
  Type distribution: hero â‰ˆ180, features 32, cta 9, about 7, footer 6, carousel 6, pricing 4,
  testimonials 3, social-media 3, landing 3, dashboard 3, form 2, faq 2, â€¦ (hero-dominant).
- **624 media assets** (`asset-index.json`, `downloads/`): ~369 video, ~224 image, ~9 font, mapped
  per-template + a `_shared` pool. Slot inventory per template is recoverable from the prompt text +
  `prompt-embedded-urls`.
- **A reference anchor brand** already exists: `landingpage-ts-2026` (Thoughtseed) â€”
  `index.css` tokens + `tailwind.config.js` + the `Header` shell. This is a textbook brand input and
  the **Philosophy page is our reference failure-then-fix fixture.**

## 2. Formal objects

**Template** `t = (role, Slots, Skin, Mechanic)`
- `role âˆˆ {hero, features, cta, about, footer, pricing, testimonials, landing, â€¦}`
- `Slots(t)` = typed multiset of asset sockets. Each `s = (id, type, card, constraints)`:
  - `type âˆˆ {video, image, font, icon}`
  - `card` = cardinality (e.g. OrbitImages needs **6** image slots; hero needs **1** video)
  - `constraints` = `{aspect, alpha (transparency), duration (video), colorRole}`
- `Skin(t)` = `(FontRoles, ColorRoles, CopySlots, MotionParams)`
  - `FontRoles` = {display, body, mono, accent} â†’ native font + size scale
  - `ColorRoles` = {bg, surface, fg, fg-muted, accent, accent-2, border} â†’ native values
  - `CopySlots` = headline, eyebrow, body, cta-label, â€¦
- `Mechanic(t)` = structure + motion timeline (the **1:1, untouched** part)

**Brand** `B = (Fonts_B, Palette_B, Pool_B, Voice_B, Motion_B, Invariants_B, Nav_B)`
- `Palette_B` keyed by role (bg/fg/accentâ€¦), `Fonts_B` by role (display/body/mono)
- `Pool_B` = the brand's curated asset library (typed, feature-tagged)
- `Invariants_B` = the **thin coherence contract**: the ~5 roles that MUST be enforced
  (nav/logo, accent thread, base bg tone, motion-easing family, radius language)

**Asset** `a = (type, features)` where `features = {aspect, palette (dominant Lab colors), subject
embedding, dims, duration, alpha}`.

## 3. Mathematical model (the core)

### M1 â€” Assetâ†”Slot binding = min-cost bipartite matching
For template `t`, fill `Slots(t)` from `Pool_B`. Build cost matrix over type-compatible pairs:

```
C(sáµ¢, aâ±¼) = w_aÂ·aspectMismatch(sáµ¢,aâ±¼)
          + w_cÂ·Î”Eâ‚€â‚€(colorTarget(sáµ¢), palette(aâ±¼))      // CIEDE2000 perceptual color distance
          + w_sÂ·(1 âˆ’ cos(emb(sáµ¢.role), emb(aâ±¼.subject)))  // semantic fit (CLIP-style embeddings)
          + w_dÂ·durationPenalty(sáµ¢,aâ±¼)                     // video slots only
          + w_Î±Â·alphaMismatch(sáµ¢,aâ±¼)                       // transparency requirement
```
Solve `min Î£ C(sáµ¢, Ï†(sáµ¢))` subject to type + cardinality constraints.
- 1:1 â†’ **Hungarian algorithm**; with cardinality/reuse â†’ **min-cost max-flow**.
- Output `Ï†`: each slot â†’ brand asset(s). Coverage gap = unfilled slots (feasibility signal, see M4).

### M2 â€” Palette reskin = role-preserving transform in CIELAB/LCh
Template has color roles with native values `{v_r}`; brand anchors a subset (`Invariants_B`).
Transplant anchors, **re-derive the rest to preserve the template's internal relationships**:

```
minimize  Î£_r â€– rel(M(v_r), M(v_bg)) âˆ’ rel(v_r, v_bg) â€–
   s.t.   M(v_r) = Palette_B[r]              for r âˆˆ anchored roles
          contrast(M(v_fg), M(v_bg)) â‰¥ max(contrast(v_fg,v_bg), 4.5)   // WCAG AA preserved
where rel(x,y) = (Î”L*, Î”hue, Î”chroma) in LCh
```
â†’ colors become the brand's, but the template's **visual hierarchy / contrast ladder is intact.**
(This is why reskin â‰  flatten: relationships, not absolute values, carry the design.)

### M3 â€” Type reskin = modular-scale + optical-size preserving
Map `FontRoles(t)` â†’ `Fonts_B` by role. Preserve the type scale ratio `r = sizeáµ¢/sizeáµ¢â‚Šâ‚` and
correct for the brand font's metrics so visual size is unchanged:

```
size'áµ¢ = sizeáµ¢ Â· (capHeight_native / capHeight_brand)     // optical 1:1
```
â†’ "1:1 rendering" holds for typography even though the typeface changed.

### M4 â€” Reskin distance & site coverage (selection)
Per-template port cost vs a brand:

```
d(t, B) = Î±Â·paletteDist(t,B) + Î²Â·typeDist(t,B) + Î³Â·motionDist(t,B) + Î´Â·coverageGap(t, Pool_B)
```
Lower `d` = cheaper/safer port. A **site** needs a page-set covering required roles
`{landing, about, philosophy, contact, â€¦}`. Choosing the best site =

```
minimize  Î£_{t âˆˆ Site} d(t, B)
   s.t.   Site covers all required page-roles
          coverage(t, Pool_B) â‰¥ Ï„   âˆ€ t âˆˆ Site      // brand can actually fill every slot
```
â†’ a weighted **set-cover / assignment** over the 265-template library. With ~180 heroes this is
richly over-determined for openers and tight for footers/CTAs â€” the math surfaces that gap.

### M5 â€” Coherence is invariant by construction (why this works)
Let `skin(P)` be a page's realized skin vector (fonts, palette anchors, easing, nav). Define

```
Coherence(site) â†‘  as  Var_P[ skin(P) ] â†“
```
Every page is skinned with the **same `B`** â‡’ `Var_P[skin(P)] = 0` by construction â‡’ coherence is
guaranteed; only `Mechanic` (structure) varies, and structure â‰  identity. The Philosophy break is
the contrapositive: it kept its own skin â‡’ `Var > 0` â‡’ incoherent.

## 4. Pipeline (per page, then assemble)

```
prompt(t) â”€â”€parseâ”€â”€â–¶ Template Interface {role, Slots, Skin, Mechanic}
                          â”‚
brand kit B â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
                          â–¼
   M1 bind assets Â· M2 reskin palette Â· M3 reskin type Â· copyâ†’Voice_B
                          â–¼
   emit Mechanic 1:1 in scaffold (Vite + Tailwind v4 @theme + motion/react), skin applied
                          â–¼
   inject shared Nav_B + shell  â”€â”€â–¶  Page component
Pages Ã— N â”€â”€assembleâ”€â”€â–¶ router + shared shell + transitions â”€â”€â–¶ coherent brand site
```

Output format = the **Shamoni scaffold**: `index.css` `@theme` (brand tokens) + `components/` +
`App` mounting `<Page/>`s under one shell.

## 5. Schemas (I/O contracts)

**`template-interface.json`** (one per template, derived from its prompt â€” Phase 0):
```json
{ "id":"luxury-botanical", "role":"landing",
  "ownSections":["HeroOrbit","StaySection","Footer"],
  "slots":[{"id":"hero.video","type":"video","card":1,"aspect":"16:9","loop":true},
           {"id":"orbit.items","type":"image","card":6,"alpha":true,"aspect":"1:1"}],
  "skin":{"fontRoles":{"display":"Instrument Serif","body":"Manrope"},
          "colorRoles":{"bg":"#000","fg":"#000","accent":"#f4ecdc"},
          "copySlots":["headline","eyebrow","cta"]},
  "mechanic":"clip-path ellipse reveal + scroll-driven orbit (600vh sticky)" }
```

**`brand-kit.json`** (one per brand):
```json
{ "name":"Thoughtseed",
  "fonts":{"display":"Instrument Serif","body":"Inter","mono":"Space Mono"},
  "palette":{"bg":"#050505","surface":"#111118","fg":"#fff","accent":"#50E3C2","accent2":"#4A90E2"},
  "invariants":["nav","accent","bg","easing:out-expo","radius:pill"],
  "pool":"<path to brand asset library>", "voice":"<tone guide>",
  "nav":{"component":"glass-pill","links":[...]} }
```

## 6. Build plan (phases)

- **Phase 0 â€” Formalize the corpus.** Parse all 265 prompts â†’ `template-interface.json` each
  (role, ownSections, typed slots, skin surface, mechanic descriptor). Parallelizable; the prompts
  already declare everything. *Deliverable: `interfaces/*.json` + a slot/role coverage report.*
- **Phase 1 â€” Asset feature extraction.** For the 624 assets compute `{aspect, dominant-Lab,
  duration, alpha, subject-embedding}` â†’ `asset-features.json`. *(Local files in `assets/`.)*
- **Phase 2 â€” Brand-kit schema + Thoughtseed kit.** Author the `brand-kit.json` loader; encode the
  existing Thoughtseed anchor (`landingpage-ts-2026` tokens) as the first kit.
- **Phase 3 â€” Math engine.** Implement M1 (Hungarian/min-cost-flow), M2 (LCh palette transform +
  WCAG guard), M3 (modular-scale/optical type map), M4 (distance + set-cover selection).
- **Phase 4 â€” Reskin codegen.** Apply `Ï†` + palette/type maps to a template's 1:1 Mechanic â†’ emit a
  brand-skinned page in the scaffold; inject shared nav. *(Shamoni build = the codegen target proven.)*
- **Phase 5 â€” Site assembler.** N pages + shared shell/nav + router + inter-page transitions.
- **Phase 6 â€” Validate.** (a) Round-trip: zero-override render == template-ready original.
  (b) **Philosophy reference**: render 1:1, swap to Thoughtseed skin + shared nav â†’ coherent.
  (c) Coherence metric M5 â‰ˆ 0 skin-variance across the assembled site.
- **Phase 7 â€” Package as skill.** Procedure + reference engine + schemas + the Philosophy worked
  example, registered in the skill system.

## 7. Validation fixtures
- **`landingpage-ts-2026`** = the anchor brand + the Philosophy break (negative â†’ positive case).
- **Shamoni build** (`shamoni-landing`) = proof the codegen target (Vite+Tailwind v4+motion) renders
  a template 1:1.
- A full Thoughtseed site (home + about + philosophy + contact) assembled from chosen templates =
  end-to-end acceptance.

## 8. Status â€” v1 BUILT (2026-06)

Full pipeline implemented + verified, committed to `motionsites-skills`:
- **Phase 0** â€” 265 `interfaces/*.json` + `interfaces/_coverage-report.md` âœ…
- **Phase 1** â€” `asset-features.json` (624: aspect / CIELAB / duration / alpha) âœ… Â· `scripts/extract-asset-features.mjs`
- **Phase 2** â€” `brand-kits/thoughtseed.json` âœ…
- **Phase 3** â€” M1 matcher âœ… Â· `scripts/match.mjs`
- **Phase 4** â€” reskin codegen âœ… Â· `scripts/reskin.mjs` + `scripts/tokenize.mjs` (polarity-correct
  tokenization keystone) + `scripts/reskin-theme.mjs` (@theme path); plus **#1** media scrim Â· **#2**
  copyâ†’voice Â· **#3** M1 binding (`--bind`)
- **Phase 5** â€” site assembler âœ… Â· `reskins/assembler-reference/` (shared shell + react-router)

Verified by rendered demos: luxury-botanical â†’ dark/legible/brand-voiced Thoughtseed (1:1);
shamoni `@theme` â†’ teal Thoughtseed wordmark; assembler â†’ one glass-pill nav over N bodies.

## 9. v1.1 backlog (known edges)
- **Headline / fragmented copy** needs per-node targeting (global replace can't safely hit split `<span>`s).
- **Tailwind `/opacity` variants** on tokenized utilities are preserved un-tokenized (simplification).
- **M1 picks** need a real per-brand asset pool to be semantically apt (mechanism complete).
- **Assembler inter-page transitions** (structure done; choreography TBD).

## 10. v2 CORE â€” Asset Compositional Contract (the crux)

Feature-matching (Phase 1 + M1) treats an asset as isolated specs (aspect/color/duration/alpha).
That is *why* naive binding breaks: **a "16:9 video" is not interchangeable with another.** The
original asset was composed for its exact place â€” relative to copy, nav, crop, and motion â€” and that
design is invisible to feature-matching. Every real failure (subject hidden by the h1, wrong size,
hero subject obscured by text, busy section-bg under its copy, product image cropped past its
subject, logo with no clear-space, CTA over a noisy region, nav illegible over a light area) is a
**contract violation** â€” *relational* (asset Ã— layout Ã— copy Ã— nav Ã— flow), not a property of the asset.

### Two moves
1. **Contract extraction (per slot).** From the *template* â€” element placement, `object-fit`/crop,
   z-order, and the positions of h1 / logo / CTA / nav that overlay or border the asset â€” plus the
   *original asset* (where its subject/focal point and negative space actually sit).
   `contract = {placement, crop, textSafeZones, focalZone, negativeSpaceReservations, motion, sizeInContext}`.
   The curated MotionSites prompts already *describe* much of this â€” they are the scaffolding of
   "what was there earlier."
2. **Generate-to-fit (not match).** Reverse-engineer the original asset's generative intent
   (subject + composition + safe zones); **keep the composition, swap the subject/style to the
   brand** â†’ a generation prompt yielding a brand asset that drops into the slot and works: right
   size, subject in the visible zone, text-safe where the copy lands, survives crop + motion. The
   original asset is the template; the brand is the fill â€” the **1:1-structure / brand-skin principle
   applied to the asset's internal composition**, not just the page's.

Contract-aware *matching* (M1 filtered by contract satisfaction) is the cheap path when a brand-pool
asset already fits; **generation is the fallback that guarantees fit.** This supersedes naive binding
(#3) and is what turns the pipeline from "structurally correct" into "shippable." It applies to every
role â€” hero video, section bg, product image, header/footer, logo, CTA, nav â€” each with its own contract.

### Reference screenshots â€” the visual contract (linchpin)
Code-extraction gets the *measurable* contract (position, crop, z-order, overlay coords). A
**screenshot of the rendered original** captures what code can't: where the subject actually sits,
how the copy falls across it, the negative space, how the crop reads â€” the asset *in its place*,
as ground truth. The MotionSites templates run (single-file CDN) and we already screenshot them, so
the capture is available now.
- **Generation reference** â€” feed the original frame to the image/video model as a *composition
  guide* ("a brand version of this layout") â†’ the brand asset is born fitting the slot. This is what
  prevents "generated a new asset and it's hidden by the h1 / wrong size / wrong focal."
- **Verification ground-truth** â€” render the brand page, diff against the original frame: same
  compositional role?
- **Scroll-driven â†’ a sequence of frames** (hero closed â†’ mid clip-reveal â†’ orbit expanded); the
  asset's role changes through scroll, so the contract is a short frame sequence, not one still.
- Reference the **composition, not the content** (keep subject-here / text-safe-there; swap subject/style to brand).

### New artifacts
- **capture pass** â†’ `references/<id>/*.png` (rendered template at key scroll states) â€” foundation; parallelizes like Phase 0.
  âœ… **built** as a reusable skill component: `scripts/capture-references.mjs` (Playwright; serves each runnable
  single-file template, scrolls to 0/25/50/75/99%, screenshots; incremental, `--all`/`--force`; component-spec
  templates marked `needs-build`). Validated: `neural-interface` scroll-0 = the centered-subject/text-safe-zone
  contract that `thoughtseed-hero.mp4` (the golden generate-to-fit output) was composed to fit.
- extend `interfaces/<id>.json` slots with a `contract` block (code layout + the reference frames).
- a `generate-to-fit` step â†’ per-slot brand-asset prompts (reverse-engineered original + brand subject) **+ the reference frame as composition guide**, feeding an image/video model.
- contract-satisfaction scoring folded into M1 (filter picks by fit, not just aspect/color).
- verify loop: render brand page â†’ diff vs `references/<id>/*.png`.

> **The crux, in one line:** don't *find* an asset that fits the slot â€” *understand why the original
> fit*, then *compose a brand asset to the same contract.* That is the skill.

