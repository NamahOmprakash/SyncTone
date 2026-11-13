import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * THEME LOCK REGRESSION TEST (THEME_LOCK v2)
 *
 * Visual Identity: SyncTone Noir Monochrome (Editorial Digital Publishing & Audiobook Engine)
 * Derived strictly from: docs/design-reference/reference-hero.png
 * Supersedes: docs/noir-yellow-spec.md (withdrawn), docs/editorial-orange-spec.md, and THEME_LOCK v1.
 *
 * HARD CONSTRAINTS (THEME_LOCK v2):
 * 1. Strictly monochrome chrome: Neutral greys only. Zero yellow, green, orange fills, blue, or purple.
 * 2. Exactly ONE permitted chromatic element: --signal (#FF5A1F dark / #F05010 light), strictly <= 8px dot.
 * 3. Inverse CTA contract: --accent is text-main fill, --on-accent is page background color.
 * 4. WCAG 2.2 AA Contrast: All informational text >= 4.5:1 against local backgrounds; borders >= 3.0:1.
 */

function extractAllCssVariables(cssContent, selectorRegex) {
  const match = cssContent.match(selectorRegex);
  if (!match) return {};
  const block = match[1];
  const vars = {};
  const varRegex = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = varRegex.exec(block)) !== null) {
    vars[m[1]] = m[2].trim();
  }
  return vars;
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  if (clean.length === 6) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  return null;
}

function getRelativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(hex1, hex2) {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Theme Lock v2: Complete Noir Monochrome Token & Color Parity', () => {
  const cssPath = path.resolve(__dirname, '../index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');

  const darkVars = extractAllCssVariables(cssContent, /:root,\s*html\.dark\s*\{([\s\S]*?)\n\}/);
  const lightVars = extractAllCssVariables(cssContent, /html\.light\s*\{([\s\S]*?)\n\}/);

  it('matches all locked custom properties for Dark Mode (:root, html.dark)', () => {
    expect(darkVars).toMatchObject({
      // Harmonized brand tokens (neutralized to greys)
      '--brand-espresso': '#0B0B0D',
      '--brand-chocolate': '#141416',
      '--brand-walnut': '#1B1B1E',
      '--brand-bronze': '#898992',
      '--brand-sand': '#F2F2F3',
      '--brand-charcoal': '#5E5E66',
      '--brand-sage': '#A9A9AF',
      '--brand-amber': '#DCDCDF',
      '--brand-champagne': '#F2F2F3',
      '--brand-champagne-light': '#DCDCDF',
      '--brand-obsidian': '#0B0B0D',

      // Surfaces
      '--bg-page': '#0B0B0D',
      '--bg-surface': '#141416',
      '--bg-card': '#1B1B1E',
      '--bg-hover': '#232327',
      '--bg-elevated': '#1B1B1E',
      '--bg-bar': '#141416',

      // Typography
      '--text-main': '#F2F2F3',
      '--text-sub': '#A9A9AF',
      '--text-muted': '#898992',

      // Borders & Affordances
      '--border-subtle': '#2E2E33',
      '--border-strong': '#5E5E66',
      '--border-hover': '#F2F2F3',
      '--border-focus': '#F2F2F3',

      // Living Accent (Inverse High-Contrast)
      '--accent': '#F2F2F3',
      '--accent-hover': '#DCDCDF',
      '--accent-surface': 'rgba(242, 242, 243, 0.10)',
      '--accent-strong': '#5E5E66',
      '--accent-text': '#F2F2F3',
      '--on-accent': '#0B0B0D',

      // CTA Primary
      '--cta-primary-bg': '#F2F2F3',
      '--cta-primary-hover': '#DCDCDF',
      '--cta-primary-text': '#0B0B0D',

      // Opaque Surfaces
      '--glass-bg': 'rgba(20, 20, 22, 0.98)',
      '--glass-dock': 'rgba(20, 20, 22, 0.98)',

      // Single Chromatic Indicator Dot
      '--signal': '#FF5A1F',

      // Stage & Headline Gradients
      '--stage-gradient': 'linear-gradient(180deg, #0A0A0C 0%, #2A2A2E 35%, #7B7B7E 70%, #C2C2C4 100%)',
      '--headline-gradient': 'linear-gradient(180deg, #B4B4B6 0%, #3A3A3E 100%)',

      // Status Without Hue
      '--success': '#F2F2F3',
      '--warning': '#DCDCDF',
      '--danger': '#F2F2F3',
      '--info': '#A9A9AF',

      // Voice / Speaker Hierarchy
      '--speaker-narrator': '#A9A9AF',
      '--speaker-a': '#F2F2F3',
      '--speaker-b': '#DCDCDF',
      '--speaker-c': '#A9A9AF',
      '--speaker-d': '#898992',

      // Editorial Billboard & Card Accent
      '--top10-fill': '#0B0B0D',
      '--top10-stroke': 'rgba(242, 242, 243, 0.25)',
      '--top10-active': '#F2F2F3',
      '--card-accent': '#F2F2F3',

      // Sharp Geometry (0-2px)
      '--radius-xs': '0px',
      '--radius-sm': '1px',
      '--radius-md': '2px',
      '--radius-lg': '2px',
      '--radius-xl': '4px',
      '--radius-full': '9999px',
    });
  });

  it('matches all locked custom properties for Light Mode (html.light)', () => {
    expect(lightVars).toMatchObject({
      // Harmonized brand tokens
      '--brand-espresso': '#EFEFF0',
      '--brand-chocolate': '#F7F7F8',
      '--brand-walnut': '#FFFFFF',
      '--brand-bronze': '#65656C',
      '--brand-sand': '#0B0B0D',
      '--brand-charcoal': '#86868A',
      '--brand-sage': '#4F4F56',
      '--brand-amber': '#232327',
      '--brand-champagne': '#0B0B0D',
      '--brand-champagne-light': '#232327',
      '--brand-obsidian': '#FFFFFF',

      // Surfaces
      '--bg-page': '#EFEFF0',
      '--bg-surface': '#F7F7F8',
      '--bg-card': '#FFFFFF',
      '--bg-hover': '#E4E4E6',
      '--bg-elevated': '#FFFFFF',
      '--bg-bar': '#F7F7F8',

      // Typography
      '--text-main': '#0B0B0D',
      '--text-sub': '#4F4F56',
      '--text-muted': '#65656C',

      // Borders
      '--border-subtle': '#D0D0D4',
      '--border-strong': '#86868A',
      '--border-hover': '#0B0B0D',
      '--border-focus': '#0B0B0D',

      // Living Accent
      '--accent': '#0B0B0D',
      '--accent-hover': '#232327',
      '--accent-surface': 'rgba(11, 11, 13, 0.08)',
      '--accent-strong': '#86868A',
      '--accent-text': '#0B0B0D',
      '--on-accent': '#FFFFFF',

      // CTA Primary
      '--cta-primary-bg': '#0B0B0D',
      '--cta-primary-hover': '#232327',
      '--cta-primary-text': '#FFFFFF',

      // Flattened Surfaces
      '--glass-bg': 'rgba(247, 247, 248, 0.98)',
      '--glass-dock': 'rgba(247, 247, 248, 0.98)',

      // Single Permitted Chromatic Element
      '--signal': '#F05010',

      // Gradients
      '--stage-gradient': 'linear-gradient(180deg, #F4F4F5 0%, #D9D9DB 35%, #8A8A8D 70%, #1A1A1C 100%)',
      '--headline-gradient': 'linear-gradient(180deg, #1A1A1C 0%, #8A8A8D 100%)',

      // Status Without Hue
      '--success': '#0B0B0D',
      '--warning': '#232327',
      '--danger': '#0B0B0D',
      '--info': '#4F4F56',

      // Speakers
      '--speaker-narrator': '#4F4F56',
      '--speaker-a': '#0B0B0D',
      '--speaker-b': '#232327',
      '--speaker-c': '#4F4F56',
      '--speaker-d': '#65656C',

      // Top 10
      '--top10-fill': '#EFEFF0',
      '--top10-stroke': 'rgba(11, 11, 13, 0.25)',
      '--top10-active': '#0B0B0D',
      '--card-accent': '#0B0B0D',
    });
  });

  it('enforces strict negative assertions: zero chromatic tokens across dark and light modes, except --signal', () => {
    // Banned color strings and prior theme hexes
    const bannedColorPatterns = [
      /#e0533c/i, // Cinnabar
      /#c83d27/i,
      /#dfba53/i, // Champagne Gold
      /#eed076/i,
      /#f5e2a8/i,
      /#e5a93c/i,
      /#87a96b/i, // Sage Green
      /#386b2f/i,
      /#d5851f/i, // Amber Glow
      /#ba4e3d/i, // Terracotta
      /#962f22/i,
      /#06b6d4/i, // Cyan
      /#6366f1/i, // Indigo
      /#8b5cf6/i, // Violet
      /#3b82f6/i, // Blue
    ];

    const allDarkTokens = Object.entries(darkVars);
    const allLightTokens = Object.entries(lightVars);
    const allTokens = [...allDarkTokens, ...allLightTokens];

    for (const [varName, varValue] of allTokens) {
      if (varName === '--signal') {
        // --signal is the ONLY permitted chromatic token
        expect(varValue).toMatch(/^#(?:FF5A1F|F05010)$/i);
        continue;
      }

      // Check against explicit banned patterns
      for (const pattern of bannedColorPatterns) {
        expect(varValue).not.toMatch(pattern);
      }

      // For standalone hex tokens (excluding gradients and rgba), assert chromatic neutrality:
      // In neutral greys, R, G, and B are virtually identical (|R - G| <= 10, |G - B| <= 10, |R - B| <= 10).
      if (/^#[0-9a-fA-F]{6}$/.test(varValue)) {
        const rgb = hexToRgb(varValue);
        if (rgb) {
          const [r, g, b] = rgb;
          const maxDelta = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
          expect(
            maxDelta,
            `Token ${varName}: ${varValue} is chromatic (max RGB delta: ${maxDelta} > 10). Chrome must be strictly neutral grey.`
          ).toBeLessThanOrEqual(10);
        }
      }

      // Check rgba tokens (e.g. rgba(242, 242, 243, 0.10))
      const rgbaMatch = varValue.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\)$/);
      if (rgbaMatch) {
        const r = parseInt(rgbaMatch[1], 10);
        const g = parseInt(rgbaMatch[2], 10);
        const b = parseInt(rgbaMatch[3], 10);
        const maxDelta = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
        expect(
          maxDelta,
          `Token ${varName}: ${varValue} is chromatic (max RGB delta: ${maxDelta} > 10)`
        ).toBeLessThanOrEqual(10);
      }

      // Assert no OKLCH chromatic hues
      const oklchMatch = varValue.match(/oklch\(\s*[\d.]+\s+([\d.]+)\s+[\d.]+\s*\)/);
      if (oklchMatch) {
        const chroma = parseFloat(oklchMatch[1]);
        expect(chroma, `Token ${varName} has chromatic chroma: ${chroma}`).toBeLessThan(0.02);
      }
    }
  });

  it('matches Tailwind color mappings in tailwind.config.js and verifies zero chromatic theme colors', () => {
    const tailwindPath = path.resolve(__dirname, '../../tailwind.config.js');
    const tailwindContent = fs.readFileSync(tailwindPath, 'utf-8');

    // Monochrome CSS Variable bindings
    expect(tailwindContent).toContain("page: 'var(--bg-page)'");
    expect(tailwindContent).toContain("surface: 'var(--bg-surface)'");
    expect(tailwindContent).toContain("card: 'var(--bg-card)'");
    expect(tailwindContent).toContain("hover: 'var(--bg-hover)'");
    expect(tailwindContent).toContain("elevated: 'var(--bg-elevated)'");
    expect(tailwindContent).toContain("bar: 'var(--bg-bar)'");
    expect(tailwindContent).toContain("'text-main': 'var(--text-main)'");
    expect(tailwindContent).toContain("'text-sub': 'var(--text-sub)'");
    expect(tailwindContent).toContain("'text-muted': 'var(--text-muted)'");
    expect(tailwindContent).toContain("signal: 'var(--signal)'");
    expect(tailwindContent).toContain("DEFAULT: 'var(--accent)'");
    expect(tailwindContent).toContain("'on-accent': 'var(--on-accent)'");
    expect(tailwindContent).toContain("primary: 'var(--cta-primary-bg)'");

    // Harmonized brand tokens in Tailwind (all neutral)
    expect(tailwindContent).toContain("espresso: '#0B0B0D'");
    expect(tailwindContent).toContain("chocolate: '#141416'");
    expect(tailwindContent).toContain("walnut: '#1B1B1E'");
    expect(tailwindContent).toContain("bronze: '#898992'");
    expect(tailwindContent).toContain("sand: '#F2F2F3'");
    expect(tailwindContent).toContain("charcoal: '#5E5E66'");
    expect(tailwindContent).toContain("obsidian: '#0B0B0D'");

    // Negative assertions: Tailwind theme does NOT contain chromatic blues, cyans, greens, or golds
    expect(tailwindContent).not.toContain("cyan: '#06B6D4'");
    expect(tailwindContent).not.toContain("indigo: '#6366F1'");
    expect(tailwindContent).not.toContain("violet: '#8B5CF6'");
    expect(tailwindContent).not.toContain("sage: '#87A96B'");
    expect(tailwindContent).not.toContain("amber: '#D5851F'");
    expect(tailwindContent).not.toContain("champagne: '#DFBA53'");
    expect(tailwindContent).not.toContain("gold: '#E5A93C'");
    expect(tailwindContent).not.toContain("crimson: '#E50914'");
  });

  it('mathematically verifies WCAG 2.2 AA contrast ratios for all critical text and boundary pairs', () => {
    // Dark Mode Contrast Verification
    const darkMainOnPage = getContrastRatio(darkVars['--text-main'], darkVars['--bg-page']);
    expect(darkMainOnPage, 'Dark text-main on page >= 4.5:1').toBeGreaterThanOrEqual(4.5);

    const darkMainOnCard = getContrastRatio(darkVars['--text-main'], darkVars['--bg-card']);
    expect(darkMainOnCard, 'Dark text-main on card >= 4.5:1').toBeGreaterThanOrEqual(4.5);

    const darkSubOnPage = getContrastRatio(darkVars['--text-sub'], darkVars['--bg-page']);
    expect(darkSubOnPage, 'Dark text-sub on page >= 4.5:1').toBeGreaterThanOrEqual(4.5);

    const darkMutedOnCard = getContrastRatio(darkVars['--text-muted'], darkVars['--bg-card']);
    expect(darkMutedOnCard, 'Dark text-muted on card >= 4.5:1').toBeGreaterThanOrEqual(4.5);

    const darkMutedOnHover = getContrastRatio(darkVars['--text-muted'], darkVars['--bg-hover']);
    expect(darkMutedOnHover, 'Dark text-muted on hover >= 4.5:1').toBeGreaterThanOrEqual(4.5);

    const darkOnAccentOnAccent = getContrastRatio(darkVars['--on-accent'], darkVars['--accent']);
    expect(darkOnAccentOnAccent, 'Dark on-accent on accent >= 4.5:1').toBeGreaterThanOrEqual(4.5);

    const darkBorderStrong = getContrastRatio(darkVars['--border-strong'], darkVars['--bg-page']);
    expect(darkBorderStrong, 'Dark border-strong on page >= 3.0:1 Non-Text AA').toBeGreaterThanOrEqual(3.0);

    const darkSignalOnPage = getContrastRatio(darkVars['--signal'], darkVars['--bg-page']);
    expect(darkSignalOnPage, 'Dark signal dot on page >= 3.0:1 Non-Text AA').toBeGreaterThanOrEqual(3.0);

    // Light Mode Contrast Verification
    const lightMainOnPage = getContrastRatio(lightVars['--text-main'], lightVars['--bg-page']);
    expect(lightMainOnPage, 'Light text-main on page >= 4.5:1').toBeGreaterThanOrEqual(4.5);

    const lightMainOnCard = getContrastRatio(lightVars['--text-main'], lightVars['--bg-card']);
    expect(lightMainOnCard, 'Light text-main on card >= 4.5:1').toBeGreaterThanOrEqual(4.5);

    const lightSubOnPage = getContrastRatio(lightVars['--text-sub'], lightVars['--bg-page']);
    expect(lightSubOnPage, 'Light text-sub on page >= 4.5:1').toBeGreaterThanOrEqual(4.5);

    const lightMutedOnCard = getContrastRatio(lightVars['--text-muted'], lightVars['--bg-card']);
    expect(lightMutedOnCard, 'Light text-muted on card >= 4.5:1').toBeGreaterThanOrEqual(4.5);

    const lightMutedOnHover = getContrastRatio(lightVars['--text-muted'], lightVars['--bg-hover']);
    expect(lightMutedOnHover, 'Light text-muted on hover >= 4.5:1').toBeGreaterThanOrEqual(4.5);

    const lightOnAccentOnAccent = getContrastRatio(lightVars['--on-accent'], lightVars['--accent']);
    expect(lightOnAccentOnAccent, 'Light on-accent on accent >= 4.5:1').toBeGreaterThanOrEqual(4.5);

    const lightBorderStrong = getContrastRatio(lightVars['--border-strong'], lightVars['--bg-page']);
    expect(lightBorderStrong, 'Light border-strong on page >= 3.0:1 Non-Text AA').toBeGreaterThanOrEqual(3.0);

    const lightSignalOnPage = getContrastRatio(lightVars['--signal'], lightVars['--bg-page']);
    expect(lightSignalOnPage, 'Light signal dot on page >= 3.0:1 Non-Text AA').toBeGreaterThanOrEqual(3.0);
  });
});
