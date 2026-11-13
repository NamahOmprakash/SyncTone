# Phase 7 Deliverables: Reader Preview Chrome Parity & Fit Matrix Engine

**Branch**: `design/noir-mono`  
**Status**: Completed  
**Reference Specifications**:
- `docs/design-preview/reader.html` (Dark & Light)
- `docs/design-preview/audio-player.html`
- `docs/noir-mono-spec.md` (Sections 9.3, 9.4, 9.7, 9.8, 9.9)

---

## 1. Executive Summary

Phase 7 brings the SyncTone Reader to complete visual and functional parity with the approved Noir Monochrome design specification and interactive prototypes. It establishes a calm, distraction-free reading canvas with literary Newsreader typography, classic drop cap, floating monospace controls, seamless dual-mode reading (Normal continuous scroll and Moon+ OpenGL 3D two-page spread), and an adaptive viewport fit engine that guarantees zero unwanted scrollbars, no content clipping, and reading position persistence across live resizing and font scaling.

---

## 2. Core Architectural Components & Deliverables

### 2.1 Reader Chrome & Floating Toolbar
- **Container**: Calm flat neutral reading surface (`var(--bg-page)`) free of gradients or card borders.
- **Floating Monospace Toolbar (`.reader-floating-toolbar`)**:
  - Sticky at `top: 56px` (below the 56px pinned header).
  - Left Cluster:
    - Reading Mode Switcher: Sharp boxed segmented toggle between `Normal` and `OpenGL 3D`.
    - Font Scaling: `A- / A+` controls (updates font scale while preserving outer book geometry in 3D spread).
    - Monospace Font Toggle: `NEWSREADER SERIF` ↔ `INTER SANS`.
    - TTS Clean: Sanitizer filter toggle for OCR junk and duplicate paragraph cleaning.
    - Focus Mode: Distraction-free spotlight toggle (`hidden md:inline-flex`).
    - Fullscreen: Hardware-accelerated Fullscreen API toggle with Esc shortcut.
  - Right Cluster:
    - Chapter Navigator: Quick dropdown selector (`‹`, `<select>`, `›`).
    - Page Counter: Tabular monospace counter (`Page X of Y` / `current / total (pct%)`).
    - Audio Follow Along: Section 9.4 compliant button featuring an animated `--signal` dot strictly when audio is actively playing, reverting to neutral dot when paused.
    - Close Reader: Sharp boxed button `CLOSE [×]` returning cleanly to novel detail archive.

### 2.2 Editorial Literary Typography
- **Chapter Header (`.reader-book-header`)**:
  - Centered overline in JetBrains Mono: Book title and author in uppercase.
  - Giant Chapter Title (`.reader-chapter-title`): 28px Newsreader serif bold.
  - Dynamic Timecode / Cast Subline: Mono micro metadata with narrator credit.
- **Body Prose (`.reader-body-text`)**:
  - Set in Newsreader Variable serif (`--font-serif`) with 1.85 line-height and optimal 60-75ch measure.
  - Classic Drop Cap: Implemented via CSS pseudo-element `::first-letter` to preserve React DOM text node integrity for Testing Library unit test assertions while rendering high-contrast 3.8em serif drop caps in browsers.
  - High-Contrast Spoken Sentence Highlight: Active dialogue or narration segments receive `.reader-sync-active-para` with `--accent-surface` background, 2px solid left rule, speaker label, and audio playing badge.

### 2.3 Gutter Navigation Chevrons
- **Chevrons (`.gutter-chevron.gutter-chevron-left` and `.gutter-chevron.gutter-chevron-right`)**:
  - Pinned vertically at `top: 50%` in the outer reading gutters.
  - Large monospace chevrons (`‹` and `›`) with high-contrast hover and active states.
  - Automatically hidden on narrow mobile viewports (<640px) to maximize readable content area.

### 2.4 Fit Engine Integration (`fitBook`, `useBookFit`, `paginate`, `anchors`)
- **Stage Bounds**: Stage height is strictly bounded to `calc(100vh - 56px - var(--dock-safe-bottom, 72px))`.
  - Top header pinned at 56px (`h-14`).
  - Audio dock pinned at 72px (`--dock-safe-bottom`, `h-[72px]`).
  - Stage is centered vertically and horizontally with zero layout shift.
- **Dual Mode Preserved**:
  - **Normal Mode**: Continuous vertical scroll with sticky return-to-now pill when user scrolls away from active spoken turn.
  - **OpenGL 3D Spread Mode**: Two-page book spread with 3D perspective (`perspective-1200`), dynamic spine shadow canvas, and page curl transition animations.
  - **Mobile Single Page Fallback**: Automatically adopts single-page layout when viewport width is below 640px.
- **Half-Empty Page Distribution Fix**:
  - Implemented orphan rebalancing in `paginate.js` and `readerLayoutEngine.js`: when the terminal page contains only a single segment and the penultimate page has $\ge 3$ segments, segments are rebalanced across the final pages to avoid awkward whitespace.
- **Anchor Mechanism**:
  - Reading position persists across live window resize and font scale adjustments via `derivePageIndexFromAnchor` and `getAnchorSegmentIdFromPage`.

---

## 3. Playwright Fit Matrix Verification

A dedicated automated test suite (`scripts/test-reader-fit-matrix.mjs`) was developed and executed to test reader geometry and state persistence.

### Viewports Tested (All 9 Matrix Targets):
1. **1920x1080** (Desktop 1080p FHD): PASS — Zero horizontal scroll, chrome rendered.
2. **1440x900** (Desktop MacBook Pro reference): PASS — Zero horizontal scroll, chrome rendered.
3. **1366x768** (Standard Laptop): PASS — Zero horizontal scroll, chrome rendered.
4. **1280x720** (HD 720p): PASS — Zero horizontal scroll, chrome rendered.
5. **1024x768** (iPad 4:3 Landscape): PASS — Zero horizontal scroll, chrome rendered.
6. **768x1024** (Tablet Portrait): PASS — Zero horizontal scroll, chrome rendered.
7. **390x844** (Mobile Portrait - iPhone 12/13/14): PASS — Zero horizontal scroll, compact mobile toolbar.
8. **844x390** (Mobile Landscape): PASS — Zero horizontal scroll, compact mobile toolbar.
9. **320x568** (Small Mobile - iPhone SE 1st gen): PASS — Zero horizontal scroll (`scrollWidth: 320, windowWidth: 320`).

### Feature Tests:
- **A+ / A- Font Scale Outer Size Preservation**: Verified that increasing and decreasing font size re-paginates content while keeping outer book dimensions (`fit.book.w` and `fit.book.h`) invariant (1037px $\times$ 726px).
- **Live Viewport Resizing**: Verified live resizing from 1440x900 → 768x1024 → 390x844 without page overflow.
- **Reading Position via Anchor**: Verified spread navigation is retained across viewport resizing without resetting to Spread 0.
- **Fullscreen and Focus Mode**: Verified focus mode overlay activation, exit, and fullscreen button handlers.
- **Signal Dot (Section 9.4)**: Verified that paused audio displays neutral indicator dot, strictly preventing signal dot activation when inactive.
- **Both Reading Modes & Zero Page Scroll**: Verified Normal vertical scroll reader with gutter chevrons and OpenGL 3D perspective spread stage with zero page scroll (`scrollHeight <= window.innerHeight + 2`).
- **Both Themes**: Tested across Dark (`data-theme="dark"`) and Light (`data-theme="light"`).

**Summary**: 95/95 Playwright checks passed.

---

## 4. Parity Gate Measurements

Generated via `scripts/capture-parity.mjs` against `docs/screenshots/noir-mono`:
- **Top Bar Height**: 56px (`h-14`)
- **Player Bar Height**: 72px (`--dock-safe-bottom`, `h-[72px]`)
- **Type Sizes**:
  - Micro Monospace Labels: 10px–11px
  - Informational Text: 12px
  - Reader Body Prose: 16px–19px (user adjustable via A-/A+)
- **Generated Comparison Artifacts**:
  - `docs/parity/reader-dark.png`
  - `docs/parity/reader-light.png`
  - `docs/parity/measurements.json`

---

## 5. Vitest Regression Test Suite

All 19 test files in `novel-audio-synthesizer/frontend` pass cleanly with zero regressions:
- `src/__tests__/theme_lock.test.js` (5 tests)
- `src/__tests__/tts_sanitizer_golden.test.jsx` (14 tests)
- `src/__tests__/tts_engines.test.jsx` (6 tests)
- `src/__tests__/opengl_tts_focus.test.jsx` (16 tests)
- `src/__tests__/reader_dual_view.test.jsx` (10 tests)
- `src/__tests__/primitives.test.jsx` (21 tests)
- `src/__tests__/catalog.test.jsx` (5 tests)
- `src/__tests__/addnovel.test.jsx` (6 tests)
- `src/__tests__/ebook_sanitizer.test.jsx` (7 tests)
- `src/__tests__/frontend_fixes.test.jsx` (6 tests)
- `src/__tests__/auth.test.jsx` (6 tests)
- `src/__tests__/reader.test.jsx` (5 tests)
- `src/__tests__/chapters.test.jsx` (5 tests)
- `src/__tests__/delete_novel.test.jsx` (3 tests)
- `src/__tests__/synthesis.test.jsx` (4 tests)
- `src/__tests__/playback.test.jsx` (4 tests)
- `src/__tests__/roster.test.jsx` (4 tests)
- `src/__tests__/integration.test.jsx` (1 test)
- `src/__tests__/fit_book.test.js` (8 tests)

**Total**: 19 suites, 136 tests passed.
