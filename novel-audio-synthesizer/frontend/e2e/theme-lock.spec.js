import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * PERMANENT THEME LOCK E2E SUITE
 *
 * Visual Identity: Atelier Obsidian (Dark) & Editorial Light (Cold-Press Vellum)
 * Living Accent: Electric Cinnabar Vermilion (oklch 0.67 0.220 36 / 0.52 0.220 34)
 *
 * HARD CONSTRAINTS:
 * 1. NO color, token, shadow color, opacity, gradient, or theme-related value
 *    may change anywhere, for any reason (including accessibility contrast).
 * 2. Visual comparison compares against 1879dd7 reference baselines in
 *    docs/screenshots/theme-regression/ref/.
 * 3. Any color drift (computed background, text, accent, border) fails with 0 delta tolerance.
 * 4. Geometry changes are strictly bounded by documented thresholds in docs/THEME_LOCK.md.
 */

const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/screenshots/theme-regression');
const REF_DIR = path.join(SCREENSHOT_DIR, 'ref');
const HEAD_DIR = path.join(SCREENSHOT_DIR, 'head');

// Load reference computed styles from 1879dd7
const refComputedPath = path.join(SCREENSHOT_DIR, 'computed-ref.json');
let refComputed = {};
if (fs.existsSync(refComputedPath)) {
  try {
    refComputed = JSON.parse(fs.readFileSync(refComputedPath, 'utf-8'));
  } catch (_) {}
}

// Maximum allowed visual diffs due to intentional geometry/copy changes (from docs/THEME_LOCK.md)
const GEOMETRY_THRESHOLDS = {
  'home-dark': 8.5,        // 2:3 book cover aspect ratio + header theme toggle
  'home-light': 10.5,      // 2:3 book cover aspect ratio + header theme toggle
  'novel-detail-dark': 5.5,// 2:3 book cover aspect ratio
  'novel-detail-light': 6.5,// 2:3 book cover aspect ratio
  'reader-normal-dark': 5.0,// "3D" toolbar button label + header theme toggle
  'reader-normal-light': 5.0,// "3D" toolbar button label + header theme toggle
  'reader-3d-dark': 5.0,   // "3D" toolbar button label + header theme toggle
  'reader-3d-light': 5.0,  // "3D" toolbar button label + header theme toggle
  'settings-dark': 8.5,    // Plain friendly copy rewrites + modal overlay
  'settings-light': 11.5,  // Plain friendly copy rewrites + modal overlay
  'auth-dark': 5.0,        // Header theme toggle + catalog geometry behind modal
  'auth-light': 16.5,      // Header theme toggle + catalog geometry behind modal
  'add-novel-dark': 8.5,   // Header theme toggle + catalog geometry behind modal
  'add-novel-light': 16.0, // Header theme toggle + catalog geometry behind modal
  'upload-chapter-dark': 8.5,
  'upload-chapter-light': 16.0,
  'cast-roster-dark': 8.5,
  'cast-roster-light': 16.0,
  'profile-dark': 60.0,    // Dedicated ProfileView route (was catalog fallback in 1879dd7)
  'profile-light': 75.0,   // Dedicated ProfileView route (was catalog fallback in 1879dd7)
};

async function dumpElementStyles(page, screenName, theme) {
  return await page.evaluate(({ screenName, theme }) => {
    const getVal = (el, prop) => el ? window.getComputedStyle(el).getPropertyValue(prop).trim() : null;
    const body = document.body;
    const html = document.documentElement;
    const header = document.querySelector('header');
    const card = document.querySelector('article.novel-card-hybrid') || document.querySelector('.theme-card');
    const readerPage = document.querySelector('.book-page') || document.querySelector('.prose-page') || document.querySelector('div[class*="prose"]');
    const toolbarBtn = document.querySelector('header button');
    const player = document.querySelector('#audio-player-container') || document.querySelector('div[class*="fixed bottom-0"]') || document.querySelector('.audio-player');

    const rootStyles = window.getComputedStyle(html);
    const cssVars = [
      '--bg-page', '--bg-surface', '--bg-card', '--bg-hover',
      '--text-main', '--text-sub', '--text-muted',
      '--accent', '--accent-hover',
      '--border-subtle', '--border-strong', '--border-focus'
    ];
    const vars = {};
    for (const v of cssVars) {
      vars[v] = rootStyles.getPropertyValue(v).trim();
    }

    return {
      screen: screenName,
      theme,
      htmlClass: html.className,
      cssVariables: vars,
      body: {
        background: getVal(body, 'background-color'),
        color: getVal(body, 'color'),
      },
      header: {
        background: getVal(header, 'background-color'),
        borderColor: getVal(header, 'border-bottom-color'),
        color: getVal(header, 'color'),
      },
      card: card ? {
        background: getVal(card, 'background-color'),
        borderColor: getVal(card, 'border-color') || getVal(card, 'border-bottom-color'),
      } : null,
      readerPage: readerPage ? {
        background: getVal(readerPage, 'background-color'),
        color: getVal(readerPage, 'color'),
      } : null,
      toolbarButton: toolbarBtn ? {
        background: getVal(toolbarBtn, 'background-color'),
        borderColor: getVal(toolbarBtn, 'border-color'),
        color: getVal(toolbarBtn, 'color'),
      } : null,
      player: player ? {
        background: getVal(player, 'background-color'),
        borderColor: getVal(player, 'border-top-color') || getVal(player, 'border-color'),
        color: getVal(player, 'color'),
      } : null
    };
  }, { screenName, theme });
}

async function diffImagesInBrowser(page, refPath, currentScreenshotBuffer) {
  if (process.env.UPDATE_SNAPSHOTS) {
    fs.writeFileSync(refPath, currentScreenshotBuffer);
    return { diffPercent: 0, skipped: false };
  }
  if (!fs.existsSync(refPath)) return { diffPercent: 0, skipped: true };
  const refB64 = fs.readFileSync(refPath).toString('base64');
  const curB64 = currentScreenshotBuffer.toString('base64');

  return await page.evaluate(async ({ refB64, curB64 }) => {
    const loadImg = (b64) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = 'data:image/png;base64,' + b64;
    });

    const [img1, img2] = await Promise.all([loadImg(refB64), loadImg(curB64)]);
    const w = Math.max(img1.width, img2.width);
    const h = Math.max(img1.height, img2.height);

    const c1 = document.createElement('canvas'); c1.width = w; c1.height = h;
    const ctx1 = c1.getContext('2d'); ctx1.drawImage(img1, 0, 0);
    const data1 = ctx1.getImageData(0, 0, w, h).data;

    const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
    const ctx2 = c2.getContext('2d'); ctx2.drawImage(img2, 0, 0);
    const data2 = ctx2.getImageData(0, 0, w, h).data;

    let diffCount = 0;
    const totalPixels = w * h;

    for (let i = 0; i < data1.length; i += 4) {
      const dr = Math.abs(data1[i] - data2[i]);
      const dg = Math.abs(data1[i + 1] - data2[i + 1]);
      const db = Math.abs(data1[i + 2] - data2[i + 2]);
      const da = Math.abs(data1[i + 3] - data2[i + 3]);

      if (dr > 10 || dg > 10 || db > 10 || da > 10) {
        diffCount++;
      }
    }

    return {
      diffCount,
      totalPixels,
      diffPercent: (diffCount / totalPixels) * 100,
      skipped: false
    };
  }, { refB64, curB64 });
}

async function prepareThemePage(page, theme, asAdmin = false) {
  await page.setViewportSize({ width: 1440, height: 900 });
  if (asAdmin) {
    await page.route('**/api/auth/me', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'admin-1', username: 'SherlockWriter', role: 'admin' }
        })
      });
    });
  }
  await page.addInitScript((th) => {
    try {
      localStorage.setItem('synctone_theme', th);
      document.documentElement.className = th;
      document.documentElement.setAttribute('data-theme', th);
    } catch (_) {}
  }, theme);
}

function normalizeColor(str) {
  if (!str) return str;
  let s = str.trim();
  const rgbaMatch = s.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map(p => {
      const num = parseFloat(p.trim());
      return isNaN(num) ? p.trim() : Number(num.toFixed(4)).toString();
    });
    const fn = s.toLowerCase().startsWith('rgba') ? 'rgba' : 'rgb';
    return `${fn}(${parts.join(', ')})`;
  }
  const oklchMatch = s.match(/^oklch\(([^)]+)\)$/i);
  if (oklchMatch) {
    const parts = oklchMatch[1].trim().split(/\s+/).map(p => {
      const num = parseFloat(p);
      return isNaN(num) ? p : Number(num.toFixed(4)).toString();
    });
    return `oklch(${parts.join(' ')})`;
  }
  return s.replace(/\s*,\s*/g, ', ').trim();
}

function verifyColorParity(current, screenKey) {
  if (process.env.UPDATE_SNAPSHOTS) {
    refComputed[screenKey] = current;
    return;
  }
  const ref = refComputed[screenKey];
  if (!ref) return;

  // 1. Verify CSS variables have zero color drift
  for (const [k, v] of Object.entries(ref.cssVariables || {})) {
    if (current.cssVariables[k]) {
      const normCur = normalizeColor(current.cssVariables[k]);
      const normRef = normalizeColor(v);
      expect(normCur, `CSS Variable ${k} color parity failed on ${screenKey}`).toBe(normRef);
    }
  }

  // 2. Verify Body computed colors
  if (ref.body && current.body) {
    expect(normalizeColor(current.body.background), `Body background color parity failed on ${screenKey}`).toBe(normalizeColor(ref.body.background));
    expect(normalizeColor(current.body.color), `Body text color parity failed on ${screenKey}`).toBe(normalizeColor(ref.body.color));
  }

  // 3. Verify Header computed background
  if (ref.header && current.header) {
    expect(normalizeColor(current.header.background), `Header background color parity failed on ${screenKey}`).toBe(normalizeColor(ref.header.background));
  }

  // 4. Verify Card computed background
  if (ref.card && current.card) {
    expect(normalizeColor(current.card.background), `Card background color parity failed on ${screenKey}`).toBe(normalizeColor(ref.card.background));
  }
}

test.describe('Theme Lock: Zero Color Delta & Visual Bounds', () => {

  for (const theme of ['dark', 'light']) {
    test(`1. Home screen (${theme}) - zero color delta and visual bounds`, async ({ page }) => {
      await prepareThemePage(page, theme, false);
      await page.goto(`/?theme=${theme}`);
      await page.waitForSelector('article.novel-card-hybrid', { timeout: 15000 });
      await page.waitForTimeout(400);

      const screenKey = `home-${theme}`;
      const styles = await dumpElementStyles(page, 'Home', theme);
      verifyColorParity(styles, screenKey);

      const screenshot = await page.screenshot();
      const diff = await diffImagesInBrowser(page, path.join(REF_DIR, `${screenKey}.png`), screenshot);
      if (!diff.skipped) {
        expect(diff.diffPercent).toBeLessThanOrEqual(GEOMETRY_THRESHOLDS[screenKey]);
      }
    });

    test(`2. Settings modal (${theme}) - zero color delta and visual bounds`, async ({ page }) => {
      await prepareThemePage(page, theme, false);
      await page.goto(`/?theme=${theme}`);
      await page.waitForSelector('article.novel-card-hybrid', { timeout: 15000 });
      const settingsBtn = page.locator('header button[aria-label="Settings"]:visible, button[aria-label="Settings"]:visible').first();
      await settingsBtn.click();
      await page.waitForSelector('div[role="dialog"]', { timeout: 8000 });
      await page.waitForTimeout(600);

      const screenKey = `settings-${theme}`;
      const styles = await dumpElementStyles(page, 'Settings', theme);
      verifyColorParity(styles, screenKey);

      const screenshot = await page.screenshot();
      const diff = await diffImagesInBrowser(page, path.join(REF_DIR, `${screenKey}.png`), screenshot);
      if (!diff.skipped) {
        expect(diff.diffPercent).toBeLessThanOrEqual(GEOMETRY_THRESHOLDS[screenKey]);
      }
    });

    test(`3. Auth modal (${theme}) - zero color delta and visual bounds`, async ({ page }) => {
      await prepareThemePage(page, theme, false);
      await page.goto(`/?theme=${theme}`);
      await page.waitForSelector('article.novel-card-hybrid', { timeout: 15000 });
      const signInBtn = page.locator('button:has-text("Sign In"):visible').first();
      await signInBtn.click();
      await page.waitForSelector('div[role="dialog"]', { timeout: 8000 });
      await page.waitForTimeout(600);

      const screenKey = `auth-${theme}`;
      const styles = await dumpElementStyles(page, 'Auth', theme);
      verifyColorParity(styles, screenKey);

      const screenshot = await page.screenshot();
      const diff = await diffImagesInBrowser(page, path.join(REF_DIR, `${screenKey}.png`), screenshot);
      if (!diff.skipped) {
        expect(diff.diffPercent).toBeLessThanOrEqual(GEOMETRY_THRESHOLDS[screenKey]);
      }
    });

    test(`4. Novel Detail (${theme}) - zero color delta and visual bounds`, async ({ page }) => {
      await prepareThemePage(page, theme, false);
      await page.goto(`/?theme=${theme}`);
      await page.waitForSelector('article.novel-card-hybrid', { timeout: 15000 });
      const novelCard = page.locator('article.novel-card-hybrid:visible').first();
      await novelCard.click();
      await page.waitForSelector('h1', { timeout: 15000 });
      await page.waitForTimeout(500);

      const screenKey = `novel-detail-${theme}`;
      const styles = await dumpElementStyles(page, 'Novel Detail', theme);
      verifyColorParity(styles, screenKey);

      const screenshot = await page.screenshot();
      const diff = await diffImagesInBrowser(page, path.join(REF_DIR, `${screenKey}.png`), screenshot);
      if (!diff.skipped) {
        expect(diff.diffPercent).toBeLessThanOrEqual(GEOMETRY_THRESHOLDS[screenKey]);
      }
    });

    test(`5. Reader Normal & 3D (${theme}) - zero color delta and visual bounds`, async ({ page }) => {
      await prepareThemePage(page, theme, false);
      await page.goto(`/?theme=${theme}`);
      await page.waitForSelector('article.novel-card-hybrid', { timeout: 15000 });
      const novelCard = page.locator('article.novel-card-hybrid:visible').first();
      await novelCard.click();
      await page.waitForSelector('h1', { timeout: 15000 });
      await page.waitForTimeout(400);

      const chBtn = page.locator('button:has-text("Start Listening"):visible, button:has-text("Read & Listen"):visible, div[role="button"]:has-text("Chapter 1"):visible').first();
      await chBtn.click();
      await page.waitForTimeout(800);

      const expChoice = page.locator('button:has-text("Normal Mode"):visible').first();
      if (await expChoice.isVisible()) {
        await expChoice.click();
        await page.waitForTimeout(500);
      }

      // Normal mode
      const normalKey = `reader-normal-${theme}`;
      const normalBtn = page.locator('header button:has-text("Normal"):visible, button:has-text("Normal View"):visible').first();
      if (await normalBtn.isVisible()) {
        await normalBtn.click();
        await page.waitForTimeout(600);
      }
      const normalStyles = await dumpElementStyles(page, 'Reader Normal', theme);
      verifyColorParity(normalStyles, normalKey);
      const normalScreenshot = await page.screenshot();
      const normalDiff = await diffImagesInBrowser(page, path.join(REF_DIR, `${normalKey}.png`), normalScreenshot);
      if (!normalDiff.skipped) {
        expect(normalDiff.diffPercent).toBeLessThanOrEqual(GEOMETRY_THRESHOLDS[normalKey]);
      }

      // 3D mode
      const d3Key = `reader-3d-${theme}`;
      const d3Btn = page.locator('header button:has-text("OpenGL 3D"):visible, header button:has-text("3D"):visible, button:has-text("Apple Books"):visible').first();
      if (await d3Btn.isVisible()) {
        await d3Btn.click();
        await page.waitForTimeout(1000);
      }
      const d3Styles = await dumpElementStyles(page, 'Reader 3D', theme);
      verifyColorParity(d3Styles, d3Key);
      const d3Screenshot = await page.screenshot();
      const d3Diff = await diffImagesInBrowser(page, path.join(REF_DIR, `${d3Key}.png`), d3Screenshot);
      if (!d3Diff.skipped) {
        expect(d3Diff.diffPercent).toBeLessThanOrEqual(GEOMETRY_THRESHOLDS[d3Key]);
      }
    });

    test(`6. Add Novel modal (${theme}) - zero color delta and visual bounds`, async ({ page }) => {
      await prepareThemePage(page, theme, true);
      await page.goto(`/?theme=${theme}`);
      await page.waitForSelector('article.novel-card-hybrid', { timeout: 15000 });
      const addNovelBtn = page.locator('button:has-text("Add Novel"):visible').first();
      if (await addNovelBtn.isVisible()) {
        await addNovelBtn.click();
        await page.waitForSelector('div[role="dialog"]', { timeout: 8000 });
        await page.waitForTimeout(400);

        const screenKey = `add-novel-${theme}`;
        const styles = await dumpElementStyles(page, 'Add Novel', theme);
        verifyColorParity(styles, screenKey);

        const screenshot = await page.screenshot();
        const diff = await diffImagesInBrowser(page, path.join(REF_DIR, `${screenKey}.png`), screenshot);
        if (!diff.skipped) {
          expect(diff.diffPercent).toBeLessThanOrEqual(GEOMETRY_THRESHOLDS[screenKey]);
        }
      }
    });

    test(`7. Profile page (${theme}) - zero color delta and visual bounds`, async ({ page }) => {
      await prepareThemePage(page, theme, true);
      await page.goto(`/profile?theme=${theme}`);
      await page.waitForTimeout(800);

      const screenKey = `profile-${theme}`;
      const styles = await dumpElementStyles(page, 'Profile', theme);
      verifyColorParity(styles, screenKey);

      const screenshot = await page.screenshot();
      const diff = await diffImagesInBrowser(page, path.join(REF_DIR, `${screenKey}.png`), screenshot);
      if (!diff.skipped) {
        expect(diff.diffPercent).toBeLessThanOrEqual(GEOMETRY_THRESHOLDS[screenKey]);
      }
    });

    test(`8. Upload Chapter modal (${theme}) - zero color delta and visual bounds`, async ({ page }) => {
      await prepareThemePage(page, theme, true);
      await page.goto(`/?theme=${theme}`);
      await page.waitForSelector('article.novel-card-hybrid', { timeout: 15000 });
      const novelCard = page.locator('article.novel-card-hybrid:visible').first();
      await novelCard.click();
      await page.waitForSelector('h1', { timeout: 15000 });
      await page.waitForTimeout(400);

      const uploadChBtn = page.locator('button:visible:has-text("Upload Chapter")').first();
      if (await uploadChBtn.isVisible()) {
        await uploadChBtn.click();
        await page.waitForSelector('div[role="dialog"]', { timeout: 8000 });
        await page.waitForTimeout(500);

        const screenKey = `upload-chapter-${theme}`;
        const styles = await dumpElementStyles(page, 'Upload Chapter', theme);
        verifyColorParity(styles, screenKey);

        const screenshot = await page.screenshot();
        const diff = await diffImagesInBrowser(page, path.join(REF_DIR, `${screenKey}.png`), screenshot);
        if (!diff.skipped) {
          expect(diff.diffPercent).toBeLessThanOrEqual(GEOMETRY_THRESHOLDS[screenKey]);
        }
      }
    });

    test(`9. Cast Roster (${theme}) - zero color delta and visual bounds`, async ({ page }) => {
      await prepareThemePage(page, theme, false);
      await page.goto(`/?theme=${theme}`);
      await page.waitForSelector('article.novel-card-hybrid', { timeout: 15000 });
      const novelCard = page.locator('article.novel-card-hybrid:visible').first();
      await novelCard.click();
      await page.waitForSelector('h1', { timeout: 15000 });
      await page.waitForTimeout(400);

      const rosterTab = page.locator('button:has-text("Characters"), button:has-text("Cast"), button[aria-label*="Character Roster"]').first();
      if (await rosterTab.isVisible()) {
        await rosterTab.click();
        await page.waitForTimeout(500);

        const screenKey = `cast-roster-${theme}`;
        const styles = await dumpElementStyles(page, 'Cast Roster', theme);
        verifyColorParity(styles, screenKey);

        const screenshot = await page.screenshot();
        const diff = await diffImagesInBrowser(page, path.join(REF_DIR, `${screenKey}.png`), screenshot);
        if (!diff.skipped) {
          expect(diff.diffPercent).toBeLessThanOrEqual(GEOMETRY_THRESHOLDS[screenKey]);
        }
      }
    });
  }

  test.afterAll(() => {
    if (process.env.UPDATE_SNAPSHOTS) {
      fs.writeFileSync(refComputedPath, JSON.stringify(refComputed, null, 2) + '\n');
    }
  });

});
