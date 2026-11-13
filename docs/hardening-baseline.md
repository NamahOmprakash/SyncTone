# SyncTone Frontend – Hardening Baseline

**Branch:** `redesign/opencode` (created from `feat/award-ui-redesign`)  
**Date:** 2026-10-31  

---

## Build Output (npm run build)

| Chunk | Raw Size | Gzip |
|-------|----------|------|
| `pdf.worker.min-*.mjs` | 1,264 KB | — |
| `index-*.js` (main app bundle) | 629 KB | 194 KB |
| `pdf-Au7fvAgB.js` | 542 KB | 164 KB |
| `pdf-WgYdDwYK.js` | 484 KB | 144 KB |
| `zip-*.js` | 55 KB | 20 KB |
| `epub-*.js` | 30 KB | 11 KB |
| `mobi-*.js` | 25 KB | 9 KB |
| `fb2-*.js` | 7 KB | 3 KB |
| `fflate-*.js` | 4 KB | 2 KB |
| `index-*.css` | 89 KB | 18 KB |
| **Total dist** | **~3.7 MiB** | — |

> ⚠️ Vite warned: 3 chunks exceed 500 KB after minification.
> pdfjs-dist and foliate-js are loaded for ALL routes (not lazy-loaded).

---

## Test Results (Vitest)

| Suite | Passed | Total |
|-------|--------|-------|
| auth | 6 | 6 |
| catalog | 5 | 5 |
| reader | 5 | 5 |
| chapters | 5 | 5 |
| ebook_sanitizer | 7 | 7 |
| addnovel | 6 | 6 |
| opengl_tts_focus | 9 | 9 |
| frontend_fixes | 6 | 6 |
| primitives | 21 | 21 |
| playback | 4 | 4 |
| delete_novel | 3 | 3 |
| synthesis | 4 | 4 |
| roster | 4 | 4 |
| tts_engines | 3 | 3 |
| integration | 1 | 1 |
| **TOTAL** | **89** | **89** |

---

## Confirmed Issue Triage

| # | Issue | File | Status |
|---|-------|------|--------|
| 1A | No debounce on searchQuery | NovelCatalog.jsx | **CONFIRMED** |
| 1B | fetchNovels: no AbortController; race condition on fast channel switch | NovelCatalog.jsx | **CONFIRMED** |
| 1C | useAudioSync rAF loop: already guarded by `isPlaying && playbackMode === 'studio'` check | useAudioSync.js L368-375 | **ALREADY FIXED** (partial – unmount cancel present via cleanup return) |
| 1D | AudioPlayer waveform CPU: no canvas waveform — uses CSS transform scaleX only | AudioPlayer.jsx | **NOT APPLICABLE** (no canvas rendering, already uses transform) |
| 1E | Lazy-load: pdfjs/foliate in main bundle | vite.config.js | **CONFIRMED** |
| 1F | No ErrorBoundary anywhere | App.jsx / components | **CONFIRMED** |
| 1G | SidebarNav SVGs: each icon is already a component via `./icons.jsx` | SidebarNav.jsx | **ALREADY FIXED** |
| 2A | api.js: no retry/backoff; raw status code in error message | api.js L71 | **CONFIRMED** (raw "status 500" message shown to user) |
| 2B | Toast not wired to API errors | App.jsx | **CONFIRMED** |
| 2C | Settings "model not found": technical wording shown | SettingsModal.jsx L73-76 | **CONFIRMED** |
| 2D | Routing: manual view state + popstate, no react-router-dom | App.jsx | **CONFIRMED** |
| 2E | JWT: already HttpOnly cookie via `credentials: 'include'`; never touches localStorage | api.js L4-6 | **ALREADY FIXED** |
| 3A | Header: no fixed height, layout shift on breakpoints | NovelCatalog.jsx header | **CONFIRMED** |
| 3B | Channel tabs: no arrow-key navigation | NovelCatalog.jsx L200-237 | **CONFIRMED** |
| 3C | Billboard: no prev/next buttons on mobile | NovelCatalog.jsx | **CONFIRMED** |
| 3D | Novel card: no placeholder on missing cover | NovelCover.jsx | **CONFIRMED** |
| 3E | Modals: no framer-motion animation, potential flash | AddNovelModal.jsx | **CONFIRMED** |
| 3F | Reader: no fullscreen toggle | ReaderView.jsx | **CONFIRMED** |

---

## Lighthouse
- Not executed – headless Chrome unavailable on this machine.
- Recommendation: run via DevTools or install Chromium.

