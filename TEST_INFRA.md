# SyncTone Requirement-Driven E2E Test Infrastructure

## 1. Test Philosophy & Principles

SyncTone's E2E test infrastructure is built upon the following immutable engineering principles:

1. **Opaque-Box Requirement Verification**:
   Tests evaluate the system strictly against requirements specified in `ORIGINAL_REQUEST.md` (R1: Premium Interaction & Visual Polish, R2: Color Palette & Styling Guardrails, R3: Performance Budget & Test Suite). Tests do not rely on fragile internal implementation details; they verify observable DOM behaviors, computed styles, visual transitions, network waterfalls, and build artifacts.

2. **Zero Facade & Zero Cheating**:
   No mock assertions that bypass logic. No synthetic passes. Every assertion measures real properties (e.g. gzip-compressed production assets via standard zlib compression, real Playwright browser interactions, AST-based codebase scans, and live computed CSS values).

3. **Four-Tier Test Hierarchy**:
   - **Tier 1 — Feature Coverage**: Baseline verification of each functional requirement (>=5 test cases per requirement: R1, R2, R3).
   - **Tier 2 — Boundary & Corner Cases**: Stress conditions, extreme viewports (320px to 2560px), font scale boundaries, zero-blue AST scans, decimal byte budgets (<= 75,000 bytes gzip), and rapid state toggle stress.
   - **Tier 3 — Cross-Feature Combinations**: Pairwise and multi-feature state transitions (theme toggles during active playback, reader focus mode transitions, continuous reader progress tracking audio position, font toggles in 3D reader mode).
   - **Tier 4 — Real-World User Scenarios**: End-to-end user journeys encompassing browsing, listening, reading, and customizing the application experience.

4. **Progressive Testability & Isolation**:
   Every test case is self-contained and independently executable. Setup and teardown isolate browser state, local storage, and route contexts without cross-test leakage.

---

## 2. Feature Inventory & Requirement Mapping

| Req ID | Feature Area | Description | Verification Method | Target Threshold |
| :--- | :--- | :--- | :--- | :--- |
| **R1.1** | Micro-Animations & Keyframes | CSS animations (`fadeIn`, `slideDown`, `scaleUp`, `eqBounce`) with smooth cubic-bezier timing. | Playwright computed style inspection & keyframe presence | No layout shift (CLS < 0.05), active transitions |
| **R1.2** | Typography Finesse | Editorial typography scale using Inter (sans), Newsreader (serif/display), JetBrains Mono. | Playwright computed font-family & fluid size checks | Correct font stack loaded, no clipping |
| **R1.3** | Glass & Depth Effects | Layered surfaces, backdrop blur, elevation cards, and floating glass dock. | Playwright backdrop-filter & shadow inspection | `backdrop-filter: blur()`, `--shadow-*` applied |
| **R1.4** | Tactile Spring Physics | Active click depression on buttons, chevrons, player transport, and sidebar nav. | DOM pseudo-class analysis & transform verification | `active:scale-90` / `active:scale-95` present |
| **R1.5** | Visual Feedback & Audio Dock | Audio scrubber timecode preview badge and animated mini-equalizer bars. | Mouse hover interaction & visualizer state check | Scrubber tooltip visible on hover; EQ active |
| **R2.1** | Sage Green Integration | Incorporation of Sage Green (`#87A96B`) into brand tokens, badges, and accents. | Tailwind token audit & element style evaluation | `#87A96B` defined and rendered |
| **R2.2** | Walnut Brown Integration | Incorporation of Walnut Brown (`#5A3E2B`) into brand tokens, CTAs, and gradients. | Tailwind token audit & element style evaluation | `#5A3E2B` defined and rendered |
| **R2.3** | Amber Glow Integration | Incorporation of Amber Glow (`#D5851F`) into brand tokens, highlights, and equalizers. | Tailwind token audit & element style evaluation | `#D5851F` defined and rendered |
| **R2.4** | Earthy Luxury Palette | Deep Espresso (`#1A120E`), Dark Chocolate (`#3A2418`), Warm Bronze (`#A88462`), Soft Sand (`#D5C4AE`). | CSS custom property assertions & color parity check | Zero drift against reference baselines |
| **R2.5** | Strict Zero-Blue Rule | 100% elimination of blue hues, blue Tailwind classes, and cold-blue tinted hexes. | Full AST & regex codebase scanner | 0 blue hexes / 0 blue utility classes |
| **R3.1** | Home Cold-Load Bundle Budget | Home initial JavaScript payload must not exceed 75 kB gzip. | Production build analysis with zlib level 9 | Total initial JS <= 75,000 bytes gzip |
| **R3.2** | Critical Path Code-Splitting | Zero `framer-motion`, `pdfjs-dist`, or `foliate-js` on initial Home bundle. | Rollup chunk AST & entry chunk dependency check | Isolated to lazy-loaded chunks only |
| **R3.3** | Unit Test Suite Integrity | All Vitest test suites must pass without regression. | Programmatic Vitest CLI runner | 18 test files, 115 tests passing (100%) |
| **R3.4** | Theme Lock & Hardening Parity | Playwright theme-lock regression suites pass with 0 color delta. | Playwright theme-lock test runner | 18 passed (0 color delta, within geometry thresholds) |

---

## 3. Test Architecture & File Layout

```
SyncTone-/
├── TEST_INFRA.md                          # Test infrastructure architecture and contracts (this file)
├── TEST_READY.md                          # Readiness certification with runner command and summary
└── novel-audio-synthesizer/frontend/
    ├── e2e/
    │   ├── requirements.spec.js           # Playwright E2E browser suite (Tiers 1, 2, 3, 4)
    │   ├── budget-and-codebase.spec.mjs   # Fast Node.js audit (Bundle budget, zero-blue AST, Vitest)
    │   ├── run-all-requirements.mjs       # Unified master test runner script (CLI exit 0/1)
    │   ├── theme-lock.spec.js             # Existing permanent theme lock baseline suite
    │   └── hardening.spec.js              # Existing hardening & accessibility suite
    ├── playwright.config.js               # Playwright configuration (Chromium, baseURL http://localhost:5174)
    └── src/__tests__/                     # Vitest unit & integration test files (18 files, 115 tests)
```

### Execution Pipeline

```
  +-------------------------------------------------------------------------+
  |              Master Runner: run-all-requirements.mjs                    |
  +-------------------------------------------------------------------------+
                                       |
          +----------------------------+----------------------------+
          |                                                         |
          v                                                         v
+-----------------------------+                           +-----------------------------+
| Stage 1: Static Audits      |                           | Stage 2: Vitest Suite       |
| - Bundle Budget <= 75 kB gz |                           | - 18 test files             |
| - Zero-Blue AST/Regex Scan  |                           | - 115 unit & int. tests     |
| - Palette Tokens Check      |                           | - Theme lock contracts      |
+-----------------------------+                           +-----------------------------+
          |                                                         |
          +----------------------------+----------------------------+
                                       |
                                       v
          +---------------------------------------------------------+
          | Stage 3: Playwright E2E Suite (requirements.spec.js)    |
          | - Tier 1: Feature Coverage (R1, R2, R3)                 |
          | - Tier 2: Boundary & Corner Cases (Mobile, Viewports)   |
          | - Tier 3: Cross-Feature Combinations (Audio + Theme)    |
          | - Tier 4: Real-World Scenarios (Listener/Reader Flows)  |
          +---------------------------------------------------------+
                                       |
                                       v
  +-------------------------------------------------------------------------+
  | Stage 4: Aggregate Reporting & Exit Code (0 = PASS, 1 = FAIL)           |
  +-------------------------------------------------------------------------+
```

---

## 4. Test Tiers & Coverage Breakdown

### Tier 1: Feature Coverage (17 test cases)
- **R1: Premium Interaction & Visual Polish** (6 tests):
  - `T1-R1-01`: Keyframes & micro-animations exist (`fadeIn`, `slideDown`, `scaleUp`, `shake`) without layout shifts.
  - `T1-R1-02`: Glassmorphic dock and header elevation compute backdrop blur and translucent background.
  - `T1-R1-03`: Typography hierarchy maintains modular scale and loads variable font stacks.
  - `T1-R1-04`: Tactile spring physics: Interactive buttons and transport controls show active depression scaling.
  - `T1-R1-05`: Audio player scrubber renders hover timecode preview and responsive thumb.
  - `T1-R1-06`: Billboard Hero dynamic soundwave visualizer renders multi-bar rhythm.
- **R2: Color Palette & Styling Guardrails** (6 tests):
  - `T1-R2-01`: Sage Green (`#87A96B`) token integrated in brand palette and verified badge styling.
  - `T1-R2-02`: Walnut Brown (`#5A3E2B`) token integrated in brand palette and CTA deep tones.
  - `T1-R2-03`: Amber Glow (`#D5851F`) token integrated in brand palette and highlight accents.
  - `T1-R2-04`: Earthy Luxury palette integrity across dark and light root tokens.
  - `T1-R2-05`: Zero-Blue rule: CSS stylesheets and rendered DOM contain no blue tokens or cold blue tints.
  - `T1-R2-06`: Theme toggle preserves 0 color delta against reference computed tokens.
- **R3: Performance Budget & Test Suite** (5 tests):
  - `T1-R3-01`: Production build generates Home cold-load JavaScript bundle <= 75 kB gzip.
  - `T1-R3-02`: Home critical path has zero `framer-motion` imports (chunk isolation).
  - `T1-R3-03`: Zero heavy document parsers (`pdfjs-dist`, `foliate-js`) in initial entry scripts.
  - `T1-R3-04`: All 115 Vitest tests pass across all 18 test files.
  - `T1-R3-05`: Critical render path font optimization (unreferenced external fonts removed).

### Tier 2: Boundary & Corner Cases (16 test cases)
- **R1 Boundaries** (6 tests):
  - `T2-R1-01`: Mobile 320px viewport stress: No horizontal overflow, touch targets >= 44px.
  - `T2-R1-02`: Ultrawide 2560px viewport stress: Grid containment without layout breakdown.
  - `T2-R1-03`: Extreme typography scaling: Reader font sizing stepper min/max without overflow.
  - `T2-R1-04`: Rapid theme toggle stress: 10 successive toggles without animation lock or flash.
  - `T2-R1-05`: Rapid transport toggle stress: Rapid play/pause without state desync.
  - `T2-R1-06`: Accessibility: Reduced motion preference (`prefers-reduced-motion: reduce`) honored.
- **R2 Boundaries** (5 tests):
  - `T2-R2-01`: Full AST/Regex codebase scanner: Zero blue tokens across all source files and SVGs.
  - `T2-R2-02`: Contrast boundary: Sage Green (`#87A96B`) on Deep Espresso (`#1A120E`) meets WCAG AA (>= 4.5:1).
  - `T2-R2-03`: Contrast boundary: Amber Glow (`#D5851F`) on Deep Espresso (`#1A120E`) meets WCAG AA (>= 4.5:1).
  - `T2-R2-04`: Inverted theme light mode boundary: Warm Editorial Sand background without cool cast.
  - `T2-R2-05`: SVG asset scan: Pure SVG icons use `currentColor` or Earthy Luxury colors only.
- **R3 Boundaries** (5 tests):
  - `T2-R3-01`: Decimal byte threshold: Cold-load gzip <= 75,000 bytes with headroom reporting.
  - `T2-R3-02`: Network throttling simulation (Fast 3G): Skeleton shimmer placeholders render properly.
  - `T2-R3-03`: Offline PWA boundary: `sw.js` and `offline.html` boot cleanly.
  - `T2-R3-04`: Error boundary: Network 500 error surfaces graceful error card with retry action.
  - `T2-R3-05`: DOM node budget: Catalog page maintains under 1,500 DOM elements.

### Tier 3: Cross-Feature Combinations (6 test cases)
- `T3-01`: Theme Toggle + Audio Playback: Active playback continues uninterrupted across theme switch with 0 color delta dock update.
- `T3-02`: Theme Toggle + Reader Focus Mode: Switching theme in Focus Mode updates background and prose without exiting focus overlay.
- `T3-03`: Continuous Reading + Audio Sync: Playback progress advances active reading turn aura and synchronizes prose.
- `T3-04`: Reader 3D Mode + Font Switcher + Font Sizing: Font family and size adjustments update OpenGL dual-page spread cleanly.
- `T3-05`: Search Query + Tab Navigation + Modal Interaction: Search query and active tab persist across modal open/close.
- `T3-06`: Audio Scrubber Hover + Playback Seek: Scrubber hover tooltip accurately previews timestamp; click seeks audio.

### Tier 4: Real-World Scenarios (4 test cases)
- `T4-01`: **The Avid Listener Journey**: Home -> Top 10 carousel -> Novel Details -> Start Listening -> Audio Dock -> Scrubber Tooltip -> Speed Adjustment.
- `T4-02`: **The Immersive Reader Journey**: Novel Details -> Start Reading -> Reader View -> Font Toggle (Serif/Sans) -> Font Size Stepper -> TTS Clean Sanitizer -> Focus Mode.
- `T4-03`: **The Night-to-Day Ambient Journey**: Dark Mode Home -> Settings Modal -> Light Mode Switch -> Smooth Transition Check -> Close via Escape.
- `T4-04`: **The Complete Web-Novel Exploration Flow**: Catalog Search (`/` key) -> Select Novel -> Character Roster Cast Review -> Voice Quote Playback -> Chapter Reader.

**Total Test Cases**: **43 comprehensive test cases**

---

## 5. Coverage Thresholds & Budgets

| Metric | Target Threshold | Authoritative Verification Source |
| :--- | :--- | :--- |
| Cold-Load Home JS (gzip) | **<= 75.00 kB** (<= 75,000 bytes) | `dist/index.html` scripts gzipped with `zlib.gzipSync(level: 9)` |
| Vitest Test Suite | **115 / 115 passing** (100%) | `npx vitest run` in `novel-audio-synthesizer/frontend` |
| Zero-Blue Violations | **0 violations** | AST & regex scan across all `src/`, `public/`, and configs |
| Theme Lock Color Drift | **0 color delta** | Computed style comparison against `computed-ref.json` |
| Viewport Responsiveness | **320px to 2560px** | Playwright viewport resizing without horizontal overflow |
| Touch Target Minimum | **>= 44px x 44px** | Bounding box measurements on mobile viewports |

---

## 6. How to Run the Tests

### Quick Master Runner (All Tiers 1-4)
```bash
node novel-audio-synthesizer/frontend/e2e/run-all-requirements.mjs
```

### Running Specific Suites
- **Playwright E2E Browser Suite (Tiers 1-4)**:
  ```bash
  cd novel-audio-synthesizer/frontend && npx playwright test e2e/requirements.spec.js
  ```
- **Static Codebase & Bundle Budget Audit (Tiers 2 & 3)**:
  ```bash
  node novel-audio-synthesizer/frontend/e2e/budget-and-codebase.spec.mjs
  ```
- **Vitest Unit Suite (115 tests)**:
  ```bash
  npm test --prefix novel-audio-synthesizer/frontend
  ```
- **Existing Theme-Lock Suite**:
  ```bash
  npm run theme:check --prefix novel-audio-synthesizer/frontend
  ```
