# Phase 3: Noir Monochrome Tokens, Typography, and THEME_LOCK v2

**Project**: SyncTone — Noir Monochrome Redesign (Full Visual & UX Overhaul)  
**Phase**: Phase 3 of 10  
**Precedence**: Supersedes `docs/noir-yellow-spec.md` (withdrawn), `docs/editorial-orange-spec.md`, and `THEME_LOCK` v1.  
**Status**: **PHASE 3 COMPLETE & VERIFIED**. All 19 test suites (136/136 tests) pass green. Zero-byte font overhead verified. Cold-load JS bundle at 28.49 kB gzip (budget $\le 75\text{ kB}$).

---

## 1. Executive Summary & Deliverables

Phase 3 transitions the SyncTone design system to **Noir Monochrome** at the code layer, establishing the token foundations, Tailwind mappings, and automated regression locks that govern all subsequent component redesign phases (Phases 4 through 8).

### Deliverables Summary
1. **`novel-audio-synthesizer/frontend/src/index.css`**:
   - Replaced legacy Earthy Luxury tokens with calibrated Noir Monochrome tokens in `:root, html.dark` and `html.light`.
   - Introduced core tokens: `--stage-gradient` (4 stops), `--headline-gradient`, `--signal`, and `--bg-bar`.
   - Defined strict inverse accent contract: `--accent = text-main`, `--on-accent = page-color`.
   - Established sharp geometric radius scale (`0px` to `2px`) replacing rounded pill aesthetics.
   - Added utility classes for stage gradients, headline text-gradient clipping, skewed italics, and micro UI buttons.
   - Harmonized legacy brand aliases (`--brand-espresso`, `--brand-sage`, `--brand-amber`, etc.) to neutral greys for seamless backward compatibility during phased component migration.

2. **`novel-audio-synthesizer/frontend/tailwind.config.js`**:
   - Extended color definitions with `bar: 'var(--bg-bar)'` and `signal: 'var(--signal)'`.
   - Neutralized all legacy brand and accent keys (`sage`, `amber`, `gold`, `crimson`, `champagne`) to strict monochrome coordinates.
   - Preserved semantic variable bindings (`page`, `surface`, `card`, `hover`, `elevated`, `text-main`, `text-sub`, `text-muted`, `border`, `accent`, `status`, `speaker`, `cta`).

3. **`novel-audio-synthesizer/frontend/src/__tests__/theme_lock.test.js` (THEME_LOCK v2)**:
   - Complete rewrite enforcing the Noir Monochrome design contract.
   - Test 1: Full token parity check for Dark Mode (`:root, html.dark`).
   - Test 2: Full token parity check for Light Mode (`html.light`).
   - Test 3: **Strict Negative Assertions**: Asserts zero chromatic tokens across dark and light modes, except `--signal` (which is locked to `#FF5A1F` dark / `#F05010` light). Verifies that all standalone hex tokens and rgba tokens satisfy neutral grey constraints ($\max(|R-G|, |G-B|, |B-R|) \le 10$).
   - Test 4: Tailwind configuration validation verifying zero chromatic theme colors.
   - Test 5: Mathematical WCAG 2.2 AA contrast verification for all core text/surface combinations ($\ge 4.5:1$ normal text, $\ge 3.0:1$ non-text graphical boundaries).

4. **Zero-Byte Font Overhead Verification**:
   - Verified that `@fontsource-variable/inter` natively contains weights 100 through 900 in a single variable font file (`inter-latin-wght-normal.woff2`).
   - No new font dependencies were added; zero additional network requests are incurred.

---

## 2. Token Architecture Reference

### 2.1 Dark Mode (`:root, html.dark`) — Default Nocturne

| Token Name | Applied Value | Semantic Function & WCAG Ratio |
| :--- | :--- | :--- |
| `--bg-page` | `#0B0B0D` | Canvas base & viewport background |
| `--bg-surface` | `#141416` | Navigation headers, drawer sheets, modal backgrounds |
| `--bg-card` | `#1B1B1E` | Novel catalog tiles, chapter rows, settings boxes |
| `--bg-hover` | `#232327` | Interactive item hover & active press state |
| `--bg-elevated` | `#1B1B1E` | Floating popovers and dropdown overlays |
| `--bg-bar` | `#141416` | Top bar and bottom audio player fixed dock |
| `--text-main` | `#F2F2F3` | Headings, titles, primary body text (**17.58:1** on page) |
| `--text-sub` | `#A9A9AF` | Secondary metadata, author credits, synopsis (**8.41:1** on page) |
| `--text-muted` | `#898992` | Micro UI tags, timestamps, labels (**4.96:1** on card, **4.52:1** on hover) |
| `--border-subtle` | `#2E2E33` | Hairline separators and card dividers |
| `--border-strong` | `#5E5E66` | Boxed button borders, inputs (**3.06:1** on page, $\ge 3:1$ Non-Text AA) |
| `--border-focus` | `#F2F2F3` | 2px text-main outline ring with 2px offset |
| `--accent` | `#F2F2F3` | Inverted primary button fill (pure light text-main tone) |
| `--on-accent` | `#0B0B0D` | Inverted button text (near-black page tone; **17.58:1** AAA) |
| `--accent-hover` | `#DCDCDF` | One grey step darker for button hover |
| `--accent-surface`| `rgba(242, 242, 243, 0.10)` | 10% alpha wash for selected tab/chip background |
| `--signal` | `#FF5A1F` | Single permitted chromatic element: $\le$ 8px playing/live dot (**6.31:1**) |
| `--stage-gradient` | `linear-gradient(...)` | 4-stop hero backdrop: `#0A0A0C` $\to$ `#2A2A2E` $\to$ `#7B7B7E` $\to$ `#C2C2C4` |
| `--headline-gradient`| `linear-gradient(...)` | Display headline text fill: `#B4B4B6` $\to$ `#3A3A3E` |
| `--radius-xs` / `--radius-sm` | `0px` / `1px` | Sharp monolithic geometry |
| `--radius-md` / `--radius-lg` | `2px` / `2px` | Sharp corners replacing rounded pills |

### 2.2 Light Mode (`html.light`) — Inverted Minimalist Vellum

| Token Name | Applied Value | Semantic Function & WCAG Ratio |
| :--- | :--- | :--- |
| `--bg-page` | `#EFEFF0` | Crisp light grey canvas |
| `--bg-surface` | `#F7F7F8` | Clean top bar, drawer sheets, modal backgrounds |
| `--bg-card` | `#FFFFFF` | Pure white novel cards and panels |
| `--bg-hover` | `#E4E4E6` | Interactive row hover |
| `--bg-elevated` | `#FFFFFF` | Modal dialogs and popovers |
| `--bg-bar` | `#F7F7F8` | Fixed top navigation and bottom audio bar |
| `--text-main` | `#0B0B0D` | Deep near-black typography (**17.11:1** on page, **19.66:1** on card) |
| `--text-sub` | `#4F4F56` | Secondary metadata (**7.07:1** on page, **8.12:1** on card) |
| `--text-muted` | `#65656C` | Micro UI tags and timestamps (**5.03:1** on page, **4.55:1** on hover) |
| `--border-subtle` | `#D0D0D4` | 1px card separators and catalog dividers |
| `--border-strong` | `#86868A` | Boxed button borders, inputs (**3.16:1** on page) |
| `--border-focus` | `#0B0B0D` | 2px text-main outline ring |
| `--accent` | `#0B0B0D` | Inverted primary button fill (near-black) |
| `--on-accent` | `#FFFFFF` | Pure white button text (**19.66:1** AAA) |
| `--accent-hover` | `#232327` | One grey step lighter for hover |
| `--accent-surface`| `rgba(11, 11, 13, 0.08)` | 8% alpha wash for selected tab/chip |
| `--signal` | `#F05010` | Single permitted chromatic element: $\le$ 8px playing dot (**3.12:1** on page) |
| `--stage-gradient` | `linear-gradient(...)` | Mirrored 4-stop hero gradient: `#F4F4F5` $\to$ `#D9D9DB` $\to$ `#8A8A8D` $\to$ `#1A1A1C` |
| `--headline-gradient`| `linear-gradient(...)` | Dark-to-mid-grey display headline text fill: `#1A1A1C` $\to$ `#8A8A8D` |

---

## 3. THEME_LOCK v2 Automated Regression Harness

The regression suite [`novel-audio-synthesizer/frontend/src/__tests__/theme_lock.test.js`](file:///Users/mohdfaizankhan/SyncTone-/novel-audio-synthesizer/frontend/src/__tests__/theme_lock.test.js) was completely re-architected to guarantee that no chromatic regressions can enter the codebase:

```js
// Strict Negative Assertion Implementation in theme_lock.test.js
for (const [varName, varValue] of allTokens) {
  if (varName === '--signal') {
    // --signal is the ONLY permitted chromatic token
    expect(varValue).toMatch(/^#(?:FF5A1F|F05010)$/i);
    continue;
  }

  // Check against explicit banned patterns (no yellow, green, orange, blue, cyan, indigo, purple)
  for (const pattern of bannedColorPatterns) {
    expect(varValue).not.toMatch(pattern);
  }

  // For standalone hex tokens, assert chromatic neutrality:
  // In neutral greys, R, G, and B are virtually identical (|R - G| <= 10, |G - B| <= 10, |R - B| <= 10).
  if (/^#[0-9a-fA-F]{6}$/.test(varValue)) {
    const rgb = hexToRgb(varValue);
    const [r, g, b] = rgb;
    const maxDelta = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    expect(maxDelta).toBeLessThanOrEqual(10);
  }
}
```

### Contrast Gate Verification (SC 1.4.3 & SC 1.4.11)
The test suite calculates mathematical relative luminance and asserts:
- Dark Mode: `text-main` (17.58:1), `text-sub` (8.41:1), `text-muted` (4.96:1 on card, 4.52:1 on hover), `on-accent` (17.58:1), `border-strong` (3.06:1), `signal` (6.31:1).
- Light Mode: `text-main` (17.11:1), `text-sub` (7.07:1), `text-muted` (5.03:1 on page, 4.55:1 on hover), `on-accent` (19.66:1), `border-strong` (3.16:1), `signal` (3.12:1).
- All checks pass with 100% compliance.

---

## 4. Verification Checklist & Gate Results

| Test / Gate Target | Command / Tool | Status | Measured Result |
| :--- | :--- | :--- | :--- |
| **THEME_LOCK v2 Parity** | `vitest run theme_lock.test.js` | **PASS** | 5/5 tests passing |
| **Full Vitest Test Suite** | `npm test --prefix frontend` | **PASS** | 19/19 files, 136/136 tests passing |
| **Vite Production Build** | `npm run build --prefix frontend` | **PASS** | Completed in 1.89s with 0 errors |
| **Cold-Load JS Budget** | `dist/assets/index-*.js` | **PASS** | **28.49 kB gzip** (Budget $\le 75\text{ kB}$) |
| **CSS Bundle Size** | `dist/assets/index-*.css` | **PASS** | **19.18 kB gzip** |
| **Zero-Byte Font Overhead** | Rollup asset inspection | **PASS** | 0 new font files loaded; variable font used |
| **Frozen Systems Integrity** | Codebase audit | **PASS** | 0 edits to audio sync, pagination, or database |

---

## 5. Next Step: Phase 4 (App Chrome & Navigation)

With Phase 3 tokens and regression locks active, Phase 4 will proceed to redesign the application shell components:
1. `TopHeader.jsx`: Monospace navigation items prefixed with `+` (`+ LIBRARY`, `+ VOICES`, `+ PROFILE`), boxed search bar with sharp corners (`0-2px`), boxed sign-in CTA (`[● SIGN IN]`), and neutral dark/light theme toggle.
2. `SidebarNav.jsx`: Monolithic boxed icons with hairline borders, active state indicator (`[●]`), and sharp geometry.
3. Stop for preview and approval before proceeding to Phase 5.

