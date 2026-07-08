# Phase 0 — Template Interface Coverage Report (COMPLETE: 265/265)

Machine-readable interfaces extracted for the full MotionSites corpus. One `interfaces/<id>.json` per template (role, ownSections, typed slots, skin surface, mechanic, techDelivery, reskinNotes). This is the substrate for the math model (M1 matching, M2/M3 skin invariant, M4 set-cover).

## 1. Role distribution
| role | count |
|---|---|
| hero | 180 |
| features | 32 |
| cta | 9 |
| about | 7 |
| carousel | 6 |
| footer | 6 |
| pricing | 4 |
| testimonials | 3 |
| landing | 3 |
| dashboard | 3 |
| social-media | 3 |
| faq | 2 |
| form | 2 |
| 404 | 1 |
| 3D Website | 1 |
| stats | 1 |
| Blog | 1 |
| blog | 1 |

## 2. Slot-type demand & cardinality (M1)
Owned-asset types = `image` + `video` (matched from our pool); `font`/`svg`/`icon` are code/CDN-supplied skin params.
| type | templates | card min/med/max | total sockets |
|---|---|---|---|
| video | 254 | 1/1/8 | 352 |
| font | 242 | 1/1/2 | 249 |
| icon | 177 | 1/2/18 | 521 |
| image | 176 | 1/1/40 | 463 |
| svg | 151 | 1/1/8 | 229 |
| other | 4 | 1/1/1 | 4 |
| lottie | 3 | 3/3/4 | 10 |

**Big galleries (image card ≥ 8):** 8 templates → M1 must handle large ordered sets. Top: dashboard(40), 3d-jack-portfolio-hero(21), scroll-marquee(11), scroll-marquee(10), 3d-jack-portfolio-hero(9), projects-catalog(9).

## 3. Skin-surface invariant (M2/M3)
**Font roles**
| role | freq | % |
|---|---|---|
| `body` | 244 | 92% |
| `display` | 239 | 90% |
| `accent` | 59 | 22% |
| `mono` | 29 | 11% |

**Color roles**
| role | freq | % |
|---|---|---|
| `fg` | 260 | 98% |
| `bg` | 258 | 97% |
| `fgMuted` | 235 | 89% |
| `border` | 232 | 88% |
| `surface` | 231 | 87% |
| `accent` | 221 | 83% |
| `accent2` | 143 | 54% |
| `surface2` | 2 | 1% |

## 4. Reskin difficulty
265/265 templates carry reskinNotes (every interface annotated for how to reskin).

## 5. Data quality
Parsed 265/265 interface files cleanly. No malformed files. Missing vs todo: 0.
