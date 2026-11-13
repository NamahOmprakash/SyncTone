# Phase 4: App Chrome & Navigation Redesign

**Project**: SyncTone — Noir Monochrome Redesign (Full Visual & UX Overhaul)  
**Phase**: Phase 4 of 10  
**Precedence**: Supersedes `docs/noir-yellow-spec.md` (withdrawn), `docs/editorial-orange-spec.md`, and `THEME_LOCK` v1.  
**Status**: **PHASE 4 COMPLETE & VERIFIED**. All 19 test suites (136/136 tests) pass green. Cold-load JS bundle at 28.44 kB gzip (budget $\le 75\text{ kB}$).

---

## 1. Executive Summary & Deliverables

Phase 4 transforms the application chrome and navigation shell into the **Noir Monochrome** aesthetic, derived strictly from `docs/design-reference/reference-hero.png` and matching the approved Phase 2 contact sheets:

### Key Deliverables

1. **`TopHeader.jsx` (`novel-audio-synthesizer/frontend/src/components/TopHeader.jsx`)**:
   - Pinned 56px sticky top navigation bar with opaque `--bg-bar` (`#141416` in dark, `#F7F7F8` in light) and 1px hairline bottom boundary (`--border-subtle`).
   - Minimalist monochrome brand mark (sharp 14×14 square) + `SYNCTONE` in uppercase tracking-widest JetBrains Mono (`letter-spacing: 0.14em`).
   - Micro UI editorial navigation links prefixed with `+`:
     - `+ LIBRARY`: Navigates to catalog repertory.
     - `+ ARCHIVE`: Navigates to novel details and volume archives.
     - `+ VOICES`: Navigates to voice studio / character roster.
     - `+ READER`: Navigates to active reading surface.
     - Active states denoted by high-contrast text and sharp 1px indicator border.
   - Reader Cast Roster button: Sharp boxed button (`.boxed-btn`) with circular indicator dot (`[● CAST ROSTER]`).
   - Interactive Theme Toggle: Boxed button (`.boxed-btn`) displaying real-time state: `• THEME: DARK` / `• THEME: LIGHT`.
   - Settings trigger: Boxed button (`.boxed-btn`) with 1px border.
   - High-Contrast Primary Auth CTA: Boxed button (`.boxed-btn-primary`) featuring inverted fill (`#F2F2F3` on dark / `#0B0B0D` on light) and preceded circular dot indicator (`[● SIGN IN]`), preserving accessibility and automated test contracts.

2. **`SidebarNav.jsx` (`novel-audio-synthesizer/frontend/src/components/SidebarNav.jsx`)**:
   - Desktop 72px rail container re-styled with opaque `--bg-bar` (`#141416` / `#F7F7F8`) and 1px hairline right boundary (`--border-subtle`).
   - Completely eliminated all legacy Earthy Luxury hardcoded colors (`#3A2418`, `#1A120E`, `#D5851F`, `#87A96B`, `#D5C4AE`, `#4A4A46`).
   - Replaced rounded 11px/12px pills with sharp monolithic 40×40px boxed buttons (`rounded-[1px]`) and 1px hairline borders (`--border-subtle` / `--border-strong`).
   - Active navigation state uses inverted primary fill (`bg-[var(--accent)] text-[var(--on-accent)] border-[var(--accent)]`).
   - Theme toggle button integrated into rail with clean monochrome `moon`/`sun` icon.
   - User account avatar button styled with sharp 40×40px boxed geometry.
   - Mobile navigation bar converted to `bg-[var(--bg-bar)] border-t border-[var(--border-subtle)] h-14` with sharp boxed mono labels.

3. **`NovelCatalog.jsx` (`novel-audio-synthesizer/frontend/src/components/NovelCatalog.jsx`)**:
   - Catalog utility header harmonized with Noir Monochrome geometry.
   - Instant search input styled with 1px sharp border (`rounded-[1px]`), `--bg-card` surface, mono placeholder, and `/` focus pill.
   - Channel filter tabs converted to boxed sharp buttons (`rounded-[1px]`) with inverted high-contrast active tab (`bg-[var(--accent)] text-[var(--on-accent)] font-bold`) and zero chromatic green/amber pills.

---

## 2. Verification Checklist & Gate Results

| Verification Item | Target Standard | Status | Measured Result |
| :--- | :--- | :--- | :--- |
| **THEME_LOCK v2 Suite** | Zero chromatic tokens, parity check | **PASS** | 5/5 tests passing |
| **Vitest Test Suite** | 100% green across all test files | **PASS** | 19/19 files, 136/136 tests passing |
| **Vite Production Build** | Compiles with 0 warnings/errors | **PASS** | Built in 3.59s |
| **Cold-Load JS Budget** | $\le 75\text{ kB}$ gzip | **PASS** | **28.44 kB gzip** |
| **CSS Bundle Budget** | Minimal footprint | **PASS** | **19.23 kB gzip** |
| **Zero-Byte Font Overhead** | Variable font axes, 0 new downloads | **PASS** | Unchanged font chunks |
| **Frozen Systems Integrity** | Audio sync, book fit, APIs frozen | **PASS** | Zero edits to core logic |

---

## 3. Next Step: Phase 5 (Hero Stage & Catalog Grid)

Phase 5 will proceed to implement the core landing and catalog visuals:
1. **Tall 4-Stop Stage Gradient**: Applying `--stage-gradient` (`#0A0A0C` $\to$ `#2A2A2E` $\to$ `#7B7B7E` $\to$ `#C2C2C4` on dark; mirrored on light) with protective text scrim.
2. **Display Headline**: Giant Inter 800–900 uppercase headline filled with `--headline-gradient` and skewed italic fade (`skewX(-10deg) italic`) for "TOLD IN SOUND".
3. **Hero Triad Grid & 3D Tilted Cover**: Monospace credits on left, CSS 3D perspective tilted novel jacket in center, concise sans blurb and boxed inverted CTAs on right.
4. **Sharp Catalog Cards & Top 10 Billboard**: 0–2px monolithic novel jackets, mono metadata badges, and Top 10 rank billboard.

