# Phase 5 & 6: Hero Stage, Catalog Grid, Novel Details & Voice Roster

**Project**: SyncTone — Noir Monochrome Redesign (Full Visual & UX Overhaul per Section 9 Concept Parity)  
**Phase**: Phase 5 & Phase 6 of 10  
**Precedence**: Supersedes `docs/noir-yellow-spec.md` (withdrawn), `docs/editorial-orange-spec.md`, and `THEME_LOCK` v1.  
**Status**: **COMPLETE & VERIFIED**. All 19 test suites (136/136 tests) pass green. Cold-load JS bundle is ~27 kB gzip (well below the 75 kB budget).

---

## 1. Executive Summary & Deliverables

Phases 5 and 6 overhaul the home catalog, billboard hero stage, catalog grid, novel detail page, voice roster, and associated modals into the **Noir Monochrome** aesthetic, derived strictly from `docs/design-reference/reference-hero.png` and matching the approved Phase 2 contact sheets:

### Key Deliverables:

1. **Navigation Structure (Section 9.6)**:
   - Desktop and tablet: **Top bar only (56px)** — completely eliminated the legacy 72px left rail (`SidebarNav` desktop `<aside>` removed; `md:pl-[72px]` in `App.jsx` removed).
   - Sticky top bar (`TopHeader.jsx`) rendered universally across all routes, providing desktop navigation links (`+ LIBRARY`, `+ ARCHIVE`, `+ VOICES`, `+ READER`, `+ STUDIO`), theme toggle, settings, and sign-in button.
   - Mobile: Preserved compact top bar plus bottom nav bar (`h-14`) with sharp boxed mono items.

2. **Hero Stage (`NovelCatalog.jsx`)**:
   - Replaced old radial timber/bronze billboard with Noir Monochrome Hero Stage powered by `var(--stage-gradient)`.
   - Giant display headline: "STORIES THAT" (spanning 80–85% content width at 1440px) + skewed italic "SPEAK" with `var(--headline-gradient)`.
   - Eyebrow row: `FEATURED TITLE // {title}` with neutral dot and paused indicator.
   - Triad Grid:
     - Left: Real metadata credits ("AT A GLANCE": author, format, multi-voice, chapter count, narrator attribution).
     - Center: 3D tilted novel jacket using CSS perspective (`perspective: 1200px; rotateY(-18deg) rotateX(8deg)`).
     - Right: Literary synopsis, volume badge, and boxed action cluster (`Start Listening (Ch. 1)`, `Novel Details`).
   - Paginated numbered carousel slider (`01 —— 02 03`).

3. **Catalog Grid & Top 10 Carousel (`NovelCatalog.jsx`, `NovelCover.jsx`)**:
   - Top 10 carousel: Stroked outline typographic numbers (`--top10-stroke`), sharp 0–2px cards, neutral badges.
   - Catalog repertory grid: Monolithic volume cards, sharp 1px borders (`--border-subtle`), mono metadata badges (`+ GENRE`, `+ CHAPTERS`), boxed action buttons.
   - Fallback novel covers (`NovelCover.jsx`): Converted all legacy amber/sage/walnut palettes to pure monochrome palettes (`NOCTURNE OBSIDIAN`, `CARBON SLATE`, `GRAPHITE ASH`, `ALABASTER VELLUM`, `PURE MONOCHROME`).

4. **Novel Details (`NovelDetails.jsx`)**:
   - Breadcrumb bar (`← Back to Library` + breadcrumb index).
   - Full-bleed hero stage header with sharp physical cover jacket, real metadata bar, boxed action buttons (`Start Listening (Ch. 1)`, `Upload Chapter`, `+ Add to Library`, `Delete Novel (Dev)`).
   - Boxed mono tab bar: `CHAPTER DIRECTORY`, `CHARACTER CAST`, `SYNOPSIS & DETAILS`.
   - Chapter track list: Sharp 1px track items with mono track indices, chapter titles, duration, and `Read & Listen` button.
   - Character portfolio cards and "AT A GLANCE" details matrix.
   - Sharp monochrome confirmation delete modal.

5. **Character Roster & Voice Studio (`CharacterRoster.jsx`)**:
   - Removed all chromatic classes (`emerald-400`, `amber-400`, `sage`). Replaced with sharp monochrome badges (`PARADEE-8M`, `MACHINE EXTRA`, `PRIMARY CAST`).
   - Neutralized header, dialogue quotes, voice selects, and status notices.

6. **Upload Chapter Modal (`UploadChapterModal.jsx`)**:
   - Converted upload panel to sharp monochrome with JetBrains Mono form fields, boxed buttons, and neutral prose cleaner switch.

---

## 2. Verification Checklist & Gate Results

| Verification Item | Target Standard | Status | Measured Result |
| :--- | :--- | :--- | :--- |
| **Test Suite** | 19 Vitest test suites passing | **PASS** | 19/19 suites, 136/136 tests passing |
| **Production Build** | Vite build succeeds | **PASS** | Completed in ~3.9s |
| **Cold-load JS** | $\le 75\text{ kB}$ gzip | **PASS** | 26.87 kB gzip |
| **Monochrome Chrome** | Zero chromatic tokens | **PASS** | 100% compliant |
| **Micro Signal Dot** | $\le 8\text{px}$, active state only | **PASS** | Fully compliant |
| **No Left Rail** | Section 9.6 Top bar only | **PASS** | Desktop rail removed, top bar 56px |

