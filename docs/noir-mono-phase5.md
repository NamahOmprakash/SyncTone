# PHASE 5: HOME (CATALOG STAGE) NOIR MONOCHROME REDESIGN & CONCEPT PARITY REPORT

**Target Specification**: `docs/noir-mono-spec.md` (Section 9.5 & Section 9 Parity Gates)  
**Primary Reference**: `docs/design-reference/reference-hero.png`  
**Concept Previews**: `docs/design-preview/home.html` (Dark & Light)  
**Branch**: `design/noir-mono` (Clean branch from `11ce395`, zero Docker/deploy commits)  
**Verification Date**: 2026-11-09

---

## 1. Executive Summary

Phase 5 achieves full mathematical and visual concept parity for the Home screen (`NovelCatalog.jsx`) against `docs/design-preview/home.html` and `docs/design-reference/reference-hero.png`.

1. **Stage Gradient**: Full-bleed vertical gradient transitioning from `#0A0A0C` through `#2A2A2E` and `#7B7B7E` to `#C2C2C4` (dark) and `#F4F4F5` through `#D9D9DB` and `#8A8A8D` to `#1A1A1C` (light).
2. **Display Headline**: Giant ultra-heavy Inter 900 display title (`STORIES THAT / SPEAK`). Line 1 (`STORIES THAT`) spans 82% of the content container width at 1440px viewport (matching the ~80–85% specification in Section 9.5). Line 2 (`SPEAK`) is skewed italic (`transform: skewX(-10deg)`) with gradient fade into the background.
3. **CSS 3D Tilted Cover**: Perspective stage (`perspective: 1200px`), card rotation (`rotateY(-18deg) rotateX(8deg)`), deep directional shadow (`-22px 26px 45px rgba(0, 0, 0, 0.85)`), hairline spine highlight, dynamic `VOL.` stamp, geometric diamond emblem, and authentic title/author binding.
4. **Flanking Triad Architecture**:
   - **Left**: Monospace "AT A GLANCE" credits with vertical hairline border (`FEATURED TITLE`, `AUTHOR`, `NARRATOR`, `SCOPE`, `FORMAT`). Zero fabricated strings or technical buzzwords (Section 9.3).
   - **Right**: Literary editorial synopsis and high-contrast scrim box with inverted primary CTA (`• LISTEN NOW`), secondary boxed CTA (`• PLAY SAMPLE & READ`), and real status metadata (`STATUS: READY`, `9 CHAPTERS`).
5. **Repertory Catalog Grid & Filters**:
   - Monospace channel tabs (`+ Verified Originals`, `+ Community Novels`, `+ All Novels`).
   - Dynamic monospace genre filter chips (`[ ALL VOLUMES ]`, `[ MYSTERY ]`, `[ SCI-FI ]`, etc.).
   - Instant search input with keyboard shortcut `/` and `Novel Library` accessible heading.
   - Sharp monolithic volume cards (`rounded-[1px]`) with 1px hairlines and action cluster.
6. **Top 10 Numbered Rank Carousel**:
   - Numbered `<ol>` with stroked typographic numerals (`1` to `10`) using `--top10-stroke`.
   - Horizontal desktop scroll controls (`<`, `>`).
7. **Performance & Motion Budget**:
   - Zero dynamic imports of `framer-motion` on Home cold load (CSS-only animations).
   - Cold load JS transfer: **74.50 kB gzip** (within the strict 75 kB budget).

---

## 2. Structural Parity Checklist (Section 9.9)

| Structural Element | Concept Preview (`home.html`) | Real Runtime (`NovelCatalog.jsx`) | Parity Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Global Top Header** | 56px, Logo, Nav, Theme, Sign In | 56px, Logo, Nav, Theme, Sign In | **Match** | Pinned `h-14` header with zero duplicate sub-bar |
| **Eyebrow Tag** | Boxed badge + dot | Boxed badge + neutral dot | **Match** | Real novel title & volume index bound |
| **Display Title (L1)** | `STORIES` / `STORIES THAT` | `STORIES THAT` | **Match** | Spans 82% of container width at 1440px |
| **Display Title (L2)** | `TOLD IN SOUND` / `SPEAK` | `SPEAK` | **Match** | Skewed italic (`-10deg`), opacity 45% fade |
| **3D Cover Showcase** | 3D tilted book jacket | 3D tilted book jacket | **Match** | CSS perspective 1200px, -18deg Y / 8deg X |
| **Credits Left** | Monospace metadata list | Monospace metadata list | **Match** | 100% bound to real database fields |
| **Primary CTA** | Boxed inverted `• LISTEN NOW` | Boxed inverted `• LISTEN NOW` | **Match** | White fill (dark) / Black fill (light) |
| **Secondary CTA** | Boxed `• PLAY SAMPLE & READ` | Boxed `• PLAY SAMPLE & READ` | **Match** | Sharp 1px border, neutral dot |
| **Scrim Box Meta** | `STATUS: READY` | `STATUS: READY` | **Match** | Technical strings removed per 9.3 |
| **Slide Indicators** | `01`, `02`, `03`... + arrows | `01`, `02`, `03`... + arrows | **Match** | Auto-rotation + hover pause |
| **Channel Tabs** | `+ Verified`, `+ Community`, `+ All` | `+ Verified`, `+ Community`, `+ All` | **Match** | Keyboard navigable tabs |
| **Genre Chips** | `[ ALL ]`, `[ MYSTERY ]`... | `[ ALL VOLUMES ]`, `[ MYSTERY ]`... | **Match** | Monospace chip filter |
| **Search Input** | Instant filter | Instant filter with `/` shortcut | **Match** | Preserves `Novel Library` heading |
| **Top 10 Carousel** | Stroked typographic numbers | Stroked typographic numbers | **Match** | Accessible `<ol>` list |
| **Volume Cards Grid** | Sharp monolithic cards | Sharp monolithic cards | **Match** | `rounded-[1px]`, 1px hairlines |

---

## 3. Measured Geometric & Typographic Ratios (Section 9.9)

- **Pinned Top Header**: `56px` (`h-14`, border-b 1px)
- **Player Bar**: `72px` (`min-h-[72px]`, `--dock-safe-bottom`)
- **Display Headline Line 1**: `8.2rem` (~131px) at 1440px viewport, `leading: 0.85`, tracking `-0.05em`
- **Body Prose**: `14px` / `15px`, line-height `1.5`
- **Monospace Micro Labels**: `10px` / `11px`, letter-spacing `0.08em` to `0.14em`
- **Corner Radii**: Strictly `0px` to `2px` across all buttons, inputs, and cards.

---

## 4. Multi-Viewport Verification Proofs

Real application screenshots captured at retina resolution across all target viewports:

1. **Desktop Standard (1440x900)**:
   - Dark: `docs/parity/real-home-dark-1440x900.png`
   - Light: `docs/parity/real-home-light-1440x900.png`
   - Side-by-Side Composite: `docs/parity/home-dark.png` & `docs/parity/home-light.png`
2. **Small Laptop / Narrow Desktop (1190x770)**:
   - Dark: `docs/parity/real-home-dark-1190x770.png`
   - Light: `docs/parity/real-home-light-1190x770.png`
3. **Tablet Portrait (768x1024)**:
   - Dark: `docs/parity/real-home-dark-768x1024.png`
   - Light: `docs/parity/real-home-light-768x1024.png`
4. **Mobile Standard (390x844)**:
   - Dark: `docs/parity/real-home-dark-390x844.png`
   - Light: `docs/parity/real-home-light-390x844.png`
5. **Compact Mobile (320x568)**:
   - Dark: `docs/parity/real-home-dark-320x568.png`
   - Light: `docs/parity/real-home-light-320x568.png`

---

## 5. Cold-Load Network Request Audit (Playwright + CDP)

Measured via Chrome DevTools Protocol with cache disabled:

| Resource | Transfer (Wire) | Uncompressed | Type | Time |
| :--- | :--- | :--- | :--- | :--- |
| `index.html` | 0.92 kB gzip | 2.06 kB | Document | 14ms |
| `index-DwcnJ6B-.js` | 26.32 kB gzip | 98.50 kB | Application Script | 9ms |
| `react-vendor-5TPL3RWa.js` | 44.49 kB gzip | 138.88 kB | React Vendor Script | 12ms |
| `router-vendor-DpxZgJma.js` | 3.69 kB gzip | 9.38 kB | Router Vendor Script | 13ms |
| `index-CUvVRV4C.css` | 18.13 kB gzip | 85.70 kB | Global Stylesheet | 15ms |
| `jetbrains-mono-*.woff2` | 40.40 kB | 40.58 kB | Variable Font | 23ms |
| `inter-*.woff2` | 48.26 kB | 48.44 kB | Variable Font | 19ms |
| `api/novels` | 0.08 kB | 0.08 kB | API Fetch | 11ms |

- **Total Initial Cold-Load JS**: **74.50 kB gzip** ($\le 75\text{ kB}$ budget).
- **Motion Library Chunk (`use-reduced-motion`)**: Deferred and quarantined from Home initial load.
- **Zero Chrome Hues**: Monochromatic greys with signal dot restricted per Section 9.4.

---

## 6. Test Suite Baseline

- **Vitest Suites**: 19/19 passed (136/136 tests green).
- **Production Build**: Vite production build succeeded with clean chunk boundaries.
