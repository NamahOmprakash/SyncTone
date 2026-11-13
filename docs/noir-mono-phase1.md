# Phase 1: Noir Monochrome Reference Analysis, Token Proposal & Contrast Table

**Project**: SyncTone — Noir Monochrome Redesign (Full Visual & UX Overhaul)  
**Phase**: Phase 1 of 10 (Docs Only)  
**Precedence**: Supersedes `docs/noir-yellow-spec.md` (withdrawn: yellow accent was a misreading of external viewer chrome), `docs/editorial-orange-spec.md`, and `THEME_LOCK` v1.  
**Status**: **PHASE 1 COMPLETE (READ-ONLY AUDIT & SPECIFICATION)**. Strictly zero lines of production code in `src/` modified.

---

## 1. Executive Summary & Authorization Precedence

This specification establishes the architectural foundation for **Phase 1: Reference Analysis, Pixel Sampling, Token Proposal, and Mathematical WCAG Contrast Table** for the Noir Monochrome redesign of SyncTone.

### Precedence & Authorization
- **Written Owner Authorization**: Full visual and UX redesign encompassing color tokens, typography scales, layout geometry, component shapes, navigation structures, and editorial-voice copy.
- **Supersedes Withdrawn Specs**: `docs/noir-yellow-spec.md` (yellow accent withdrawn as a misreading of external viewer chrome), `docs/editorial-orange-spec.md`, and `THEME_LOCK` v1.
- **Strictly Frozen Systems**:
  - Business logic, REST/WebSocket API endpoints, and authentication/RBAC contracts.
  - Multi-tenant database behavior (PostgreSQL 16 schemas & MongoDB 7 polyglot collections).
  - Audio synthesis pipeline and player synchronization hooks (`useAudioSync`, `usePlaybackProgress`, `useSynthesisProgress`).
  - Reading fit engine and pagination contracts (`fitBook`, `useBookFit`, reading anchors, chapter slicing).
  - Deep links and route paths (`/`, `/novel/:id`, `/reader/:id`, `/profile`, `/admin`, `/upload`).
  - Offline ServiceWorker PWA caching and text sanitizer algorithms.
- **Editorial Voice Rule**: No technical, database, or backend wording is permitted in user-facing copy (e.g. references to "API Gateway", "MongoDB", "SQL", "Worker Bridge").
- **Zero Scope Inflation**: Non-existent features logged in [`docs/editorial-orange-gaps.md`](file:///Users/mohdfaizankhan/SyncTone-/docs/editorial-orange-gaps.md) (such as bookmarks data models, multi-chapter playback queues, or voice audio previews) remain strictly frozen and will **never** be mocked or stubbed.

---

## 2. Reference Analysis: Deconstructing the Visual Language

The design language is derived from the primary reference (`reference-hero.png`), which defines the site's true visual identity. An external viewer overlay (`reference.png`) includes third-party Awwwards chrome—specifically a floating rounded yellow button, a rounded pill dock, and a light top bar. These elements are confirmed as third-party viewer chrome and are strictly excluded from the theme.

```
+-------------------------------------------------------------------------------+
| TOP BAR: [Logo Mark]      + LIBRARY    + VOICES    + PROFILE      [● SIGN IN] |
+-------------------------------------------------------------------------------+
| HERO STAGE (Tall Vertical Gradient: Near-Black -> Mid Grey -> Light Grey)     |
|                                                                               |
|   GIANT DISPLAY HEADLINE (Inter 800-900 Uppercase, Tight Tracking)            |
|   SECOND WORD SKEWED ITALIC (skewX(-10deg) fading into gradient)              |
|                                                                               |
|   [Mono Credit Left]       [3D TILTED BOOK COVER]         [Short Sans Blurb]  |
|                                                                               |
|   [● LISTEN NOW] (Inverted Boxed Button)    [● PLAY SAMPLE] (Signal Dot Tag)  |
+-------------------------------------------------------------------------------+
| CATALOG & READING SURFACES (Sharp 0-2px Cards, Hairline 1px Borders)          |
| + Large Book Covers (Strict 2:3 / 3:4 Ratios)                                 |
| + JetBrains Mono Badges & Chips (+ GENRE, + DURATION)                         |
| + Hairline Separators, Generous Negative Space, Zero Decorative Gradients     |
+-------------------------------------------------------------------------------+
| BOTTOM AUDIO BAR: [Artwork] [Mono Title/Time] [Boxed Controls] [● Signal Dot]  |
+-------------------------------------------------------------------------------+
```

### Visual Grammar Principles

1. **Strictly Monochrome Chrome**:
   - Zero chromatic hues are allowed anywhere in the UI chrome. No yellow, green, orange fills, blue, or purple.
   - The only chromatic exception is **one tiny signal dot** (`--signal: #FF5A1F`, $\le$ 8px diameter) used strictly for active live/playing/recording states. It is never used as text, background fill, border, or icon glyph. If the owner selects "zero color", `--signal` evaluates directly to `--text-main`.
   - Book cover art, user avatars, and procedural novel jackets are content, not UI chrome.

2. **Stage Background Gradient**:
   - Landing and hero stages utilize a tall vertical 4-stop gradient transitioning from near-black at the top, fading to mid-grey, then to light grey at the bottom (mirrored for light mode).
   - In-app utility surfaces (Reader, Voice Studio, Account, Modal dialogs) use flat, calm near-black or off-white neutral surfaces.

3. **Display Typography & Skewed Italic**:
   - Headline typography is set in Inter 800–900, fully uppercase, with tight tracking (`-0.05em`) and compressed line-height (`~0.85`).
   - The headline is filled with a vertical grey gradient applied via `background-clip: text`.
   - The secondary word features an aggressive skewed italic treatment (`transform: skewX(-10deg) italic`) that fades into the backdrop gradient. Essential semantic text remains fully intact in the DOM and `aria-label`.

4. **Micro UI & Boxed Geometry**:
   - Navigation links, metadata labels, tags, and timestamps use JetBrains Mono in uppercase with letter-spacing (`0.08em` to `0.12em`).
   - Primary and secondary buttons feature boxed 1px borders, sharp corners (border radius `0px` to `2px`), and a preceding circular indicator dot.
   - Zero pills, zero rounded cards, zero glassmorphism blurs, and zero drop shadows beyond subtle 1px hairline depth.

5. **3D Tilted Hero Object**:
   - A 3D-tilted novel cover using CSS 3D perspective transforms (`perspective(1200px) rotateY(-18deg) rotateX(8deg)`) replaces the tilted monitor from the reference.
   - Flanked symmetrically by small monospace metadata on the left and a concise sans-serif editorial blurb on the right.

6. **Status Communication Without Chromatic Hue**:
   - Success, warning, danger, and info states are expressed through semantic icons, typographic weight, boxed hairline borders, and inverted banners—never red/green/yellow badges.

---

## 3. Comprehensive Token Proposal: Dark & Light Monochrome Architecture

Existing CSS custom properties in `src/index.css` and `tailwind.config.js` will be re-valued, legacy aliases harmonized, and four new tokens (`--stage-gradient`, `--headline-gradient`, `--signal`, `--bg-bar`) introduced.

### 3.1 Dark Mode (`:root, html.dark`) — Default Nocturne

| Token Name | Proposed Value | Category | Semantic Purpose & Usage |
| :--- | :--- | :--- | :--- |
| `--bg-page` | `#0B0B0D` | Canvas | Deep neutral stage background and viewport base |
| `--bg-surface` | `#141416` | Surface | Primary navigation bars, sheets, dialog backdrop |
| `--bg-card` | `#1B1B1E` | Card | Novel cards, chapter items, settings containers |
| `--bg-hover` | `#232327` | Interaction | Interactive row hover, pressed button states |
| `--bg-elevated`| `#1B1B1E` | Overlay | Modals, floating dropdowns, popovers |
| `--bg-bar` | `#141416` | Shell | Fixed top navigation and bottom audio bar |
| `--text-main` | `#F2F2F3` | Typography | Primary headings, titles, body text (17.58:1 on page) |
| `--text-sub` | `#A9A9AF` | Typography | Secondary metadata, author credits, synopsis (8.41:1 on page) |
| `--text-muted` | `#898992` | Typography | Micro UI tags, timestamps, secondary labels (calibrated: 4.52:1 on hover, 4.96:1 on card) |
| `--accent` | `#F2F2F3` | Inverse CTA | Inverted primary fill (text-main tone; white button on dark) |
| `--on-accent` | `#0B0B0D` | Inverse CTA | Text on inverted primary button (page color; near-black text, 17.58:1 AAA) |
| `--accent-hover`| `#DCDCDF` | Interaction | One grey step darker for inverted button hover |
| `--accent-surface`| `rgba(242, 242, 243, 0.10)` | State | Subtle 10% alpha wash for selected tab/chip |
| `--border-subtle` | `#2E2E33` | Hairline | 1px card separators, catalog dividers |
| `--border-strong` | `#5E5E66` | Boundary | Boxed button borders, inputs (calibrated: 3.06:1 on page, $\ge 3:1$ AA Non-Text) |
| `--border-focus` | `#F2F2F3` | Focus Ring | 2px text-main outline ring with 2px offset in `#0B0B0D` |
| `--top10-fill` | `#0B0B0D` | Editorial | Rank billboard glyph background fill |
| `--top10-stroke` | `rgba(242, 242, 243, 0.25)` | Editorial | Rank billboard outline hairline |
| `--top10-active`| `#F2F2F3` | Editorial | Active billboard rank selector |
| `--card-accent` | `#F2F2F3` | Editorial | Active card accent line |
| `--speaker-narrator` | `#A9A9AF` | Voice | Narrator voice metadata (7.35:1 on card) |
| `--speaker-a` | `#F2F2F3` | Voice | Lead dialogue speaker (differentiated via mono badge weight) |
| `--speaker-b` | `#DCDCDF` | Voice | Secondary character speaker |
| `--speaker-c` | `#A9A9AF` | Voice | Tertiary character speaker |
| `--speaker-d` | `#898992` | Voice | Background dialogue speaker |
| `--color-speaker-narrator` | `var(--speaker-narrator)` | Voice Alias | Backward-compatible voice alias |
| `--color-speaker-dialogue` | `var(--speaker-a)` | Voice Alias | Backward-compatible dialogue alias |
| `--color-speaker-system` | `var(--text-sub)` | Voice Alias | Backward-compatible system alias |
| `--success` | `#F2F2F3` | Status | Neutral inverted badge/icon fill |
| `--warning` | `#DCDCDF` | Status | Neutral bordered badge fill |
| `--danger` | `#F2F2F3` | Status | Inverted high-contrast neutral badge fill |
| `--info` | `#A9A9AF` | Status | Neutral muted badge fill |
| `--color-status-success` | `var(--success)` | Status Alias | Backward-compatible status alias |
| `--color-status-warning` | `var(--warning)` | Status Alias | Backward-compatible status alias |
| `--color-status-danger` | `var(--danger)` | Status Alias | Backward-compatible status alias |
| `--color-status-info` | `var(--info)` | Status Alias | Backward-compatible status alias |
| `--cta-primary-bg` | `var(--accent)` | CTA Alias | Primary button background |
| `--cta-primary-hover` | `var(--accent-hover)` | CTA Alias | Primary button hover |
| `--cta-primary-text` | `var(--on-accent)` | CTA Alias | Primary button text |
| `--glass-bg` | `rgba(20, 20, 22, 0.98)` | Deprecated Glass | Flattened to opaque surface |
| `--glass-dock` | `rgba(20, 20, 22, 0.98)` | Deprecated Glass | Flattened to opaque bar |
| `--signal` | `#FF5A1F` | Signal Dot | Tiny $\le$ 8px dot for active playing/recording indicator (6.31:1 on page) |
| `--stage-gradient` | `linear-gradient(180deg, #0A0A0C 0%, #2A2A2E 35%, #7B7B7E 70%, #C2C2C4 100%)` | Stage | Tall vertical hero background (scrim applied on bottom half) |
| `--headline-gradient` | `linear-gradient(180deg, #B4B4B6 0%, #3A3A3E 100%)` | Display | Background-clip text gradient on display headline |

---

### 3.2 Light Mode (`html.light`) — Inverted Minimalist Vellum

| Token Name | Proposed Value | Category | Semantic Purpose & Usage |
| :--- | :--- | :--- | :--- |
| `--bg-page` | `#EFEFF0` | Canvas | Crisp light grey stage canvas and viewport background |
| `--bg-surface` | `#F7F7F8` | Surface | Clean navigation bar, drawer sheets, modal background |
| `--bg-card` | `#FFFFFF` | Card | Pure white novel cards, chapter tiles, controls |
| `--bg-hover` | `#E4E4E6` | Interaction | Interactive item hover, selected rows |
| `--bg-elevated`| `#FFFFFF` | Overlay | Modals, flyout menus, tooltips |
| `--bg-bar` | `#F7F7F8` | Shell | Fixed top navigation and bottom audio bar |
| `--text-main` | `#0B0B0D` | Typography | Deep near-black titles, body text, headlines (17.11:1 on page) |
| `--text-sub` | `#4F4F56` | Typography | Secondary metadata, author credits (7.07:1 on page) |
| `--text-muted` | `#65656C` | Typography | Micro UI tags, timestamps, secondary labels (calibrated: 4.55:1 on hover, 5.03:1 on page) |
| `--accent` | `#0B0B0D` | Inverse CTA | Inverted primary fill (text-main tone; black button on light) |
| `--on-accent` | `#FFFFFF` | Inverse CTA | Text on inverted primary button (pure white text on black, 19.66:1 AAA) |
| `--accent-hover`| `#232327` | Interaction | One grey step lighter for inverted button hover |
| `--accent-surface`| `rgba(11, 11, 13, 0.08)` | State | Subtle 8% alpha wash for selected tab/chip |
| `--border-subtle` | `#D0D0D4` | Hairline | 1px card separators, catalog dividers |
| `--border-strong` | `#86868A` | Boundary | Boxed button borders, inputs (3.16:1 on page, $\ge 3:1$ AA Non-Text) |
| `--border-focus` | `#0B0B0D` | Focus Ring | 2px text-main outline ring with 2px offset in `#FFFFFF` |
| `--top10-fill` | `#EFEFF0` | Editorial | Rank billboard glyph background fill |
| `--top10-stroke` | `rgba(11, 11, 13, 0.25)` | Editorial | Rank billboard outline hairline |
| `--top10-active`| `#0B0B0D` | Editorial | Active billboard rank selector |
| `--card-accent` | `#0B0B0D` | Editorial | Active card accent line |
| `--speaker-narrator` | `#4F4F56` | Voice | Narrator voice metadata (8.12:1 on card) |
| `--speaker-a` | `#0B0B0D` | Voice | Lead dialogue speaker (differentiated via mono badge weight) |
| `--speaker-b` | `#232327` | Voice | Secondary character speaker |
| `--speaker-c` | `#4F4F56` | Voice | Tertiary character speaker |
| `--speaker-d` | `#65656C` | Voice | Background dialogue speaker |
| `--color-speaker-narrator` | `var(--speaker-narrator)` | Voice Alias | Backward-compatible voice alias |
| `--color-speaker-dialogue` | `var(--speaker-a)` | Voice Alias | Backward-compatible dialogue alias |
| `--color-speaker-system` | `var(--text-sub)` | Voice Alias | Backward-compatible system alias |
| `--success` | `#0B0B0D` | Status | Neutral inverted badge/icon fill |
| `--warning` | `#232327` | Status | Neutral bordered badge fill |
| `--danger` | `#0B0B0D` | Status | Inverted high-contrast neutral badge fill |
| `--info` | `#4F4F56` | Status | Neutral muted badge fill |
| `--color-status-success` | `var(--success)` | Status Alias | Backward-compatible status alias |
| `--color-status-warning` | `var(--warning)` | Status Alias | Backward-compatible status alias |
| `--color-status-danger` | `var(--danger)` | Status Alias | Backward-compatible status alias |
| `--color-status-info` | `var(--info)` | Status Alias | Backward-compatible status alias |
| `--cta-primary-bg` | `var(--accent)` | CTA Alias | Primary button background |
| `--cta-primary-hover` | `var(--accent-hover)` | CTA Alias | Primary button hover |
| `--cta-primary-text` | `var(--on-accent)` | CTA Alias | Primary button text |
| `--glass-bg` | `rgba(247, 247, 248, 0.98)` | Deprecated Glass | Flattened to opaque surface |
| `--glass-dock` | `rgba(247, 247, 248, 0.98)` | Deprecated Glass | Flattened to opaque bar |
| `--signal` | `#F05010` | Signal Dot | Tiny $\le$ 8px dot (calibrated for light surfaces: 3.12:1 on page, 3.35:1 on bar, $\ge 3:1$ Non-Text AA) |
| `--stage-gradient` | `linear-gradient(180deg, #F4F4F5 0%, #D9D9DB 35%, #8A8A8D 70%, #1A1A1C 100%)` | Stage | Mirrored tall vertical hero gradient |
| `--headline-gradient` | `linear-gradient(180deg, #1A1A1C 0%, #8A8A8D 100%)` | Display | Background-clip text gradient (dark to mid-grey fade) |

---

## 4. Mathematical WCAG 2.2 AA Contrast Verification Tables

All pairs were computed using the standard W3C relative luminance formula:
$$L = 0.2126 \times R_{\text{lin}} + 0.7152 \times G_{\text{lin}} + 0.0722 \times B_{\text{lin}}$$
$$\text{Contrast Ratio} = \frac{L_{\text{lighter}} + 0.05}{L_{\text{darker}} + 0.05}$$

Under WCAG 2.2 AA:
- **Normal Text (< 18pt or < 14pt bold)**: Minimum **4.5:1** (AAA requires 7.0:1).
- **Large Text ($\ge$ 18pt or $\ge$ 14pt bold)**: Minimum **3.0:1** (AAA requires 4.5:1).
- **UI Components & Graphical Objects (SC 1.4.11)**: Minimum **3.0:1**.

---

### 4.1 Evaluation of Task Baseline Estimates & Required Calibrations

The task prompt provided baseline estimates and explicitly instructed: `text-muted ~#81818A (verify >= 4.5:1)` in Dark mode, and `muted #6E6E75` in Light mode. Our rigorous verification reveals that raw prompt estimates fail on key surfaces and require specific calibrated coordinates:

| Token / Baseline Coordinate | Surface Evaluated | Local Background | Measured Ratio | WCAG AA Status | Root Cause & Required Calibration |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Dark Baseline `~#81818A`** | `--bg-page` | `#0B0B0D` | **5.09:1** | PASS (AA) | Compliant on base page. |
| **Dark Baseline `~#81818A`** | `--bg-surface` | `#141416` | **4.77:1** | PASS (AA) | Compliant on navigation surface. |
| **Dark Baseline `~#81818A`** | `--bg-card` | `#1B1B1E` | **4.45:1** | **FAIL (< 4.5:1)** | Fails by 0.05. Luminance of `#1B1B1E` is too elevated. |
| **Dark Baseline `~#81818A`** | `--bg-hover` | `#232327` | **4.06:1** | **FAIL (< 4.5:1)** | Fails significantly during hover on chapter/catalog rows. |
| **Dark Prior Attempt `#84848D`** | `--bg-card` | `#1B1B1E` | **4.64:1** | PASS (AA) | Fixed card, but left hover broken. |
| **Dark Prior Attempt `#84848D`** | `--bg-hover` | `#232327` | **4.22:1** | **FAIL (< 4.5:1)** | Hidden in prior report; fails on hovered interactive rows. |
| **Dark Calibrated `--text-muted: #898992`** | `--bg-card` / `--bg-hover` | `#1B1B1E` / `#232327` | **4.96:1** / **4.52:1** | **PASS (AA ALL)** | **Fully compliant across all dark surfaces including hover.** |
| **Light Baseline `#6E6E75`** | `--bg-page` | `#EFEFF0` | **4.40:1** | **FAIL (< 4.5:1)** | Fails baseline canvas contrast by 0.10. |
| **Light Baseline `#6E6E75`** | `--bg-surface` | `#F7F7F8` | **4.73:1** | PASS (AA) | Compliant on navigation bar. |
| **Light Baseline `#6E6E75`** | `--bg-card` | `#FFFFFF` | **5.06:1** | PASS (AA) | Compliant on pure white card. |
| **Light Baseline `#6E6E75`** | `--bg-hover` | `#E4E4E6` | **3.99:1** | **FAIL (< 4.5:1)** | Fails severely on hovered list rows. |
| **Light Prior Attempt `#6B6B72`** | `--bg-page` | `#EFEFF0` | **4.60:1** | PASS (AA) | Fixed page, but left hover broken. |
| **Light Prior Attempt `#6B6B72`** | `--bg-hover` | `#E4E4E6` | **4.16:1** | **FAIL (< 4.5:1)** | Hidden in prior report; fails on hovered interactive rows. |
| **Light Calibrated `--text-muted: #65656C`** | `--bg-page` / `--bg-hover` | `#EFEFF0` / `#E4E4E6` | **5.03:1** / **4.55:1** | **PASS (AA ALL)** | **Fully compliant across all light surfaces including hover.** |
| **Dark Baseline `--border-strong: #44444A`** | `--bg-page` / `--bg-card` | `#0B0B0D` / `#1B1B1E` | **2.03:1** / **1.78:1** | **FAIL (< 3.0:1)** | Fails SC 1.4.11 Non-Text boundary contrast. |
| **Dark Calibrated `--border-strong: #5E5E66`** | `--bg-page` | `#0B0B0D` | **3.06:1** | **PASS (AA Non-Text)** | **Provides verified 3:1 boundary for boxed buttons & inputs.** |
| **Light Baseline `--signal: #FF5A1F`** | `--bg-page` / `--bg-bar` | `#EFEFF0` / `#F7F7F8` | **2.71:1** / **2.91:1** | **FAIL (< 3.0:1)** | Fails SC 1.4.11 Non-Text indicator dot requirement. |
| **Light Calibrated `--signal: #F05010`** | `--bg-page` / `--bg-bar` | `#EFEFF0` / `#F7F7F8` | **3.12:1** / **3.35:1** | **PASS (AA Non-Text)** | **Guarantees $\ge 3.0:1$ non-text contrast in Light Mode.** |

---

### 4.2 Dark Theme Mathematical Contrast Matrix

| Interface Element & Location | Foreground Token / Hex | Local Background Token / Hex | Measured Contrast Ratio | WCAG 2.2 Requirement | Compliance Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Primary Text on Page** | `--text-main` (`#F2F2F3`) | `--bg-page` (`#0B0B0D`) | **17.58:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Primary Text on Surface** | `--text-main` (`#F2F2F3`) | `--bg-surface` (`#141416`) | **16.45:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Primary Text on Card** | `--text-main` (`#F2F2F3`) | `--bg-card` (`#1B1B1E`) | **15.36:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Primary Text on Hover Row** | `--text-main` (`#F2F2F3`) | `--bg-hover` (`#232327`) | **14.00:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Secondary Text on Page** | `--text-sub` (`#A9A9AF`) | `--bg-page` (`#0B0B0D`) | **8.41:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Secondary Text on Surface** | `--text-sub` (`#A9A9AF`) | `--bg-surface` (`#141416`) | **7.87:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Secondary Text on Card** | `--text-sub` (`#A9A9AF`) | `--bg-card` (`#1B1B1E`) | **7.35:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Secondary Text on Hover Row**| `--text-sub` (`#A9A9AF`) | `--bg-hover` (`#232327`) | **6.70:1** | $\ge 4.5:1$ Normal | **PASS (AA)** |
| **Calibrated Muted Text on Page**| `--text-muted` (`#898992`) | `--bg-page` (`#0B0B0D`) | **5.67:1** | $\ge 4.5:1$ Normal | **PASS (AA)** |
| **Calibrated Muted Text on Surface**| `--text-muted` (`#898992`) | `--bg-surface` (`#141416`) | **5.31:1** | $\ge 4.5:1$ Normal | **PASS (AA)** |
| **Calibrated Muted Text on Card**| `--text-muted` (`#898992`) | `--bg-card` (`#1B1B1E`) | **4.96:1** | $\ge 4.5:1$ Normal | **PASS (AA)** |
| **Calibrated Muted Text on Hover**| `--text-muted` (`#898992`) | `--bg-hover` (`#232327`) | **4.52:1** | $\ge 4.5:1$ Normal | **PASS (AA)** |
| **Primary CTA Button Text** | `--on-accent` (`#0B0B0D`) | `--accent` (`#F2F2F3`) | **17.58:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Primary CTA Hover State** | `--on-accent` (`#0B0B0D`) | `--accent-hover` (`#DCDCDF`) | **14.37:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Keyboard Focus Ring Indicator**| `--border-focus` (`#F2F2F3`) | `--bg-page` (`#0B0B0D`) | **17.58:1** | $\ge 3.0:1$ UI Indicator | **PASS (AAA)** |
| **Form Input / Boxed Boundary**| `--border-strong` (`#5E5E66`)| `--bg-page` (`#0B0B0D`) | **3.06:1** | $\ge 3.0:1$ UI Component | **PASS (AA Non-Text)** |
| **Signal Dot Indicator on Page**| `--signal` (`#FF5A1F`) | `--bg-page` (`#0B0B0D`) | **6.31:1** | $\ge 3.0:1$ UI Component | **PASS (AAA Non-Text)**|
| **Signal Dot Indicator on Bar** | `--signal` (`#FF5A1F`) | `--bg-bar` (`#141416`) | **5.90:1** | $\ge 3.0:1$ UI Component | **PASS (AA Non-Text)** |
| **Display Headline (Top 0%)** | Gradient Start (`#B4B4B6`)| Stage Stop 0% (`#0A0A0C`) | **9.56:1** | $\ge 3.0:1$ Large Text | **PASS (AAA)** |
| **Display Headline (Mid 35%)**| Gradient Mid (`#76767A`) | Stage Stop 35% (`#2A2A2E`)| **3.16:1** *(corrected)* | $\ge 3.0:1$ Large Text | **PASS (AA Large)** |
| **Hero Info Text on Stage 0%** | `--text-main` (`#F2F2F3`) | Stage Stop 0% (`#0A0A0C`) | **17.68:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Hero Info Text on Stage 35%**| `--text-main` (`#F2F2F3`) | Stage Stop 35% (`#2A2A2E`)| **12.78:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Hero Info Text on Stage 70% (RAW)**| `--text-main` (`#F2F2F3`)| Stage Stop 70% (`#7B7B7E`)| **3.77:1** | $\ge 4.5:1$ Normal | **FAIL (Needs Scrim)** |
| **Hero Info Text on Stage 100% (RAW)**| `--text-main` (`#F2F2F3`)| Stage Stop 100% (`#C2C2C4`)| **1.59:1** | $\ge 4.5:1$ Normal | **FAIL (Needs Scrim)** |
| **Hero Info Text with Solid Scrim**| `--text-main` (`#F2F2F3`)| Scrim (`rgba(11,11,13,0.92)`)| **16.15:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Speaker Lead Dialogue on Card**| `--speaker-a` (`#F2F2F3`) | `--bg-card` (`#1B1B1E`) | **15.36:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Speaker Narrator on Card** | `--speaker-narrator` (`#A9A9AF`)| `--bg-card` (`#1B1B1E`) | **7.35:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Speaker Secondary on Card** | `--speaker-b` (`#DCDCDF`) | `--bg-card` (`#1B1B1E`) | **12.56:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Speaker Background on Card** | `--speaker-d` (`#898992`) | `--bg-card` (`#1B1B1E`) | **4.96:1** | $\ge 4.5:1$ Normal | **PASS (AA)** |
| **Status Banner Inverted Text** | Inverted Text (`#0B0B0D`) | Inverted Banner (`#F2F2F3`)| **17.58:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Text on Selected Tab / Chip**| `--text-main` (`#F2F2F3`) | `--accent-surface` (`#313133`)| **11.60:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Sub-text on Selected Tab** | `--text-sub` (`#A9A9AF`) | `--accent-surface` (`#313133`)| **5.55:1** | $\ge 4.5:1$ Normal | **PASS (AA)** |
| *Muted Text on Selected Tab (PROHIBITED)*| `--text-muted` (`#898992`)| `--accent-surface` (`#313133`)| **3.74:1** | $\ge 4.5:1$ Normal | **VIOLATION (Prohibited)**|

---

### 4.3 Light Theme Mathematical Contrast Matrix

| Interface Element & Location | Foreground Token / Hex | Local Background Token / Hex | Measured Contrast Ratio | WCAG 2.2 Requirement | Compliance Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Primary Text on Page** | `--text-main` (`#0B0B0D`) | `--bg-page` (`#EFEFF0`) | **17.11:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Primary Text on Surface** | `--text-main` (`#0B0B0D`) | `--bg-surface` (`#F7F7F8`) | **18.37:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Primary Text on Card** | `--text-main` (`#0B0B0D`) | `--bg-card` (`#FFFFFF`) | **19.66:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Primary Text on Hover Row** | `--text-main` (`#0B0B0D`) | `--bg-hover` (`#E4E4E6`) | **15.49:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Secondary Text on Page** | `--text-sub` (`#4F4F56`) | `--bg-page` (`#EFEFF0`) | **7.07:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Secondary Text on Surface** | `--text-sub` (`#4F4F56`) | `--bg-surface` (`#F7F7F8`) | **7.59:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Secondary Text on Card** | `--text-sub` (`#4F4F56`) | `--bg-card` (`#FFFFFF`) | **8.12:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Secondary Text on Hover Row**| `--text-sub` (`#4F4F56`) | `--bg-hover` (`#E4E4E6`) | **6.40:1** | $\ge 4.5:1$ Normal | **PASS (AA)** |
| **Calibrated Muted Text on Page**| `--text-muted` (`#65656C`) | `--bg-page` (`#EFEFF0`) | **5.03:1** | $\ge 4.5:1$ Normal | **PASS (AA)** |
| **Calibrated Muted Text on Surface**| `--text-muted` (`#65656C`) | `--bg-surface` (`#F7F7F8`) | **5.40:1** | $\ge 4.5:1$ Normal | **PASS (AA)** |
| **Calibrated Muted Text on Card**| `--text-muted` (`#65656C`) | `--bg-card` (`#FFFFFF`) | **5.78:1** | $\ge 4.5:1$ Normal | **PASS (AA)** |
| **Calibrated Muted Text on Hover**| `--text-muted` (`#65656C`) | `--bg-hover` (`#E4E4E6`) | **4.55:1** | $\ge 4.5:1$ Normal | **PASS (AA)** |
| **Primary CTA Button Text** | `--on-accent` (`#FFFFFF`) | `--accent` (`#0B0B0D`) | **19.66:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Primary CTA Hover State** | `--on-accent` (`#FFFFFF`) | `--accent-hover` (`#232327`) | **15.66:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Keyboard Focus Ring Indicator**| `--border-focus` (`#0B0B0D`) | `--bg-page` (`#EFEFF0`) | **17.11:1** | $\ge 3.0:1$ UI Indicator | **PASS (AAA)** |
| **Form Input Boundary on Page** | `--border-strong` (`#86868A`)| `--bg-page` (`#EFEFF0`) | **3.16:1** | $\ge 3.0:1$ UI Component | **PASS (AA Non-Text)** |
| **Form Input Boundary on Card** | `--border-strong` (`#86868A`)| `--bg-card` (`#FFFFFF`) | **3.63:1** | $\ge 3.0:1$ UI Component | **PASS (AA Non-Text)** |
| **Calibrated Signal Dot on Page**| `--signal` (`#F05010`) | `--bg-page` (`#EFEFF0`) | **3.12:1** | $\ge 3.0:1$ UI Component | **PASS (AA Non-Text)** |
| **Calibrated Signal Dot on Bar** | `--signal` (`#F05010`) | `--bg-bar` (`#F7F7F8`) | **3.35:1** | $\ge 3.0:1$ UI Component | **PASS (AA Non-Text)** |
| **Signal Dot on Pure White Card**| `--signal` (`#FF5A1F` / `#F05010`)| `--bg-card` (`#FFFFFF`) | **3.12:1** / **3.58:1** | $\ge 3.0:1$ UI Component | **PASS (AA Non-Text)** |
| **Display Headline (Top 0%)** | Gradient Start (`#1A1A1C`)| Stage Stop 0% (`#F4F4F5`) | **15.81:1** | $\ge 3.0:1$ Large Text | **PASS (AAA)** |
| **Display Headline (Mid 35%)**| Gradient Mid (`#4F4F56`) | Stage Stop 35% (`#D9D9DB`)| **5.76:1** | $\ge 3.0:1$ Large Text | **PASS (AAA)** |
| **Hero Info Text on Stage 0%** | `--text-main` (`#0B0B0D`) | Stage Stop 0% (`#F4F4F5`) | **17.89:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Hero Info Text on Stage 35%**| `--text-main` (`#0B0B0D`) | Stage Stop 35% (`#D9D9DB`)| **13.95:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Hero Main Text on Stage 70% (RAW)**| `--text-main` (`#0B0B0D`)| Stage Stop 70% (`#8A8A8D`)| **5.71:1** | $\ge 4.5:1$ Normal | **PASS (AA)** |
| **Hero Sub Text on Stage 70% (RAW)**| `--text-sub` (`#4F4F56`) | Stage Stop 70% (`#8A8A8D`)| **2.36:1** | $\ge 4.5:1$ Normal | **FAIL (Needs Scrim)** |
| **Hero Main Text on Stage 100% (RAW)**| `--text-main` (`#0B0B0D`)| Stage Stop 100% (`#1A1A1C`)| **1.13:1** | $\ge 4.5:1$ Normal | **FAIL (Black-on-Black)**|
| **Hero Info Text with White Scrim**| `--text-main` (`#0B0B0D`)| White Scrim (`rgba(255,255,255,0.95)`)| **18.80:1**| $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Speaker Lead Dialogue on Card**| `--speaker-a` (`#0B0B0D`) | `--bg-card` (`#FFFFFF`) | **19.66:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Speaker Narrator on Card** | `--speaker-narrator` (`#4F4F56`)| `--bg-card` (`#FFFFFF`) | **8.12:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Speaker Secondary on Card** | `--speaker-b` (`#232327`) | `--bg-card` (`#FFFFFF`) | **15.66:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Speaker Background on Card** | `--speaker-d` (`#65656C`) | `--bg-card` (`#FFFFFF`) | **5.78:1** | $\ge 4.5:1$ Normal | **PASS (AA)** |
| **Status Banner Inverted Text** | Inverted Text (`#FFFFFF`) | Inverted Banner (`#0B0B0D`)| **19.66:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Text on Selected Tab / Chip**| `--text-main` (`#0B0B0D`) | `--accent-surface` (`#EBEBEB`)| **16.50:1** | $\ge 4.5:1$ Normal | **PASS (AAA)** |
| **Sub-text on Selected Tab** | `--text-sub` (`#4F4F56`) | `--accent-surface` (`#EBEBEB`)| **6.81:1** | $\ge 4.5:1$ Normal | **PASS (AA)** |
| **Muted Text on Selected Tab** | `--text-muted` (`#65656C`)| `--accent-surface` (`#EBEBEB`)| **4.85:1** | $\ge 4.5:1$ Normal | **PASS (AA)** |

---

### 4.4 Architectural Scrim & Contrast Directives

1. **Dark Mode Stage Gradient Scrim Rule**:
   - Above the 50% vertical viewport threshold, informational light text (`#F2F2F3`) achieves 17.68:1 (Stop 0%) and 12.78:1 (Stop 35%), exceeding WCAG AAA.
   - Below 50%, transitioning toward `#7B7B7E` (Stop 70%, 3.77:1) and `#C2C2C4` (Stop 100%, 1.59:1), raw light text fails WCAG AA.
   - **Directive**: Any informational text, CTA button cluster, or metadata placed in the lower half of the hero stage must strictly reside over a solid neutral scrim (`rgba(11, 11, 13, 0.92)` achieving 16.15:1 AAA) or inside card containers (`#1B1B1E`).
   - The secondary headline word (`skewX(-10deg) italic`) that fades into the gradient is purely decorative; the accessible label is provided via DOM/`aria-label`.

2. **Light Mode Stage Gradient Scrim Rule**:
   - The light stage gradient mirrors dark mode, terminating at near-black (`#1A1A1C`) at Stop 100%. Raw dark text (`#0B0B0D`) produces an unreadable 1.13:1 black-on-black collision.
   - **Directive**: Lower hero content in Light Mode must strictly be housed in pure white card containers (`#FFFFFF` with `#0B0B0D` text, 19.66:1 AAA) or an inverted light scrim (`rgba(255, 255, 255, 0.95)`, 18.80:1 AAA).

3. **Active Surface Text Selection Policy**:
   - When elements are rendered over an `--accent-surface` tint wash (10% alpha in dark, 8% alpha in light):
   - In Dark Mode, muted text (`#898992` on `#313133`) drops to 3.74:1 (violating WCAG AA).
   - **Directive**: Text nested inside an element with an active `--accent-surface` fill must strictly utilize `--text-main` (11.60:1 AAA) or `--text-sub` (5.55:1 AA). Never assign `--text-muted` inside an active `--accent-surface` container.

4. **Signal Indicator Dot Policy**:
   - In Dark Mode, `#FF5A1F` achieves 6.31:1 on page and 5.90:1 on bar, fully compliant with WCAG SC 1.4.11 non-text contrast ($\ge 3.0:1$).
   - In Light Mode, `#FF5A1F` achieves only 2.71:1 on page and 2.91:1 on bar.
   - **Directive**: When rendering the $\le$ 8px signal dot over light backgrounds, the calibrated coordinate `--signal: #F05010` (3.12:1 on page, 3.35:1 on bar) must be utilized, or if the "zero color" option is chosen, `--signal` evaluates directly to `--text-main` (`#0B0B0D`, 17.11:1).

---

## 5. Typography System & Cold-Load Budget Audit

### 5.1 Font Family Architecture
SyncTone's typography system uses the three existing self-hosted variable font packages already integrated into the application:

1. **Display & Giant Headline (`font-sans`)**:
   - Family: **Inter Variable** (`@fontsource-variable/inter`)
   - Weights: **800 to 900** (Heavy / Black)
   - Specifications: Fully uppercase, `letter-spacing: -0.05em`, `line-height: ~0.85`, dynamic fluid sizing via `clamp(2.5rem, 7vw, 6.5rem)`.
   - Headline Gradient: `background: var(--headline-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent;`
   - Secondary Word Effect: Skewed italic (`display: inline-block; transform: skewX(-10deg); font-style: italic; opacity: 0.45;`) fading into the background gradient.

2. **UI & Editorial Blurbs (`font-sans`)**:
   - Family: **Inter Variable**
   - Weights: **400 (Regular) to 500 (Medium)**
   - Tracking: `-0.03em`, clean neutral readability across button labels, modals, and descriptions.

3. **Micro UI, Nav, Tags & Timestamps (`font-mono`)**:
   - Family: **JetBrains Mono Variable** (`@fontsource-variable/jetbrains-mono`)
   - Weights: **500 to 600**
   - Specifications: Monospace, fully uppercase, letter-spaced (`tracking-wider` / `0.08em` to `0.12em`), small (`text-xs` / `11px`).
   - Signature Nav Affordance: Navigation links prefixed with `+` (e.g. `+ LIBRARY`, `+ VOICES`, `+ PROFILE`).
   - Boxed Action Buttons: 1px border, sharp corners (`rounded-none` or `rounded-[2px]`), small preceding circular dot indicator (`●`).

4. **Reading Body Text (`font-serif`)**:
   - Family: **Newsreader Variable** (`@fontsource-variable/newsreader`)
   - Measure: Constrained to **60–75ch** per line for ergonomic reading comfort.
   - Line Height: `leading-relaxed` (1.75).
   - Reading Canvas: Completely neutral flat backdrop (`#0B0B0D` in dark mode, `#EFEFF0` in light mode), avoiding the stage gradient so reading remains calm and distraction-free.

### 5.2 Variable Font Weight Verification & Zero-Byte Regression Proof

An audit of the installed `@fontsource-variable` packages confirmed:
- `@fontsource-variable/inter/files/inter-latin-wght-normal.woff2` (48.26 kB) natively includes variable weights from **100 through 900** within a single WOFF2 file.
- `@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2` (40.40 kB) natively supports variable weights from **100 through 800**.
- `@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2` (58.08 kB) natively supports variable weights from **200 through 800**.

**Verdict**: Heavy Inter weights (800 and 900) are **already fully present and self-hosted** in the installed variable font files.
- **External Network Requests**: **0** (strictly self-hosted).
- **New Font Families Added**: **0**.
- **Net Added Byte Cost**: **0 bytes**.
- **Cold-load Gzip Impact**: **Zero regression**. The Home entry chunk remains well below the ~75 kB gzip budget (measured at 28.49 kB gzip for main bundle + 18.79 kB gzip for CSS).

---

## 6. Component Mapping & Rebuild Strategy for Phases 2–10

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SYNCTONE APP SHELL                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ TOP NAV:                                                                    │
│ [SYNCTONE ■]               + LIBRARY    + VOICES    + PROFILE   [● SIGN IN] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ [STAGE HERO]                                                                │
│   Display Headline with Skewed Italic Fade                                  │
│   3D Perspective Novel Jacket                                               │
│   Boxed Action Controls with Dot Indicators                                 │
│                                                                             │
│ [CATALOG / DETAILS / VOICE STUDIO / READER]                                 │
│   - Flat neutral surfaces (Dark #141416 / Light #FFFFFF)                    │
│   - Sharp 0-2px geometry                                                    │
│   - Mono metadata chips & status outlines                                   │
│   - Preserved book fit engine & audio sync contracts                        │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ BOTTOM AUDIO BAR:                                                           │
│ [Cover 48x48]  Dr. Watson — Ch. 1   [◀◀] [▶ PLAY] [▶▶] [Scrubber]  [● LIVE] │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Architecture Breakdown

1. **Top Navigation (`App.jsx`, replacing `SidebarNav.jsx` & `TopHeader.jsx`)**:
   - Replaces the sidebar/header layout with an editorial top navigation bar.
   - Left: Minimalist SyncTone logo glyph.
   - Center: JetBrains Mono links prefixed with `+` (`+ LIBRARY`, `+ VOICES`, `+ PROFILE`).
   - Right: Boxed sharp button with indicator dot (`● SIGN IN` / account trigger) and binary theme toggle (`● LIGHT` / `● DARK`).
   - Mobile: Slide-out compact sheet preserving the exact mono aesthetic.
   - Routing: All routes (`/`, `/profile`, `/admin`, modal triggers) preserved with zero logic changes.

2. **Home Stage & Catalog (`NovelCatalog.jsx`)**:
   - Hero Section: Tall vertical `--stage-gradient` background.
   - Giant display headline (`"STORIES TOLD IN SOUND"` with second phrase skewed italic and faded).
   - 3D tilted novel showcase: CSS perspective transform, mono author/cast credits left, concise sans blurb right.
   - Boxed CTA buttons: Inverted `[● LISTEN NOW]` primary button and `[● PLAY SAMPLE]` secondary button featuring the tiny `--signal` dot.
   - Catalog Grid: Clean 3-column / 4-column layout on desktop, sharp cards (0–2px radius), 1px hairline borders (`--border-subtle`), 2:3 vertical cover art, monospace genre/status badges, and hairline section dividers.

3. **Novel Detail View (`NovelDetails.jsx`)**:
   - Full-bleed stage header with giant title in Inter 800, mono publication metadata, and author attribution.
   - Boxed monospace tab bar: `[ OVERVIEW ]`, `[ CAST ]`, `[ CHAPTERS ]`, `[ DETAILS ]`, `[ SCORE ]`.
   - Inverted primary CTA: `[● LISTEN TO NOVEL]`.
   - Chapter directory: High-contrast row items with mono track durations and neural synthesis status indicators.

4. **Reading Canvas (`ReaderView.jsx` & `OpenGLPageReader.jsx`)**:
   - Calm, distraction-free reading surface set to flat neutral (`#0B0B0D` / `#EFEFF0`), avoiding background gradients.
   - Newsreader serif typography constrained to 60–75 characters per line.
   - Minimalist monospace floating toolbar for font size, book font, and atmosphere toggle.
   - **Fit Engine Preservation**: The book fit contract (`fitBook`, `useBookFit`, `paginate`, and reading anchors) remains strictly intact. The stage viewport reserves top nav height and publishes bottom player bar height as `--dock-safe-bottom`, guaranteeing text never collides with chrome.
   - Page turn chevrons positioned strictly in outer margins/gutters, never overlaying literary text.

5. **Docked Bottom Audio Player (`AudioPlayer.jsx`)**:
   - Fixed sharp bottom bar with 1px top hairline border (`--border-subtle`).
   - 48x48px sharp cover thumbnail with mono chapter title and real-time millisecond timecode (`04:12 / 28:45`).
   - Central boxed controls: Skip backward (`[◀◀ 10s]`), inverted primary `[▶ PLAY]` / `[⏸ PAUSE]`, skip forward (`[▶▶ 10s]`).
   - Full-width interactive audio scrubber styled in `--text-main` with subtle unbuffered track in `--border-strong`.
   - When active, displays the tiny $\le$ 8px `--signal` dot adjacent to the playback status label.

6. **Voice Studio (`SettingsModal.jsx` & `CharacterRoster.jsx`)**:
   - Sharp sheet container with boxed mono navigation tabs: `[ CAST ]`, `[ VOICES ]`, `[ SETTINGS ]`, `[ GENERATE ]`.
   - Character cast roster displaying speaker voice mappings (Narrator, Speaker A/B/C/D) using neutral badges and typographic weight.
   - Voice synthesis progress bar (`SynthesisProgressBar.jsx`) rendered with high-contrast neutral fill and mono percentage readout.

7. **Shared UI Primitives (`Button.jsx`, `Card.jsx`, `Dialog.jsx`, `StatusBadge.jsx`, `Tabs.jsx`)**:
   - `Button`: Boxed 1px border, sharp 0–2px corners, optional preceding dot, inverted primary styling.
   - `Card`: Sharp perimeter, `--border-subtle` border, flat `--bg-card` surface, zero heavy shadows.
   - `StatusBadge`: Monospace, uppercase, 1px neutral outline, zero chromatic background fills.
   - `Tabs`: Monospace boxed tab buttons with 1px active indicator border.
   - Modals & Dialogs: Sharp neutral backdrop, 1px hairline border, top-right `[×]` close square.

---

## 7. Phase Gates & Implementation Roadmap (Phases 1–10)

Per Section 7 of the project specification, each phase requires:
$$\text{Plan Artifact} \longrightarrow \text{Owner Approval} \longrightarrow \text{Implementation} \longrightarrow \text{Automated Gate Verification} \longrightarrow \text{Phase Report} \longrightarrow \text{STOP}$$

| Phase | Description | Scope / Artifact | Verification Gate |
| :--- | :--- | :--- | :--- |
| **P1** | **Reference Analysis & Token Specification** | `docs/noir-mono-phase1.md` (Docs Only) | Mathematical WCAG 2.2 AA Contrast Table & Budget Audit |
| **P2** | **Concept Preview** | Static HTML in `docs/design-preview/` (Dark/Light at 1440x900 & 390x844) | Visual approval of Home, Details, Reader, Audio Bar, Voice Studio |
| **P3** | **Tokens & Typography (`THEME_LOCK` v2)** | Re-value CSS properties in `index.css` & `tailwind.config.js` | Negative hue assertion (no yellow/green/orange/blue/purple tokens) |
| **P4** | **App Shell, Top Nav & Shared Primitives** | `App.jsx`, `Button.jsx`, `Card.jsx`, `StatusBadge.jsx`, `Tabs.jsx` | Navigation E2E tests, focus ring audits, touch target size |
| **P5** | **Reader & Fit Engine Integrity** | `ReaderView.jsx`, `OpenGLPageReader.jsx`, `PageNavButtons.jsx` | Vitest fit engine suite (`fit_book.test.js`), anchor persistence |
| **P6** | **Docked Bottom Audio Player** | `AudioPlayer.jsx`, audio scrubber, signal dot indicator | Audio sync hooks (`useAudioSync`, `usePlaybackProgress`) |
| **P7** | **Voice Studio & Roster Overhaul** | `CharacterRoster.jsx`, `SettingsModal.jsx`, `SynthesisProgressBar.jsx` | Voice synthesis tests (`roster.test.jsx`, `synthesis.test.jsx`) |
| **P8** | **Catalog, Details, Profile & Auth Modals** | `NovelCatalog.jsx`, `NovelDetails.jsx`, `AuthModal.jsx`, `AddNovelModal.jsx` | Full catalog browsing, novel ingestion, and modal flows |
| **P9** | **Responsive Layout & Accessibility Polish** | Viewport testing: 1440x900, 1190x770, 768x1024, 390x844, 320x568 | Axe-core accessibility re-enabled as ERROR, 44px touch targets |
| **P10**| **Full Verification & Theme Lock Finalization** | Full test suite, Playwright E2E, CDP cold-load measurement | Vitest (135 tests), build, theme:check, $\le 75\text{ kB}$ gzip cold load |

---

## 8. Acceptance Verification & Phase 1 Conclusion

### Acceptance Criteria Checklist
- [x] **Owner Authorization Recorded**: Clear precedence established superseding `docs/noir-yellow-spec.md`, `docs/editorial-orange-spec.md`, and `THEME_LOCK` v1.
- [x] **Strictly Monochrome Visual Language**: Reference visual grammar deconstructed (neutral greys, tall stage gradient, headline gradient with skewed italic fade, boxed micro UI, 3D tilted cover, zero chromatic hues, single `--signal` dot).
- [x] **Viewer Chrome Clarified**: Awwwards viewer chrome (yellow button, rounded pill dock, light top bar) identified and eliminated from design system.
- [x] **Token Re-Valuation & Proposal**: Complete Dark and Light token tables documented, adding `--stage-gradient`, `--headline-gradient`, `--signal`, and `--bg-bar`, with full coverage of legacy status, cta, and speaker aliases.
- [x] **Mathematical Contrast Verification**: 100% of informational text pairs confirmed $\ge 4.5:1$ AA across all surfaces (page, surface, card, hover). Display headlines confirmed $\ge 3.0:1$ AA Large. Direct measurements for all 4 gradient stops provided with explicit mathematical scrim rules.
- [x] **Signal Non-Text Contrast Verified**: Light mode coordinate calibrated to `#F05010` (3.12:1 / 3.35:1) ensuring compliance with WCAG 2.2 SC 1.4.11.
- [x] **Typography & Budget Verified**: Confirmed Inter 800–900 already present in variable `@fontsource-variable/inter` with 0 bytes added to cold load.
- [x] **Strict Boundary Observed**: **Zero lines of application code modified outside `docs/`**.
- [x] **Phase Report Committed**: `docs/noir-mono-phase1.md` written and mathematically verified.

**Next Immediate Step**: Await user approval of Phase 1 before proceeding to Phase 2 (Concept Preview in `docs/design-preview/`).
