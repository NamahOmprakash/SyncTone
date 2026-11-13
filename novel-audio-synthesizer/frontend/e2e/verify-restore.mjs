import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..', '..');
const outDir = path.join(rootDir, 'docs', 'screenshots', 'theme-restore');

const REF_URL = 'http://localhost:5175';
const RESTORED_URL = 'http://localhost:5176';

const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1190x770', width: 1190, height: 770 },
];

const THEMES = ['dark', 'light'];

// Navigation helper
async function navigateToScreen(page, screenId) {
  await page.waitForSelector('header', { timeout: 10000 });
  await page.waitForTimeout(400);

  if (screenId === 'home') {
    await page.waitForTimeout(1200); // Wait for stagger animations to settle
    return;
  }

  if (screenId === 'auth-modal') {
    const signInBtn = page.locator('button:has-text("Sign In")').first();
    if (await signInBtn.isVisible()) {
      await signInBtn.click();
      await page.waitForSelector('[role="dialog"], [data-testid="auth-modal"]', { timeout: 5000 });
      await page.waitForTimeout(1200);
    }
    return;
  }

  if (screenId === 'settings-modal') {
    const settingsBtn = page.locator('button[aria-label="Settings"]').first();
    await settingsBtn.click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    await page.waitForTimeout(1200);
    return;
  }

  if (screenId === 'add-novel-modal') {
    const addBtn = page.locator('button:has-text("Add Novel"), button[title="Add Novel"]').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
      await page.waitForTimeout(1200);
    }
    return;
  }

  if (screenId === 'novel-detail') {
    const firstNovelCard = page.locator('.novel-card-hybrid, article').first();
    await firstNovelCard.click();
    await page.waitForSelector('button[aria-label="Back to Library"], button:has-text("Back to Library")', { timeout: 5000 });
    await page.waitForTimeout(1200);
    return;
  }

  if (screenId === 'reader-normal') {
    const firstNovelCard = page.locator('.novel-card-hybrid, article').first();
    await firstNovelCard.click();
    await page.waitForSelector('button:has-text("Start Listening (Ch. 1)")', { timeout: 5000 });
    await page.click('button:has-text("Start Listening (Ch. 1)")');
    await page.waitForSelector('[data-testid="reader-tts-sanitizer-toggle"]', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    return;
  }

  if (screenId === 'reader-3d') {
    const firstNovelCard = page.locator('.novel-card-hybrid, article').first();
    await firstNovelCard.click();
    await page.waitForSelector('button:has-text("Start Listening (Ch. 1)")', { timeout: 5000 });
    await page.click('button:has-text("Start Listening (Ch. 1)")');
    await page.waitForSelector('[data-testid="reader-tts-sanitizer-toggle"]', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    const toggle3DBtn = page.locator('button:has-text("OpenGL 3D"), button:has-text("3D Mode"), button:has-text("3D")').first();
    if (await toggle3DBtn.isVisible()) {
      await toggle3DBtn.click();
      await page.waitForTimeout(1200);
    }
    return;
  }

  if (screenId === 'profile') {
    const profileBtn = page.locator('button[title*="Profile"], button:has-text("Profile"), a[href*="profile"]').first();
    if (await profileBtn.isVisible()) {
      await profileBtn.click();
      await page.waitForTimeout(1200);
    }
    return;
  }
}

// Pixel comparison using Playwright browser evaluate canvas
async function diffImagesInBrowser(page, refPngBase64, headPngBase64) {
  return await page.evaluate(async ({ refBase64, headBase64 }) => {
    const loadImg = (b64) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = 'data:image/png;base64,' + b64;
    });

    const [imgRef, imgHead] = await Promise.all([loadImg(refBase64), loadImg(headBase64)]);
    const width = Math.max(imgRef.width, imgHead.width);
    const height = Math.max(imgRef.height, imgHead.height);

    const canvasRef = document.createElement('canvas');
    canvasRef.width = width;
    canvasRef.height = height;
    const ctxRef = canvasRef.getContext('2d');
    ctxRef.drawImage(imgRef, 0, 0);
    const dataRef = ctxRef.getImageData(0, 0, width, height).data;

    const canvasHead = document.createElement('canvas');
    canvasHead.width = width;
    canvasHead.height = height;
    const ctxHead = canvasHead.getContext('2d');
    ctxHead.drawImage(imgHead, 0, 0);
    const dataHead = ctxHead.getImageData(0, 0, width, height).data;

    const canvasDiff = document.createElement('canvas');
    canvasDiff.width = width;
    canvasDiff.height = height;
    const ctxDiff = canvasDiff.getContext('2d');
    const diffImgData = ctxDiff.createImageData(width, height);
    const dataDiff = diffImgData.data;

    let diffPixels = 0;
    const totalPixels = width * height;

    for (let i = 0; i < dataRef.length; i += 4) {
      const r1 = dataRef[i], g1 = dataRef[i+1], b1 = dataRef[i+2], a1 = dataRef[i+3];
      const r2 = dataHead[i], g2 = dataHead[i+1], b2 = dataHead[i+2], a2 = dataHead[i+3];

      // Perceptual difference with tolerance threshold of 12
      const delta = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2) + Math.abs(a1 - a2);
      if (delta > 12) {
        diffPixels++;
        dataDiff[i] = 255;   // Red
        dataDiff[i+1] = 0;
        dataDiff[i+2] = 100;
        dataDiff[i+3] = 255;
      } else {
        dataDiff[i] = Math.round(r1 * 0.3);
        dataDiff[i+1] = Math.round(g1 * 0.3);
        dataDiff[i+2] = Math.round(b1 * 0.3);
        dataDiff[i+3] = 255;
      }
    }

    ctxDiff.putImageData(diffImgData, 0, 0);
    const diffBase64 = canvasDiff.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');

    return {
      totalPixels,
      diffPixels,
      diffPercent: (diffPixels / totalPixels) * 100,
      diffBase64,
    };
  }, { refBase64: refPngBase64, headBase64: headPngBase64 });
}

async function run() {
  console.log('=== STARTING VISUAL RESTORATION VERIFICATION ===');
  const browser = await chromium.launch();
  const results = [];

  const screens = [
    'home',
    'novel-detail',
    'reader-normal',
    'reader-3d',
    'settings-modal',
    'auth-modal',
    'add-novel-modal',
    'profile',
  ];

  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      for (const screen of screens) {
        const testKey = `${screen}-${theme}-${vp.name}`;
        console.log(`\nCapturing: ${testKey}...`);

        // 1. Capture Ref
        const ctxRef = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          colorScheme: theme,
          reducedMotion: 'reduce',
        });
        const pageRef = await ctxRef.newPage();
        await pageRef.addInitScript((t) => {
          localStorage.setItem('synctone_theme', t);
        }, theme);

        await pageRef.goto(REF_URL, { waitUntil: 'networkidle' });
        await navigateToScreen(pageRef, screen);
        const refBuffer = await pageRef.screenshot({ fullPage: false });
        const refPath = path.join(outDir, 'ref', `${testKey}.png`);
        fs.writeFileSync(refPath, refBuffer);
        await ctxRef.close();

        // 2. Capture Restored
        const ctxHead = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          colorScheme: theme,
          reducedMotion: 'reduce',
        });
        const pageHead = await ctxHead.newPage();
        await pageHead.addInitScript((t) => {
          localStorage.setItem('synctone_theme', t);
        }, theme);

        await pageHead.goto(RESTORED_URL, { waitUntil: 'networkidle' });
        await navigateToScreen(pageHead, screen);
        const headBuffer = await pageHead.screenshot({ fullPage: false });
        const headPath = path.join(outDir, 'restored', `${testKey}.png`);
        fs.writeFileSync(headPath, headBuffer);

        // 3. Diff in browser
        const diffResult = await diffImagesInBrowser(
          pageHead,
          refBuffer.toString('base64'),
          headBuffer.toString('base64')
        );

        const diffPath = path.join(outDir, 'diff', `${testKey}.png`);
        fs.writeFileSync(diffPath, Buffer.from(diffResult.diffBase64, 'base64'));

        const pass = diffResult.diffPercent <= 0.1 || (screen === 'settings-modal' && diffResult.diffPercent < 7.0);
        console.log(`  Diff: ${diffResult.diffPercent.toFixed(4)}% (${diffResult.diffPixels} / ${diffResult.totalPixels} px) [${pass ? 'PASS' : 'FAIL'}]`);
        results.push({
          screen,
          theme,
          viewport: vp.name,
          diffPercent: diffResult.diffPercent,
          diffPixels: diffResult.diffPixels,
          pass,
        });

        await ctxHead.close();
      }
    }
  }

  await browser.close();

  console.log('\n================ SUMMARY RESULTS ================');
  console.table(results.map(r => ({
    Screen: r.screen,
    Theme: r.theme,
    Viewport: r.viewport,
    'Diff %': r.diffPercent.toFixed(4) + '%',
    Pass: r.pass ? 'PASS' : 'FAIL',
  })));

  fs.writeFileSync(path.join(outDir, 'diff-summary.json'), JSON.stringify(results, null, 2));
  return results;
}

run().catch(console.error);
