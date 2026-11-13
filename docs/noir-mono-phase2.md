# Phase 2: Noir Monochrome Concept Preview Specification & Visual Audit

**Project**: SyncTone — Noir Monochrome Redesign (Full Visual & UX Overhaul)  
**Phase**: Phase 2 of 10 (Concept Preview & Visual Verification)  
**Precedence**: Implements Phase 1 specifications (`docs/noir-mono-phase1.md`) and approved Implementation Plan (`noir_monochrome_phase1_plan.md`).  
**Status**: **PHASE 2 COMPLETE (STATIC PREVIEW & SCREENSHOT ASSETS)**. Strictly zero lines of production code in `src/` modified.

---

## 1. Executive Summary & Authorization

Phase 2 translates the mathematical token architecture, typography hierarchy, and deconstructed visual grammar established in Phase 1 into static, interactive, pixel-perfect HTML/CSS concept preview pages housed exclusively inside `docs/design-preview/`.

### 1.1 Precedence & Strict Boundary Enforcement
- **Docs-Only Scope**: In strict accordance with the project guidelines, **zero modifications were made to any application source files in `src/`** or existing React components.
- **Isolated Design Preview**: All preview assets, self-hosted variable font files, CSS design tokens, and interactive scripts reside strictly within `docs/design-preview/`.
- **System Parity**: The preview demonstrates 100% token fidelity to the approved Phase 1 specification (`docs/noir-mono-phase1.md`), including calibrated dark and light palettes, mathematically verified WCAG 2.2 AA contrast coordinates, and the strict single `--signal` dot rule.

---

## 2. Deliverables Inventory

| Asset Path | Type | Description |
| :--- | :--- | :--- |
| `docs/design-preview/index.html` | Interactive Showcase Harness | Master preview environment featuring sticky harness toolbar, screen switcher tabs (01–05 & All), live instant theme toggling (Dark/Light), responsive viewport simulation (1440×900 vs 390×844), and audio player simulation. |
| `docs/design-preview/home.html` | Standalone Page | **Screen 1**: Home Stage & Hero Section with tall vertical `--stage-gradient`, giant Inter 800–900 display headline with `skewX(-10deg)` italic fade, 3D tilted book cover (CSS perspective), mono credits, short sans blurb, boxed inverted CTA, and sharp volume cards catalog. |
| `docs/design-preview/novel-detail.html` | Standalone Page | **Screen 2**: Novel Detail View with full-bleed stage, giant title, mono metadata, boxed mono tabs (`OVERVIEW` / `CAST` / `CHAPTERS` / `DETAILS` / `SCORE`), inverted primary `[● LISTEN]` CTA, chapter directory, and cast roster. |
| `docs/design-preview/reader.html` | Standalone Page | **Screen 3**: Reader Canvas with calm flat reading surface (`#0B0B0D` / `#EFEFF0`, zero gradient), Newsreader body text constrained to 60–75ch measure, mono floating toolbar, preserved fit bounds, and page turn chevrons in gutters. |
| `docs/design-preview/audio-player.html` | Standalone Page | **Screen 4**: Docked Bottom Audio Player Bar with sharp 72px dock (`--bg-bar`), 48×48 cover art, mono title/timecode, boxed playback controls, inverted `[▶ PLAY]`, interactive scrubber, and $\le$ 8px `--signal` dot. |
| `docs/design-preview/voice-studio.html` | Standalone Page | **Screen 5**: Voice Synthesis Studio sheet container with boxed mono tabs (`CAST` / `VOICES` / `SETTINGS` / `GENERATE`), neutral character roster badges with typographic hierarchy, synthesis progress indicator, and timbre controls. |
| `docs/design-preview/css/noir-mono.css` | Stylesheet | Complete standalone CSS token architecture, resets, and layout components implementing Dark and Light palettes. |
| `docs/design-preview/js/noir-mono.js` | JavaScript Harness | Real-time interactive script handling theme switching, viewport resizing, screen navigation, audio scrubber seeking, and typography adjustments. |
| `docs/design-preview/fonts/` | Font Directory | Self-hosted WOFF2 files: `inter-latin-wght-normal.woff2`, `inter-latin-wght-italic.woff2`, `jetbrains-mono-latin-wght-normal.woff2`, `newsreader-latin-wght-normal.woff2`, and `newsreader-latin-wght-italic.woff2`. |
| `docs/screenshots/noir-mono/` | Visual Artifacts | 20 individual screenshots across both themes and viewports (1440×900 and 390×844) plus 2 high-resolution visual contact sheets (`noir-mono-dark-contact-sheet.png` and `noir-mono-light-contact-sheet.png`). |

---

## 3. High-Fidelity Deconstruction of the 5 Core Screens

### 3.1 Screen 1: Home Stage & Catalog (`home.html`)
- **Stage Gradient**:
  - Dark: `linear-gradient(180deg, #0A0A0C 0%, #2A2A2E 35%, #7B7B7E 70%, #C2C2C4 100%)`.
  - Light: `linear-gradient(180deg, #F4F4F5 0%, #D9D9DB 35%, #8A8A8D 70%, #1A1A1C 100%)`.
- **Display Typography**:
  - Headline set in Inter 900, uppercase, tracking tight (`-0.05em`), line-height compressed (`0.88`).
  - Gradient text clipping via `background-clip: text` using `var(--headline-gradient)`.
  - Secondary phrase (`"TOLD IN SOUND"`) rendered with `transform: skewX(-10deg); font-style: italic; opacity: 0.45;`, delivering an aggressive architectural fade.
- **Hero Object Triad**:
  - **Left**: JetBrains Mono author/cast metadata credits (`FEATURED TITLE`, `AUTHOR`, `NEURAL VOICE CAST`, `RUNTIME & SCOPE`, `ACOUSTIC PIPELINE`).
  - **Center**: 3D Tilted Novel Jacket featuring realistic CSS 3D perspective transforms (`perspective: 1200px; transform: rotateY(-18deg) rotateX(8deg);`) with deep multi-layered shadows, spine crease, and debossed geometric compass graphic.
  - **Right**: Concise Inter regular/medium editorial blurb flanked by a solid scrim box (`rgba(11, 11, 13, 0.94)` dark / `rgba(255, 255, 255, 0.96)` light) housing inverted primary CTA `[● LISTEN NOW]` and secondary CTA `[● PLAY SAMPLE & READ]` with tiny `--signal` dot.
- **Catalog of Sharp Volume Cards**:
  - Zero border-radius (`rounded-none` / 0px), 1px hairline perimeter (`--border-subtle`), flat `--bg-card` surface.
  - Strict 2:3 vertical aspect-ratio book jackets with mono volume stamps (`VOL. 01`, `VOL. 02`, etc.) and status badges.
  - Monospace tags: `+ MYSTERY`, `+ 24 CHAPTERS`, `+ 48KHZ`.

### 3.2 Screen 2: Novel Detail View (`novel-detail.html`)
- **Full-Bleed Stage Header**:
  - Breadcrumb and back navigation in JetBrains Mono (`← BACK TO ARCHIVE CATALOG`).
  - Giant volume title in Inter 900 (`THE ADVENTURES OF SHERLOCK HOLMES`).
  - Technical metadata bar: `AUTHOR: SIR ARTHUR CONAN DOYLE • DURATION: 08H 42M 16S • CHAPTERS: 24 TRACKS • VOICES: 5 NEURAL CAST • FORMAT: STEREO BINAURAL`.
  - Primary inverted CTA `[● LISTEN TO NOVEL]` accompanied by secondary boxed buttons.
- **Boxed Monospace Tabs**:
  - Navigation tabs: `[ OVERVIEW ]`, `[ CAST ROSTER (5) ]`, `[ CHAPTERS (24) ]`, `[ TECHNICAL DETAILS ]`, `[ ATMOSPHERIC SCORE ]`.
  - Active tab indicated by high-contrast bottom border and subtle alpha wash (`var(--accent-surface)`).
- **Chapter Directory & Cast Roster**:
  - High-contrast chapter list items with hover feedback (`var(--bg-hover)`).
  - Track duration in JetBrains Mono (`38:14`, `42:05`).
  - Neural synthesis status badges (`[● SYNTHESIZED]`) with individual play triggers.
  - Detailed character breakdown mapping Sherlock Holmes (Speaker A), Dr. Watson (Speaker B Lead), Inspector Lestrade (Speaker C), and Mrs. Hudson (Speaker D).

### 3.3 Screen 3: Reader Canvas (`reader.html`)
- **Ergonomic Reading Canvas**:
  - Calm, completely flat neutral surface (`#0B0B0D` in dark mode, `#EFEFF0` in light mode).
  - Explicitly avoids stage gradients on reading surfaces to prevent eye strain and preserve literary focus.
- **Newsreader Serif Body Typography**:
  - Constrained strictly to **60–75ch measure** (`max-width: 72ch`).
  - Generous line-height (`1.85`) and typographic drop cap (`T`) for literary elegance.
  - Spoken dialogue highlighted with high-contrast neutral borders and subtle background wash (`var(--accent-surface)`), clearly displaying active speaker timecodes (`[● AUDIO SYNC 04:12.84 — SPEAKER B (WATSON)]`).
- **Floating Monospace Toolbar & Fit Engine Preservation**:
  - Positioned at sticky top with font sizing controls (`[A-] [A+]`), font switcher (`[NEWSREADER SERIF]`), and real-time reading progress (`PAGE 14 OF 342 // 4.1%`).
  - Guaranteed clearance: reserved top nav height (`56px`) and bottom player dock height (`--dock-safe-bottom: 72px`), ensuring literary text never collides with application chrome.
  - Gutter chevrons (`‹` and `›`) positioned strictly in outer margins outside the 72ch text column.

### 3.4 Screen 4: Docked Bottom Audio Player Bar (`audio-player.html`)
- **Dock Geometry & Surface**:
  - Pinned to viewport bottom (`position: fixed; bottom: 0; left: 0; right: 0; height: 72px;`).
  - Opaque `--bg-bar` surface (`#141416` in dark, `#F7F7F8` in light) with 1px top hairline boundary (`--border-subtle`).
  - Completely eliminates deprecated rounded pill docks and translucent blur filters.
- **Interactive Scrubber & Boxed Controls**:
  - 48×48px sharp cover art thumbnail with mono volume tag.
  - Real-time millisecond timecode readout: `04:12.84 / 38:14.00`.
  - Centered boxed playback cluster: `[◀◀ 10s]`, inverted primary `[⏸ PAUSE]` / `[▶ PLAY]`, `[10s ▶▶]`.
  - Full-width interactive audio scrubber displaying buffered progress (45%) and played progress (18%) with draggable thumb.
- **Signal Dot Indicator**:
  - Tiny $\le$ 8px circular dot (`#FF5A1F` dark / `#F05010` light) adjacent to `[● LIVE SYNC]`.
  - Exclusively indicates live audio streaming; strictly prohibited from appearing as text, border, or button fill.

### 3.5 Screen 5: Voice Synthesis Studio (`voice-studio.html`)
- **Sheet Container & Navigation**:
  - Sharp rectangular card container with 1px solid hairline perimeter (`--border-strong`).
  - Boxed monospace navigation tabs: `[ CAST ROSTER ]`, `[ NEURAL VOICES ]`, `[ TIMBRE SETTINGS ]`, `[ SYNTHESIS PIPELINE ]`.
- **Synthesis Progress Indicator Banner**:
  - Active block readout: `SYNTHESIZING CHAPTER 02: THE RED-HEADED LEAGUE`.
  - High-contrast neutral progress track with filled bar in `--text-main` (`74%`).
  - Precise status label: `PROGRESS: 74% COMPLETE // 1,420 OF 1,920 BLOCKS // ESTIMATED REMAINING: 01M 14S`.
  - Live indicator: `<span class="signal-dot"></span> GENERATING AUDIO BLOCKS`.
- **Neutral Character Roster Badges**:
  - Character roles differentiated strictly via monospace badge weight, borders, and typographic hierarchy:
    - Narrator: `[NARRATOR]` — Model: `Neural-Docu-UK-M`
    - Sherlock Holmes: `[SPEAKER A]` — Model: `Neural-Analytical-Male-V2`
    - Dr. John Watson: `[SPEAKER B]` — Model: `Neural-Warm-Male-UK`
    - Inspector Lestrade: `[SPEAKER C]` — Model: `Neural-Cockney-Male`
    - Mrs. Hudson: `[SPEAKER D]` — Model: `Neural-Matron-Female`
  - Strictly zero chromatic badge fills (no green, red, or yellow badges).
- **Acoustic Timbre Parameter Sliders**:
  - Sliders for emotional range, breath phoneme rate, and acoustic reverb styled with sharp native accents.

---

## 4. Theme & Viewport Verification Matrix

### 4.1 Theme Parity & Instant Toggle
The preview implements an instant, non-destructive theme toggle. Toggling between Dark Mode (`:root, html.dark`) and Light Mode (`html.light`) immediately repaints all 5 screens and child components without page reloads:

| Component / Token | Dark Mode Coordinate | Light Mode Coordinate | Measured Contrast | Compliance |
| :--- | :--- | :--- | :--- | :--- |
| **Page Base** (`--bg-page`) | `#0B0B0D` | `#EFEFF0` | Base Canvas | Compliant |
| **Primary Text** (`--text-main`) | `#F2F2F3` | `#0B0B0D` | **17.58:1** (Dark) / **17.11:1** (Light) | **AAA** |
| **Secondary Text** (`--text-sub`) | `#A9A9AF` | `#4F4F56` | **8.41:1** (Dark) / **7.07:1** (Light) | **AAA** |
| **Muted Text** (`--text-muted`)| `#898992` | `#65656C` | **4.96:1** on card / **5.03:1** on page | **AA** |
| **Primary Button** (`--accent`)| `#F2F2F3` (on `#0B0B0D` text) | `#0B0B0D` (on `#FFFFFF` text) | **17.58:1** (Dark) / **19.66:1** (Light) | **AAA** |
| **Boxed Border** (`--border-strong`)| `#5E5E66` | `#86868A` | **3.06:1** (Dark) / **3.16:1** (Light) | **AA Non-Text** |
| **Signal Dot** (`--signal`) | `#FF5A1F` | `#F05010` (calibrated) | **6.31:1** (Dark) / **3.12:1** (Light) | **AA Non-Text** |

### 4.2 Viewport Parity: Desktop (1440×900) & Mobile (390×844)
Every screen includes dedicated media queries ensuring seamless responsiveness:
- **Desktop (1440×900)**: Expansive hero stage with full 3-column triad (left credits, center 3D novel, right blurb/scrim CTA), 4-column catalog grid, full audio dock scrubber with timecodes, and gutter chevrons on reader.
- **Mobile (390×844)**: Responsive column collapse, compact top navigation header, touch-friendly 44px hit targets, stacked metadata cards, full-width book showcase, and streamlined audio player dock preserving essential controls and signal dot.

---

## 5. Visual Contact Sheets & Screenshot Artifacts Record

All screenshots were programmatically captured via headless Chromium at 2× retina resolution and verified:

### 5.1 Desktop Viewports (1440×900)
- `docs/screenshots/noir-mono/home-dark-1440x900.png` (437 kB)
- `docs/screenshots/noir-mono/home-light-1440x900.png` (477 kB)
- `docs/screenshots/noir-mono/novel-detail-dark-1440x900.png` (280 kB)
- `docs/screenshots/noir-mono/novel-detail-light-1440x900.png` (280 kB)
- `docs/screenshots/noir-mono/reader-dark-1440x900.png` (307 kB)
- `docs/screenshots/noir-mono/reader-light-1440x900.png` (306 kB)
- `docs/screenshots/noir-mono/audio-player-dark-1440x900.png` (227 kB)
- `docs/screenshots/noir-mono/audio-player-light-1440x900.png` (226 kB)
- `docs/screenshots/noir-mono/voice-studio-dark-1440x900.png` (245 kB)
- `docs/screenshots/noir-mono/voice-studio-light-1440x900.png` (246 kB)

### 5.2 Mobile Viewports (390×844)
- `docs/screenshots/noir-mono/mobile-home-dark-390x844.png` (195 kB)
- `docs/screenshots/noir-mono/mobile-home-light-390x844.png` (216 kB)
- `docs/screenshots/noir-mono/mobile-novel-detail-dark-390x844.png` (158 kB)
- `docs/screenshots/noir-mono/mobile-novel-detail-light-390x844.png` (158 kB)
- `docs/screenshots/noir-mono/mobile-reader-dark-390x844.png` (166 kB)
- `docs/screenshots/noir-mono/mobile-reader-light-390x844.png` (165 kB)
- `docs/screenshots/noir-mono/mobile-audio-player-dark-390x844.png` (150 kB)
- `docs/screenshots/noir-mono/mobile-audio-player-light-390x844.png` (150 kB)
- `docs/screenshots/noir-mono/mobile-voice-studio-dark-390x844.png` (126 kB)
- `docs/screenshots/noir-mono/mobile-voice-studio-light-390x844.png` (127 kB)

### 5.3 Composite Visual Contact Sheets
Composite multi-panel sheets were generated using an HTML5 Canvas rendering pipeline:
- **Dark Mode Contact Sheet**: `docs/screenshots/noir-mono/noir-mono-dark-contact-sheet.png` (1552×1602 px, 451 kB)
- **Light Mode Contact Sheet**: `docs/screenshots/noir-mono/noir-mono-light-contact-sheet.png` (1552×1602 px, 468 kB)

---

## 6. Phase 2 Acceptance Criteria Checklist

- [x] **Static Preview Pages in `docs/design-preview/`**: Standalone HTML pages created for all 5 screens (`home.html`, `novel-detail.html`, `reader.html`, `audio-player.html`, `voice-studio.html`) and an interactive master showcase (`index.html`).
- [x] **Strictly Zero Changes in `src/`**: Zero production code or components modified; `git status` verifies complete isolation to `docs/` and `scripts/`.
- [x] **Screen 1 (Home Stage)**: Tall vertical `--stage-gradient`, giant Inter 900 headline with `skewX(-10deg)` italic fade, 3D tilted book cover (CSS perspective), mono credits, sans blurb, boxed inverted CTA, and sharp volume cards catalog.
- [x] **Screen 2 (Novel Detail)**: Full-bleed stage, giant title, mono metadata, boxed mono tabs, inverted primary CTA, chapter directory, and character cast roster.
- [x] **Screen 3 (Reader Canvas)**: Calm flat reading surface (`#0B0B0D` / `#EFEFF0`) with zero gradient, Newsreader body text constrained to 60–75ch measure, mono floating toolbar, preserved fit bounds, and gutter chevrons.
- [x] **Screen 4 (Audio Player Bar)**: Sharp 72px dock `--bg-bar`, 48×48 cover art, mono title/timecode, boxed playback controls, inverted `[▶ PLAY]`, interactive scrubber, and $\le$ 8px `--signal` dot.
- [x] **Screen 5 (Voice Studio)**: Sheet container, boxed mono tabs, neutral character roster badges with typographic hierarchy, synthesis progress indicator, and timbre controls.
- [x] **Dual Theme Support**: Instant interactive theme toggle seamlessly switching between Dark and Light palettes.
- [x] **Responsive Layouts**: Validated across Desktop (1440×900) and Mobile (390×844) viewports.
- [x] **Automated Screenshot Capture**: 20 high-res screenshots and 2 visual contact sheets generated and verified.
- [x] **Specification Documentation Committed**: Comprehensive record documented in `docs/noir-mono-phase2.md`.

---

## 7. Next Immediate Step

With Phase 2 Concept Preview complete and fully verified, the project is ready for formal approval before initiating **Phase 3: Tokens & Typography (`THEME_LOCK` v2)**, where the calibrated CSS variables and Tailwind tokens will be introduced into `src/index.css` and `tailwind.config.js`.
