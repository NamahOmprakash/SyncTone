# SyncTone Frontend Hardening Report — Final Hardening & Verification

**Branch:** `redesign/opencode`  
**Date:** 2026-10-31  
**Status:** Track A & Track B Complete — All Gates Passed  
**Visual Identity:** Atelier Obsidian (Dark) & Editorial Light, Cinnabar Accent (`--accent: #e0533c`), 2:3 poster cover format.

---

## 1. Initial Bundle Measurement (Cold Load on Home)

On initial cold load of the Home page (`http://localhost:5174/`), the HTML document requests and preloads only the app shell and core `react-vendor` runtime:

| Chunk File | Purpose | Raw Size | Gzip Size |
|---|---|---|---|
| `assets/index-BiHa-gAj.js` | App shell, routing, catalog entry | 93.88 kB | 24.59 kB |
| `assets/react-vendor-DeMnUtHS.js` | React, ReactDOM, Scheduler, React-Router | 151.87 kB | 49.14 kB |
| `registerSW.js` | PWA service worker registration | 0.13 kB | 0.10 kB |
| **TOTAL Initial JS on Home** | **Cold Load Total** | **245.88 kB** | **73.83 kB** |

### Comparison to Baseline
- **Baseline Initial Bundle:** 629.0 kB raw (194.4 kB gzip)
- **Hardening Initial Bundle:** 245.88 kB raw (73.83 kB gzip)
- **Net Reduction:** **-383.12 kB raw (-60.9%) / -120.57 kB gzip (-62.0%)**

> **Assessment:** Total initial JavaScript on cold load is **62.0% lower** than baseline. Heavy libraries (`pdfjs-dist`, `foliate-js`, `framer-motion`) and all modals/views (`AuthModal`, `AddNovelModal`, `UploadChapterModal`, `SettingsModal`, `CharacterRoster`, `ReaderView`, `NovelDetails`, `UploadView`, `ProfileView`, `AdminView`) are code-split and loaded strictly on demand. `ttsSanitizer` was rewritten to use browser-native `DOMParser`, completely eliminating `cheerio` and transitive parser dependencies from the bundle.

---

## 2. Service Worker Precache Analysis

From the Workbox PWA manifest generated in `dist/sw.js`:

| Precached Category | Entries | Size | Policy |
|---|---|---|---|
| App Shell & Vendor JS (`index-*.js`, `react-vendor-*.js`) | 2 | 245.8 kB | Precached |
| Stylesheet (`index-*.css`) | 1 | 90.0 kB | Precached |
| Typography (`*.woff2` - 15 files) | 15 | 396.1 kB | Precached |
| HTML Shell & Icons (`index.html`, offline fallback, SVG icons) | 10 | 1.2 kB | Precached |
| **Total Precached Assets** | **28 entries** | **733.12 KiB** | All assets <= 155 kB |

### Runtime-Cached on Demand (Excluded from Precache)
- `pdf-*.js` (1,026.5 kB raw) & `pdf.worker.min-*.mjs` (1,264.3 kB raw) — Excluded, cached on demand with size cap.
- `foliate-*.js` (121.0 kB raw) — Excluded, cached on demand with size cap.
- `ReaderView-*.js` (44.6 kB raw) — Excluded, cached on demand with size cap.
- `use-reduced-motion-*.js` (framer-motion lazy animations) — Excluded, cached on demand.
- `/api/*` network requests — Strict `NetworkOnly` with graceful offline error toast fallback.

---

## 3. Complete Per-Item Status Table

| Item | Target File(s) | Status | Details / Reason |
|---|---|---|---|
| **1A. Search Debounce** | `src/hooks/useDebounce.js`, `src/components/NovelCatalog.jsx` | **FIXED** | 200ms debounce hook for catalog filter; instant input reflection preserved. |
| **1B. NovelCatalog AbortController** | `src/components/NovelCatalog.jsx` | **FIXED** | Added `AbortController` in `useEffect([channel])` to cancel and ignore stale requests. |
| **1C. useAudioSync rAF Loop** | `src/hooks/useAudioSync.js` | **FIXED** | Added internal pause guard (`if (!audioRef.current || !isPlaying) return;`) and cancels rAF loop on pause/unmount. |
| **1D. AudioPlayer Waveform** | `src/components/AudioPlayer.jsx` | **NOT APPLICABLE** | Per specification amendment: no waveform existed in the design; do not build one. |
| **1E. Lazy-load Heavy Libs & Routing** | `src/App.jsx`, `vite.config.js` | **FIXED** | Route-level `React.lazy` on all non-home views; modal lazy-loading with skeleton fallbacks; eliminated catch-all vendor rule. |
| **1F. ErrorBoundary** | `src/components/ErrorBoundary.jsx`, `src/App.jsx` | **FIXED** | Reusable class ErrorBoundary placed top-level, around ReaderView, AudioPlayer, and routes. |
| **1G. SidebarNav Memoized Icon** | `src/components/SidebarNav.jsx` | **FIXED** | Refactored to unified memoized `<Icon name="..." />` dispatcher using `React.memo`. |
| **2A. API Client Error Mapping & Retries** | `src/services/api.js` | **FIXED** | Replaced raw status codes with plain copy; bounded backoff retries for idempotent GET requests. |
| **2B. Toast Error Integration** | `src/context/ToastContext.jsx`, `src/main.jsx` | **FIXED** | Global Toast provider with `aria-live="polite"` and auto-dismiss after 5s. |
| **2C. Settings Copy Sanitization** | `src/components/SettingsModal.jsx`, `src/__tests__/tts_engines.test.jsx` | **FIXED** | Removed all technical jargon ("TTS Synthesis Architecture", "3-Engine Fallback Chain", "ONNX Ready", "model_exists"). Replaced with "Voice Cast & Narration", "Studio Cast Voices", "Expressive Offline Voices", and plain guidance for unavailable voices. |
| **2D. react-router-dom Migration** | `src/App.jsx` | **FIXED** | Migrated to `BrowserRouter` with real routes (`/`, `/novel/:id`, `/reader/:chapterId`, `/upload`, `/profile`, `/admin`, `/settings`), role guards, deep links, and back/forward browser history. |
| **2E. JWT & Cookie Storage** | `src/services/api.js`, backend `src/routes/auth.js` | **ALREADY FIXED** | Inspected backend & client: JWT is strictly managed via HttpOnly, Secure, SameSite=Lax cookies with `credentials: 'include'`. |
| **3A. Fixed Header & Theme Toggle** | `src/components/TopHeader.jsx`, `src/components/NovelCatalog.jsx`, `src/components/SidebarNav.jsx` | **FIXED** | Header fixed at `h-16 flex-shrink-0`; added visible sun/moon theme toggle button (`aria-label="Switch theme"`, `aria-pressed={theme === 'dark'}`) that persists across reloads. |
| **3B. Channel Tabs Keyboard Nav** | `src/components/NovelCatalog.jsx` | **FIXED** | Roving tabindex with `ArrowRight`, `ArrowLeft`, `Home`, and `End` keys. |
| **3C. Billboard Controls & Reduced Motion** | `src/components/NovelCatalog.jsx` | **FIXED** | Explicit Prev/Next buttons; pauses on hover, focus, and when `prefers-reduced-motion` is active. |
| **3D. Novel Card 2:3 Aspect & 320px Overflow** | `src/components/NovelCover.jsx`, `src/components/NovelCatalog.jsx`, `src/components/NovelDetails.jsx`, `src/components/primitives/*` | **FIXED** | Converted all card covers strictly to `aspect-[2/3]`; added Atelier Obsidian on-theme fallback cover with foil spine and emblem; eliminated 320px horizontal overflow with responsive vertical-to-horizontal card adaptation and `overflow-x: hidden`. |
| **3E. Modal ARIA & Motion** | Modals, `App.jsx` | **FIXED** | Switched modals to `LazyMotion` + `domAnimation` + `<m.div>`; focus traps, Escape keydown listeners, and modal skeletons with capture-phase dismissal. |
| **3F. Reader Small-Screen Navigation** | `src/components/ReaderView.jsx` | **NOT DONE (DEFERRED)** | Explicitly removed from Track B by lead engineer instructions. Assigned to the upcoming Reader-fit workstream. `ReaderView.jsx` layout was not touched. |
| **4. PWA Safe Precaching** | `vite.config.js` | **FIXED** | Service worker precaches only app shell, CSS, and fonts (28 entries, 733 KiB). Excludes PDF, foliate, framer, and modal chunks. Offline fallback functional. |
| **5. Playwright E2E & Axe WCAG Audits** | `e2e/hardening.spec.js` | **FIXED** | 13 Playwright tests passing, including Axe WCAG 2.2 AA audit on Home, Settings, and Profile in Light and Dark with 0 serious and 0 critical violations. |

---

## 4. Test Verification Summary

- **Vitest Unit Tests:** 16 test files, **103 passed (103 total)**.
- **Playwright E2E Tests:** **13 passed (13 total)** in 21.0s.
  - Test 1: Catalog to Novel to Reader navigation and play/pause toggle
  - Test 2: Search debounce filters catalog smoothly
  - Test 3: Tab keyboard navigation with arrow keys and roving tabindex
  - Test 4: Theme toggle persists between light and dark modes
  - Test 5: Error toast surfaces on forced network failure
  - Test 6: Modal focus trap and Esc to close
  - Test 7: Axe accessibility audit on Home page (Dark & Light)
  - Test 8: Deep link and Browser back/forward navigation with React Router
  - Test 9: Role guarded routes (`/admin`, `/profile`, `/upload`)
  - Test 10: Throttled Fast 3G connection with skeleton fallback and no blank frame
  - Test 11: `ttsSanitizer` golden fixtures in real Chromium (DOMParser parity with jsdom)
  - Test 12: PWA offline boot renders app shell or offline fallback, and `/api/*` fails cleanly without hanging
  - Test 13: Axe audit on Home, Settings, Profile in Light & Dark (**0 serious, 0 critical violations**) and before/after screenshots
- **Axe WCAG 2.2 AA Results:**
  - Home (Dark): 0 critical, 0 serious violations.
  - Home (Light): 0 critical, 0 serious violations.
  - Settings Modal (Dark): 0 critical, 0 serious violations.
  - Settings Modal (Light): 0 critical, 0 serious violations.
  - Profile (Dark): 0 critical, 0 serious violations.
  - Profile (Light): 0 critical, 0 serious violations.

---

## 5. Visual Artifacts (Screenshots)

Captured and preserved in `docs/screenshots/`:
- `home-dark-2-3-covers.png` — Home page in Atelier Obsidian dark mode showing 2:3 poster cover format.
- `home-light-2-3-covers.png` — Home page in Editorial Light mode showing 2:3 poster cover format and header theme toggle.
- `settings-modal-dark.png` — Settings dialog in dark mode with plain, non-technical voice status copy.
- `settings-modal-light.png` — Settings dialog in light mode with accessible controls.
- `profile-dark.png` — Profile view in dark mode.
- `profile-light.png` — Profile view in light mode.
