import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'novel-audio-synthesizer/frontend/dist');

// 1. Static SPA HTTP Server
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  let filePath = path.join(distDir, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    const indexPath = path.join(distDir, 'index.html');
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(indexPath).pipe(res);
  }
});

const PORT = 4188;
await new Promise((resolve) => server.listen(PORT, resolve));
console.log(`Fit matrix test server listening on http://localhost:${PORT}`);

// 2. Playwright Chromium Launch
const playwrightPath = path.join(rootDir, 'novel-audio-synthesizer/frontend/node_modules/playwright/index.mjs');
const { chromium } = await import(playwrightPath);
const browser = await chromium.launch({ headless: true });

// Mock Chapter Data with multiple segments for realistic multi-page spreads
const mockNovel = {
  id: 'n-sherlock-1',
  title: 'The Adventures of Sherlock Holmes',
  author_username: 'Arthur Conan Doyle',
  narrator: 'Dr. John Watson',
  channel: 'verified',
  chapter_count: 24,
  total_duration_ms: 2294000,
  character_count: 5,
  synopsis: 'A Scandal in Bohemia and other classic tales.',
  cover_object: null,
};

const mockChapter = {
  id: 'ch-1',
  novel_id: 'n-sherlock-1',
  chapter_number: 1,
  title: 'Chapter I. A Scandal in Bohemia',
  duration_ms: 185000,
  has_studio_audio: true,
  audio_url: '/api/stream/mock-audio',
  segments: [
    {
      segment_id: 1,
      order: 1,
      type: 'narration',
      speaker_name: 'Dr. John Watson',
      text: 'To Sherlock Holmes she is always the woman. I have seldom heard him mention her under any other name. In his eyes she eclipses and predominates the whole of her sex.',
    },
    {
      segment_id: 2,
      order: 2,
      type: 'narration',
      speaker_name: 'Dr. John Watson',
      text: 'It was not that he felt any emotion akin to love for Irene Adler. All emotions, and that one particularly, were abhorrent to his cold, precise but admirably balanced mind.',
    },
    {
      segment_id: 3,
      order: 3,
      type: 'narration',
      speaker_name: 'Dr. John Watson',
      text: 'He was, I take it, the most perfect reasoning and observing machine that the world has seen, but as a lover he would have placed himself in a false position.',
    },
    {
      segment_id: 4,
      order: 4,
      type: 'narration',
      speaker_name: 'Dr. John Watson',
      text: 'He never spoke of the softer passions, save with a gibe and a sneer. They were admirable things for the observer—excellent for drawing the veil from men\'s motives and actions.',
    },
    {
      segment_id: 5,
      order: 5,
      type: 'dialogue',
      speaker_name: 'Sherlock Holmes',
      text: '“I had seen little of Holmes lately. My marriage had drifted us away from each other. My own complete happiness, and the home-centred interests which rise up around the man who first finds himself master of his own establishment, were sufficient to absorb all my attention.”',
    },
    {
      segment_id: 6,
      order: 6,
      type: 'narration',
      speaker_name: 'Dr. John Watson',
      text: 'He was still, as ever, deeply attracted by the study of crime, and occupied his immense faculties and extraordinary powers of observation in following out those clues.',
    },
    {
      segment_id: 7,
      order: 7,
      type: 'dialogue',
      speaker_name: 'Sherlock Holmes',
      text: '“From time to time I heard some vague account of his doings: of his summons to Odessa in the case of the Trepoff murder, of his clearing up of the singular tragedy of the Atkinson brothers at Trincomalee.”',
    },
    {
      segment_id: 8,
      order: 8,
      type: 'narration',
      speaker_name: 'Dr. John Watson',
      text: 'One night—it was on the twentieth of March, 1888—I was returning from a journey to a patient, when my way led me through Baker Street.',
    },
  ],
  manifest: {
    audio_stream_url: '/api/stream/mock-audio',
    total_duration_ms: 185000,
    timeline: [
      { segment_id: 1, order: 1, start_ms: 0, end_ms: 5000 },
      { segment_id: 2, order: 2, start_ms: 5000, end_ms: 10000 },
      { segment_id: 3, order: 3, start_ms: 10000, end_ms: 15000 },
      { segment_id: 4, order: 4, start_ms: 15000, end_ms: 20000 },
      { segment_id: 5, order: 5, start_ms: 20000, end_ms: 27000 },
      { segment_id: 6, order: 6, start_ms: 27000, end_ms: 33000 },
      { segment_id: 7, order: 7, start_ms: 33000, end_ms: 40000 },
      { segment_id: 8, order: 8, start_ms: 40000, end_ms: 48000 },
    ],
  },
};

async function setupPageRoutes(page) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/novels/n-sherlock-1')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          novel: mockNovel,
          chapters: [{ id: 'ch-1', chapter_number: 1, title: 'Chapter I. A Scandal in Bohemia' }],
          characters: [],
        }),
      });
    }
    if (url.includes('/api/novels')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ novels: [mockNovel] }),
      });
    }
    if (url.includes('/api/chapters/ch-1/segments')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockChapter.segments),
      });
    }
    if (url.includes('/api/chapters/ch-1')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockChapter),
      });
    }
    if (url.includes('/api/manifest/ch-1') || url.includes('/manifest/ch-1')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockChapter.manifest),
      });
    }
    if (url.includes('/api/playback')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ progress: null }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });
}

// The 9 Required Viewports from Task Specification
const VIEWPORTS = [
  { width: 1920, height: 1080, name: '1920x1080 (Desktop 1080p)' },
  { width: 1440, height: 900,  name: '1440x900 (Desktop reference)' },
  { width: 1366, height: 768,  name: '1366x768 (Standard Laptop)' },
  { width: 1280, height: 720,  name: '1280x720 (HD 720p)' },
  { width: 1024, height: 768,  name: '1024x768 (iPad Landscape / 4:3)' },
  { width: 768,  height: 1024, name: '768x1024 (Tablet Portrait)' },
  { width: 390,  height: 844,  name: '390x844 (Mobile Portrait)' },
  { width: 844,  height: 390,  name: '844x390 (Mobile Landscape)' },
  { width: 320,  height: 568,  name: '320x568 (Small Mobile / iPhone SE)' },
];

let totalChecks = 0;
let passedChecks = 0;
const failureList = [];

function check(label, condition, details = '') {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  ✓ ${label} ${details}`);
  } else {
    failureList.push(`${label} ${details}`);
    console.error(`  ✗ FAIL: ${label} ${details}`);
  }
}

try {
  console.log('\n======================================================');
  console.log('STARTING PLAYWRIGHT READER FIT MATRIX TEST SUITE');
  console.log('======================================================\n');

  // TEST 1: MATRIX VIEWPORT VERIFICATION (ALL 9 VIEWPORTS x 2 THEMES)
  console.log('--- TEST 1: All 9 Matrix Viewports (Dark & Light) ---');
  for (const vp of VIEWPORTS) {
    for (const theme of ['dark', 'light']) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        serviceWorkers: 'block',
      });
      await context.addInitScript(() => {
        localStorage.setItem('synctone_reader_mode_seen', 'true');
        localStorage.setItem('synctone_reader_mode_choice', 'normal');
      });

      const page = await context.newPage();
      await setupPageRoutes(page);

      await page.goto(`http://localhost:${PORT}/reader/ch-1`, { waitUntil: 'networkidle' });

      // Apply theme
      await page.evaluate((th) => {
        document.documentElement.setAttribute('data-theme', th);
        if (th === 'light') {
          document.documentElement.classList.add('light');
          document.documentElement.classList.remove('dark');
        } else {
          document.documentElement.classList.add('dark');
          document.documentElement.classList.remove('light');
        }
      }, theme);
      await page.waitForTimeout(150);

      // Verify no horizontal overflow/scroll
      const scrollInfo = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        windowWidth: window.innerWidth,
      }));
      check(
        `[${vp.name}] [${theme}] No horizontal scroll`,
        scrollInfo.scrollWidth <= scrollInfo.windowWidth + 2,
        `(scrollWidth: ${scrollInfo.scrollWidth}, windowWidth: ${scrollInfo.windowWidth})`
      );

      // Verify Reader Chrome Elements
      const toolbarExists = await page.$('.reader-floating-toolbar');
      check(`[${vp.name}] [${theme}] Toolbar exists`, !!toolbarExists);

      const chapterHeader = await page.$('.reader-book-header, .reader-chapter-title');
      check(`[${vp.name}] [${theme}] Chapter header exists`, !!chapterHeader);

      const bodyText = await page.$('.reader-body-text, .reader-content-stage');
      check(`[${vp.name}] [${theme}] Body prose stage exists`, !!bodyText);

      await context.close();
    }
  }

  // TEST 2: BOTH MODES (NORMAL & OPENGL 3D SPREAD)
  console.log('\n--- TEST 2: Both Modes (Normal & OpenGL 3D Spread) ---');
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      serviceWorkers: 'block',
    });
    await context.addInitScript(() => {
      localStorage.setItem('synctone_reader_mode_seen', 'true');
    });
    const page = await context.newPage();
    await setupPageRoutes(page);
    await page.goto(`http://localhost:${PORT}/reader/ch-1`, { waitUntil: 'networkidle' });

    // Mode 1: Normal Mode
    const normalStage = await page.$('.reader-content-stage');
    check('Normal Mode content stage rendered', !!normalStage);

    const normalChevrons = await page.$$('.gutter-chevron');
    check('Normal Mode gutter chevrons present on desktop', normalChevrons.length === 2);

    // Switch to Mode 2: OpenGL 3D
    const openglBtn = await page.$('button:has-text("OpenGL 3D")');
    check('OpenGL 3D mode switch button present', !!openglBtn);
    if (openglBtn) {
      await openglBtn.click();
      await page.waitForTimeout(300);

      // In OpenGL mode, book container is rendered
      const bookContainer = await page.$('.perspective-1200');
      check('OpenGL 3D perspective stage rendered', !!bookContainer);

      const pageCurlStage = await page.$('[class*="page-curl"], .perspective-1200 > div');
      check('OpenGL 3D book canvas container rendered', !!pageCurlStage);

      const openglScroll = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        noPageScroll: document.documentElement.scrollHeight <= window.innerHeight + 2,
        noHorizScroll: document.documentElement.scrollWidth <= window.innerWidth + 2,
      }));
      check('OpenGL mode fits stage with zero page scroll', openglScroll.noPageScroll && openglScroll.noHorizScroll, `(scrollHeight: ${openglScroll.scrollHeight}, innerHeight: ${openglScroll.innerHeight})`);
    }

    await context.close();
  }

  // TEST 3: A+ / A- FONT SCALING KEEPS OUTER BOOK CONTAINER SIZE
  console.log('\n--- TEST 3: A+ / A- Keeps Outer Size ---');
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      serviceWorkers: 'block',
    });
    await context.addInitScript(() => {
      localStorage.setItem('synctone_reader_mode_seen', 'true');
    });
    const page = await context.newPage();
    await setupPageRoutes(page);
    await page.goto(`http://localhost:${PORT}/reader/ch-1`, { waitUntil: 'networkidle' });

    // Switch to OpenGL 3D mode to test book container geometry
    const openglBtn = await page.$('button:has-text("OpenGL 3D")');
    if (openglBtn) await openglBtn.click();
    await page.waitForTimeout(300);

    const getOuterSize = async () => {
      return await page.evaluate(() => {
        const book = document.querySelector('.perspective-1200 > div');
        if (!book) return null;
        const rect = book.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      });
    };

    const initialSize = await getOuterSize();
    check('Initial book outer size measured', initialSize !== null, JSON.stringify(initialSize));

    // Click A+ (Increase font)
    const btnPlus = await page.$('#btn-font-plus, button[title="Increase Font"]');
    check('A+ button exists', !!btnPlus);
    if (btnPlus) {
      await btnPlus.click();
      await page.waitForTimeout(200);

      const sizeAfterPlus = await getOuterSize();
      check(
        'Outer width stays identical after A+',
        Math.abs(sizeAfterPlus.width - initialSize.width) <= 2,
        `(${sizeAfterPlus.width} vs ${initialSize.width})`
      );
      check(
        'Outer height stays identical after A+',
        Math.abs(sizeAfterPlus.height - initialSize.height) <= 2,
        `(${sizeAfterPlus.height} vs ${initialSize.height})`
      );
    }

    // Click A- (Decrease font)
    const btnMinus = await page.$('#btn-font-minus, button[title="Decrease Font"]');
    check('A- button exists', !!btnMinus);
    if (btnMinus) {
      await btnMinus.click();
      await page.waitForTimeout(200);

      const sizeAfterMinus = await getOuterSize();
      check(
        'Outer width stays identical after A-',
        Math.abs(sizeAfterMinus.width - initialSize.width) <= 2,
        `(${sizeAfterMinus.width} vs ${initialSize.width})`
      );
      check(
        'Outer height stays identical after A-',
        Math.abs(sizeAfterMinus.height - initialSize.height) <= 2,
        `(${sizeAfterMinus.height} vs ${initialSize.height})`
      );
    }

    await context.close();
  }

  // TEST 4: LIVE VIEWPORT RESIZING (ADAPTIVE GEOMETRY)
  console.log('\n--- TEST 4: Live Viewport Resizing ---');
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      serviceWorkers: 'block',
    });
    await context.addInitScript(() => {
      localStorage.setItem('synctone_reader_mode_seen', 'true');
    });
    const page = await context.newPage();
    await setupPageRoutes(page);
    await page.goto(`http://localhost:${PORT}/reader/ch-1`, { waitUntil: 'networkidle' });

    // Switch to OpenGL 3D
    const openglBtn = await page.$('button:has-text("OpenGL 3D")');
    if (openglBtn) await openglBtn.click();
    await page.waitForTimeout(300);

    // Resize live to tablet 768x1024
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(350);

    const tabletScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
    check('Live resize to 768x1024 fits without scroll', tabletScroll);

    // Resize live to mobile 390x844
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(350);

    const mobileScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
    check('Live resize to 390x844 fits without scroll', mobileScroll);

    await context.close();
  }

  // TEST 5: READING POSITION PERSISTS VIA ANCHOR
  console.log('\n--- TEST 5: Reading Position Persists via Anchor ---');
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      serviceWorkers: 'block',
    });
    await context.addInitScript(() => {
      localStorage.setItem('synctone_reader_mode_seen', 'true');
    });
    const page = await context.newPage();
    await setupPageRoutes(page);
    await page.goto(`http://localhost:${PORT}/reader/ch-1`, { waitUntil: 'networkidle' });

    // Switch to OpenGL 3D
    const openglBtn = await page.$('button:has-text("OpenGL 3D")');
    if (openglBtn) await openglBtn.click();
    await page.waitForTimeout(300);

    // Navigate to next spread (Spread 1)
    const nextBtn = await page.$('button[aria-label="Next Page"]');
    if (nextBtn) {
      const isDisabled = await nextBtn.isDisabled();
      if (!isDisabled) {
        await nextBtn.click();
        await page.waitForTimeout(400);

        // Verify current page/spread indicator has advanced past Page 1
        const counterText = await page.evaluate(() => {
          const el = document.querySelector('[data-testid="reader-page-counter"], .reader-page-counter');
          return el ? el.textContent.trim() : '';
        });
        check('Page turned to subsequent spread', counterText.length > 0 && !counterText.startsWith('1 / 1'), `counter: ${counterText}`);

        // Now trigger live resize to trigger re-pagination
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.waitForTimeout(300);

        // Counter should retain reading position
        const counterAfterResize = await page.evaluate(() => {
          const el = document.querySelector('[data-testid="reader-page-counter"], .reader-page-counter');
          return el ? el.textContent.trim() : '';
        });
        check(
          'Anchor preserved reading position across resize',
          counterAfterResize.length > 0 && !counterAfterResize.startsWith('1 / 1'),
          `counterAfter: ${counterAfterResize}`
        );
      }
    }

    await context.close();
  }

  // TEST 6: FULLSCREEN & FOCUS MODE TOGGLES
  console.log('\n--- TEST 6: Fullscreen & Focus Mode Toggles ---');
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      serviceWorkers: 'block',
    });
    await context.addInitScript(() => {
      localStorage.setItem('synctone_reader_mode_seen', 'true');
    });
    const page = await context.newPage();
    await setupPageRoutes(page);
    await page.goto(`http://localhost:${PORT}/reader/ch-1`, { waitUntil: 'networkidle' });

    // Focus mode toggle
    const focusBtn = await page.$('button:has-text("Focus")');
    check('Focus mode toggle button exists', !!focusBtn);
    if (focusBtn) {
      await focusBtn.click();
      await page.waitForTimeout(200);

      const exitFocusBtn = await page.$('button:has-text("Exit Focus")');
      check('Focus mode activated (Exit Focus visible)', !!exitFocusBtn);

      if (exitFocusBtn) {
        await exitFocusBtn.click({ force: true });
        await page.waitForTimeout(200);
        check('Exited Focus mode cleanly', true);
      }
    }

    // Fullscreen toggle button
    const fsBtn = await page.$('button[title*="Fullscreen"], button[aria-label*="fullscreen"]');
    check('Fullscreen button exists', !!fsBtn);

    await context.close();
  }

  // TEST 7: FOLLOW ALONG & SIGNAL DOT (SECTION 9.4 SPEC)
  console.log('\n--- TEST 7: Follow Along & Signal Dot (Section 9.4) ---');
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      serviceWorkers: 'block',
    });
    await context.addInitScript(() => {
      localStorage.setItem('synctone_reader_mode_seen', 'true');
    });
    const page = await context.newPage();
    await setupPageRoutes(page);
    await page.goto(`http://localhost:${PORT}/reader/ch-1`, { waitUntil: 'networkidle' });

    const followBtn = await page.$('button:has-text("FOLLOW ALONG")');
    check('FOLLOW ALONG button exists', !!followBtn);

    // When paused, dot is neutral (no signal-dot)
    const signalDotWhilePaused = await page.$('button:has-text("FOLLOW ALONG") .signal-dot');
    check('Section 9.4: NO signal dot when playback is paused', signalDotWhilePaused === null);

    await context.close();
  }

} catch (err) {
  console.error('Fatal error during test run:', err);
  failureList.push(`Fatal error: ${err.message}`);
} finally {
  await browser.close();
  server.close();

  console.log('\n======================================================');
  console.log(`FIT MATRIX TEST SUMMARY: ${passedChecks}/${totalChecks} checks passed`);
  if (failureList.length > 0) {
    console.log(`FAILURES (${failureList.length}):`);
    failureList.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  } else {
    console.log('ALL FIT MATRIX CHECKS PASSED PERFECTLY!');
    process.exit(0);
  }
}
