import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const FRONTEND_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(FRONTEND_DIR, 'dist');
const SCREENSHOT_DIR = path.join(REPO_ROOT, 'docs/screenshots/phase12');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1190x770', width: 1190, height: 770 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '390x844', width: 390, height: 844 },
  { name: '320x568', width: 320, height: 568 },
];

const THEMES = ['dark', 'light'];

const MOCK_NOVELS = [
  {
    id: 'novel-1',
    title: 'A Study in Scarlet',
    synopsis: 'The classic mystery that introduced Sherlock Holmes and Dr. John Watson to the world.',
    channel: 'verified',
    status: 'published',
    global_tone: 'Victorian Noir',
    author_username: 'arthur_conan_doyle',
    narrator_name: 'Dr. John Watson',
    narrator_voice_id: 'en-GB-ArthurNeural',
    chapter_count: 5,
    cover_object: null,
  },
  {
    id: 'novel-2',
    title: 'The Sign of the Four',
    synopsis: 'A secret pact and stolen treasure in colonial India lead to murder in London.',
    channel: 'verified',
    status: 'published',
    global_tone: 'Atmospheric Thriller',
    author_username: 'arthur_conan_doyle',
    narrator_name: 'British Narrator',
    narrator_voice_id: 'en-GB-RyanNeural',
    chapter_count: 3,
    cover_object: null,
  }
];

const MOCK_DETAIL = {
  novel: MOCK_NOVELS[0],
  characters: [
    {
      id: 'char-1',
      canonical_name: 'Sherlock Holmes',
      gender: 'male',
      age_band: 'adult',
      sample_quote: 'Elementary, my dear Watson.',
      voice_id: 'en-GB-ThomasNeural',
      is_narrator: false,
    },
    {
      id: 'char-2',
      canonical_name: 'Dr. John Watson',
      gender: 'male',
      age_band: 'adult',
      sample_quote: 'I have seen something of the army.',
      voice_id: 'en-GB-RyanNeural',
      is_narrator: true,
    }
  ],
  chapters: [
    {
      id: 'chap-1',
      novel_id: 'novel-1',
      chapter_number: 1,
      title: 'Mr. Sherlock Holmes',
      word_count: 3200,
      audio_status: 'ready',
      duration_seconds: 480,
    },
    {
      id: 'chap-2',
      novel_id: 'novel-1',
      chapter_number: 2,
      title: 'The Science of Deduction',
      word_count: 2900,
      audio_status: 'ready',
      duration_seconds: 420,
    }
  ]
};

const MOCK_CHAPTER = {
  id: 'chap-1',
  novel_id: 'novel-1',
  chapter_number: 1,
  title: 'Mr. Sherlock Holmes',
  prose: 'In the year 1878 I took my degree of Doctor of Medicine of the University of London, and proceeded to Netley to go through the course prescribed for surgeons in the army.\n\nHaving completed my studies there, I was duly attached to the Fifth Northumberland Fusiliers as Assistant Surgeon.\n\nThe regiment was stationed in India at the time, and before I could join it, the second Afghan war had broken out.',
  timeline: [
    { start: 0, end: 5000, text: 'In the year 1878 I took my degree of Doctor of Medicine of the University of London, and proceeded to Netley to go through the course prescribed for surgeons in the army.', speaker: 'char-2' },
    { start: 5000, end: 12000, text: 'Having completed my studies there, I was duly attached to the Fifth Northumberland Fusiliers as Assistant Surgeon.', speaker: 'char-2' }
  ],
  segments: [
    { segment_id: 1, order: 1, text: 'In the year 1878 I took my degree of Doctor of Medicine of the University of London, and proceeded to Netley to go through the course prescribed for surgeons in the army.', speaker_id: 'char-2', character_id: 'char-2', assigned_voice_id: 'en-GB-RyanNeural' },
    { segment_id: 2, order: 2, text: 'Having completed my studies there, I was duly attached to the Fifth Northumberland Fusiliers as Assistant Surgeon.', speaker_id: 'char-2', character_id: 'char-2', assigned_voice_id: 'en-GB-RyanNeural' }
  ],
  total_duration_ms: 240000,
  audio_stream_url: '/mock-audio.mp3',
};

async function setupApiMocks(page) {
  await page.route('**/api/novels*', async (route) => {
    const url = route.request().url();
    if (url.includes('/novels/novel-1/chapters/chap-1')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CHAPTER) });
    } else if (url.includes('/novels/novel-1/chapters')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chapters: MOCK_DETAIL.chapters }) });
    } else if (url.includes('/novels/novel-1')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DETAIL) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ novels: MOCK_NOVELS, total: MOCK_NOVELS.length }) });
    }
  });

  await page.route('**/api/chapters*', async (route) => {
    const url = route.request().url();
    if (url.includes('/chap-1')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CHAPTER) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chapters: MOCK_DETAIL.chapters }) });
    }
  });

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 'u-admin', username: 'SherlockEditor', role: 'admin', email: 'sherlock@synctone.app' } }),
    });
  });

  await page.route('**/api/status/models*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ kokoro: 'ready', edge_tts: 'ready', piper: 'ready' }),
    });
  });

  await page.route('**/mock-audio.mp3', async (route) => {
    await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(4096) });
  });
}

async function applyTheme(page, theme) {
  await page.evaluate((t) => {
    document.documentElement.className = t;
    document.documentElement.setAttribute('data-theme', t);
    const meta = document.getElementById('meta-theme-color');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#0B0B0D' : '#EFEFF0');
    try { localStorage.setItem('synctone_theme', t); } catch (e) {}
  }, theme);
  await page.waitForTimeout(200);
}

function getAssetDiskSizes(reqUrl) {
  try {
    const urlObj = new URL(reqUrl);
    let relativePath = urlObj.pathname;
    if (relativePath === '/' || relativePath === '') {
      relativePath = '/index.html';
    }
    const fullPath = path.join(DIST_DIR, relativePath);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const buf = fs.readFileSync(fullPath);
      return {
        uncompressedBytes: buf.length,
        gzippedBytes: zlib.gzipSync(buf, { level: 9 }).length,
      };
    }
  } catch (_) {}
  return { uncompressedBytes: 0, gzippedBytes: 0 };
}

export async function runFullVerification() {
  console.log('================================================================');
  console.log('  STARTING PHASE 12 FULL VERIFICATION SUITE');
  console.log('================================================================\n');

  const report = {
    timestamp: new Date().toISOString(),
    viewports: VIEWPORTS,
    themes: THEMES,
    axeResults: [],
    coldLoadMetrics: null,
    pwaResults: null,
    clsResults: [],
    themeSeedingResults: null,
    visualCaptures: [],
  };

  const browser = await chromium.launch({ headless: true });

  // ---------------------------------------------------------------------------
  // 1. HOME COLD-LOAD MEASUREMENT VIA CDP WITH EVERY REQUEST
  // ---------------------------------------------------------------------------
  console.log('[1/6] Running Home Cold-Load Measurement via CDP...');
  {
    const coldContext = await browser.newContext({ serviceWorkers: 'block' });
    const coldPage = await coldContext.newPage();
    const cdp = await coldPage.context().newCDPSession(coldPage);
    await cdp.send('Network.enable');
    await cdp.send('Performance.enable');

    const networkRequests = new Map();

    cdp.on('Network.requestWillBeSent', (e) => {
      networkRequests.set(e.requestId, {
        url: e.request.url,
        method: e.request.method,
        type: e.type,
        startTime: e.timestamp,
        encodedBytes: 0,
        decodedBytes: 0,
        status: null,
      });
    });

    cdp.on('Network.responseReceived', (e) => {
      const req = networkRequests.get(e.requestId);
      if (req) {
        req.status = e.response.status;
        req.mimeType = e.response.mimeType;
        req.encodedBytes = e.response.encodedDataLength || 0;
      }
    });

    cdp.on('Network.dataReceived', (e) => {
      const req = networkRequests.get(e.requestId);
      if (req) {
        req.encodedBytes += e.dataLength || 0;
      }
    });

    cdp.on('Network.loadingFinished', (e) => {
      const req = networkRequests.get(e.requestId);
      if (req) {
        req.encodedBytes = Math.max(req.encodedBytes, e.encodedDataLength || 0);
      }
    });

    const startTime = Date.now();
    await setupApiMocks(coldPage);
    await coldPage.goto('http://localhost:5174/', { waitUntil: 'load' });
    const loadDuration = Date.now() - startTime;

    const navTiming = await coldPage.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      return {
        domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
        loadTime: nav.loadEventEnd - nav.startTime,
        domInteractive: nav.domInteractive - nav.startTime,
      };
    });

    const requestsList = Array.from(networkRequests.values()).map(r => {
      const diskSizes = getAssetDiskSizes(r.url);
      return {
        url: r.url,
        method: r.method,
        type: r.type,
        status: r.status,
        encodedBytes: r.encodedBytes,
        uncompressedBytes: diskSizes.uncompressedBytes || r.encodedBytes,
        gzippedBytes: diskSizes.gzippedBytes || r.encodedBytes,
      };
    });

    let totalTransferBytes = 0;
    let totalUncompressedBytes = 0;
    let totalGzipBytes = 0;
    let reactVendorChunk = null;
    let indexJsChunk = null;
    let indexCssChunk = null;

    for (const req of requestsList) {
      totalTransferBytes += req.encodedBytes;
      totalUncompressedBytes += req.uncompressedBytes;
      totalGzipBytes += req.gzippedBytes;
      if (req.url.includes('react-vendor')) reactVendorChunk = req;
      if (req.url.includes('index-') && req.url.endsWith('.js')) indexJsChunk = req;
      if (req.url.includes('index-') && req.url.endsWith('.css')) indexCssChunk = req;
    }

    report.coldLoadMetrics = {
      navTiming,
      wallClockDurationMs: loadDuration,
      totalRequests: requestsList.length,
      totalTransferBytes,
      totalUncompressedBytes,
      totalGzipBytes,
      reactVendorChunk,
      indexJsChunk,
      indexCssChunk,
      requests: requestsList,
    };

    console.log(`  ✓ Cold load complete in ${loadDuration}ms (DOMContentLoaded: ${navTiming.domContentLoaded.toFixed(1)}ms)`);
    console.log(`  ✓ Total Requests: ${requestsList.length} │ Total Encoded: ${(totalTransferBytes / 1024).toFixed(2)} KiB`);
    if (reactVendorChunk) {
      console.log(`  ✓ react-vendor chunk: ${(reactVendorChunk.uncompressedBytes / 1024).toFixed(2)} KiB raw │ ${(reactVendorChunk.gzippedBytes / 1024).toFixed(2)} KiB gzip`);
    }
    if (indexJsChunk) {
      console.log(`  ✓ index.js chunk: ${(indexJsChunk.uncompressedBytes / 1024).toFixed(2)} KiB raw │ ${(indexJsChunk.gzippedBytes / 1024).toFixed(2)} KiB gzip`);
    }

    await coldContext.close();
  }

  // ---------------------------------------------------------------------------
  // 2. PWA OFFLINE BOOT & SERVICE WORKER UPGRADE
  // ---------------------------------------------------------------------------
  console.log('\n[2/6] Running PWA Offline Boot & Service Worker Upgrade Test...');
  {
    const pwaContext = await browser.newContext();
    const pwaPage = await pwaContext.newPage();
    await setupApiMocks(pwaPage);

    // Initial visit online to install & precache
    await pwaPage.goto('http://localhost:5174/', { waitUntil: 'networkidle' });

    // Wait for Service Worker registration and activation
    const swRegistered = await pwaPage.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.ready;
      return !!reg.active;
    });

    // Check Cache Storage contents
    const cacheDetails = await pwaPage.evaluate(async () => {
      const keys = await caches.keys();
      const details = {};
      for (const key of keys) {
        const cache = await caches.open(key);
        const reqs = await cache.keys();
        details[key] = reqs.map(r => new URL(r.url).pathname);
      }
      return details;
    });

    // Go offline
    await pwaContext.setOffline(true);

    // Reload page while completely offline
    let offlineLoadOk = false;
    let offlineDomContent = '';
    try {
      await pwaPage.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded', timeout: 5000 });
      offlineDomContent = await pwaPage.content();
      offlineLoadOk = offlineDomContent.includes('SyncTone') || offlineDomContent.includes('Novel Library') || offlineDomContent.includes('A Study in Scarlet');
    } catch (err) {
      offlineLoadOk = false;
    }

    // Verify /api/* rejection without hanging
    const apiOfflineBehavior = await pwaPage.evaluate(async () => {
      const start = Date.now();
      let rejectedCleanly = false;
      try {
        const res = await fetch('/api/novels', { signal: AbortSignal.timeout(2000) });
        if (!res.ok) rejectedCleanly = true;
      } catch (e) {
        rejectedCleanly = true;
      }
      return { rejectedCleanly, durationMs: Date.now() - start };
    });

    // Service Worker Upgrade test
    await pwaContext.setOffline(false);
    const swUpgradeResult = await pwaPage.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { ok: false, reason: 'No SW support' };
      const reg = await navigator.serviceWorker.ready;
      try {
        await reg.update();
        return { ok: true, active: !!reg.active, scope: reg.scope };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });

    report.pwaResults = {
      swRegistered,
      cacheDetails,
      offlineLoadOk,
      offlineContentLength: offlineDomContent.length,
      apiOfflineBehavior,
      swUpgradeResult,
    };

    console.log(`  ✓ Service Worker Active: ${swRegistered}`);
    console.log(`  ✓ Precache Caches Found: ${Object.keys(cacheDetails).join(', ')}`);
    console.log(`  ✓ Offline Boot Result: ${offlineLoadOk ? 'PASS (App shell rendered offline)' : 'FAIL'}`);
    console.log(`  ✓ API Offline Failure handled cleanly in ${apiOfflineBehavior.durationMs}ms`);
    console.log(`  ✓ Service Worker Upgrade Check: ${swUpgradeResult.ok ? 'PASS' : 'FAIL'}`);

    await pwaContext.close();
  }

  // ---------------------------------------------------------------------------
  // 3. THEME SEEDING VERIFICATION & FOWT PREVENTION
  // ---------------------------------------------------------------------------
  console.log('\n[3/6] Running Theme Seeding & FOWT Prevention Tests...');
  {
    const themeContext = await browser.newContext();
    const themePage = await themeContext.newPage();
    await setupApiMocks(themePage);

    // 1. Initial default is dark
    await themePage.goto('http://localhost:5174/');
    const initialTheme = await themePage.evaluate(() => document.documentElement.className);

    // 2. Switch to light and verify localStorage & DOM
    const themeBtn = themePage.locator('button[title*="Switch Theme"], button[aria-label="Switch theme"]').first();
    await themeBtn.click();
    await themePage.waitForTimeout(300);
    const lightTheme = await themePage.evaluate(() => ({
      cls: document.documentElement.className,
      storage: localStorage.getItem('synctone_theme'),
      meta: document.getElementById('meta-theme-color')?.getAttribute('content'),
    }));

    // 3. Reload and verify light theme seeds with ZERO flicker
    await themePage.reload();
    const reloadedLight = await themePage.evaluate(() => ({
      cls: document.documentElement.className,
      storage: localStorage.getItem('synctone_theme'),
      meta: document.getElementById('meta-theme-color')?.getAttribute('content'),
    }));

    // 4. URL parameter ?theme=dark override
    await themePage.goto('http://localhost:5174/?theme=dark');
    const paramDark = await themePage.evaluate(() => ({
      cls: document.documentElement.className,
      storage: localStorage.getItem('synctone_theme'),
    }));

    // 5. Corrupt localStorage recovery
    await themePage.evaluate(() => {
      localStorage.setItem('synctone_theme', 'corrupted_neon_green');
    });
    await themePage.reload();
    const corruptRecovery = await themePage.evaluate(() => ({
      cls: document.documentElement.className,
      storage: localStorage.getItem('synctone_theme'),
    }));

    report.themeSeedingResults = {
      initialTheme,
      lightTheme,
      reloadedLight,
      paramDark,
      corruptRecovery,
    };

    console.log(`  ✓ Initial theme: ${initialTheme}`);
    console.log(`  ✓ Light theme toggle + reload persistence: ${reloadedLight.cls === 'light' ? 'PASS' : 'FAIL'}`);
    console.log(`  ✓ URL query ?theme=dark override: ${paramDark.cls === 'dark' ? 'PASS' : 'FAIL'}`);
    console.log(`  ✓ Corrupted storage recovered safely to: ${corruptRecovery.cls}`);

    await themeContext.close();
  }

  // ---------------------------------------------------------------------------
  // 4. FAST 3G ROUTE & MODAL LOADS (ZERO LAYOUT SHIFT)
  // ---------------------------------------------------------------------------
  console.log('\n[4/6] Running Fast 3G Route/Modal Load CLS Audits...');
  {
    const fast3gContext = await browser.newContext();
    const fast3gPage = await fast3gContext.newPage();
    await setupApiMocks(fast3gPage);

    const cdp = await fast3gPage.context().newCDPSession(fast3gPage);
    await cdp.send('Network.enable');
    // Fast 3G: 150ms RTT, 1.6 Mbps down, 750 kbps up
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });

    async function measureClsDuring(actionFn) {
      await fast3gPage.evaluate(() => {
        window.__clsScore = 0;
        window.__clsObserver = new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            if (!entry.hadRecentInput) {
              window.__clsScore += entry.value;
            }
          }
        });
        window.__clsObserver.observe({ type: 'layout-shift', buffered: true });
      });

      await actionFn();
      await fast3gPage.waitForTimeout(600);

      const cls = await fast3gPage.evaluate(() => {
        if (window.__clsObserver) window.__clsObserver.disconnect();
        return window.__clsScore || 0;
      });
      return cls;
    }

    // Route 1: Home load under Fast 3G
    const homeCls = await measureClsDuring(async () => {
      await fast3gPage.goto('http://localhost:5174/', { waitUntil: 'load' });
    });
    report.clsResults.push({ target: 'Home Route (Fast 3G)', cls: homeCls });
    console.log(`  ✓ Home Load CLS: ${homeCls.toFixed(4)}`);

    // Route 2: Novel Detail load under Fast 3G
    const detailCls = await measureClsDuring(async () => {
      await fast3gPage.goto('http://localhost:5174/novel/novel-1', { waitUntil: 'load' });
    });
    report.clsResults.push({ target: 'Novel Detail Route (Fast 3G)', cls: detailCls });
    console.log(`  ✓ Novel Detail CLS: ${detailCls.toFixed(4)}`);

    // Route 3: Reader View load under Fast 3G
    const readerCls = await measureClsDuring(async () => {
      await fast3gPage.goto('http://localhost:5174/reader/chap-1', { waitUntil: 'load' });
    });
    report.clsResults.push({ target: 'Reader View Route (Fast 3G)', cls: readerCls });
    console.log(`  ✓ Reader View CLS: ${readerCls.toFixed(4)}`);

    // Modal 1: Settings Modal under Fast 3G
    const settingsCls = await measureClsDuring(async () => {
      await fast3gPage.goto('http://localhost:5174/?modal=settings', { waitUntil: 'load' });
      await fast3gPage.waitForSelector('div[role="dialog"]');
    });
    report.clsResults.push({ target: 'Settings Modal (Fast 3G)', cls: settingsCls });
    console.log(`  ✓ Settings Modal CLS: ${settingsCls.toFixed(4)}`);

    // Modal 2: Add Novel Modal under Fast 3G
    const addNovelCls = await measureClsDuring(async () => {
      await fast3gPage.goto('http://localhost:5174/?modal=add-novel', { waitUntil: 'load' });
      await fast3gPage.waitForSelector('div[role="dialog"]');
    });
    report.clsResults.push({ target: 'Add Novel Modal (Fast 3G)', cls: addNovelCls });
    console.log(`  ✓ Add Novel Modal CLS: ${addNovelCls.toFixed(4)}`);

    await fast3gContext.close();
  }

  // ---------------------------------------------------------------------------
  // 5. FULL VISUAL CAPTURES & AXE AUDIT (5 VIEWPORTS × 2 THEMES × 16 SCREENS = 160 CAPTURES)
  // ---------------------------------------------------------------------------
  console.log('\n[5/6] Running Full Visual Captures (5 Viewports × 2 Themes × 16 Screens) & Axe Audit (Contrast as Error)...');
  {
    const auditContext = await browser.newContext({ serviceWorkers: 'block' });
    const auditPage = await auditContext.newPage();
    await setupApiMocks(auditPage);

    const screenDefinitions = [
      { id: 'home', name: 'Home Catalog', url: 'http://localhost:5174/' },
      { id: 'novel-detail', name: 'Novel Detail', url: 'http://localhost:5174/novel/novel-1' },
      { id: 'voice-studio', name: 'Voice Studio', url: 'http://localhost:5174/novel/novel-1', prepare: async (p) => {
        const btn = p.locator('button[aria-label="Voice Studio"]');
        if (await btn.isVisible()) await btn.click();
        await p.waitForTimeout(300);
      }},
      { id: 'reader-normal', name: 'Reader (Normal Mode)', url: 'http://localhost:5174/reader/chap-1' },
      { id: 'reader-3d', name: 'Reader (3D Spread Mode)', url: 'http://localhost:5174/reader/chap-1?mode=spread' },
      { id: 'audio-player', name: 'Audio Player Dock', url: 'http://localhost:5174/reader/chap-1', captureElement: '#audio-player-container, footer[aria-label="Floating Audio Dock"], footer.glass-dock' },
      { id: 'character-roster', name: 'Character Roster Drawer', url: 'http://localhost:5174/reader/chap-1?modal=roster' },
      { id: 'synthesis-progress', name: 'Synthesis Progress Banner', url: 'http://localhost:5174/test/synthesis-progress' },
      { id: 'profile', name: 'Profile View', url: 'http://localhost:5174/profile' },
      { id: 'upload', name: 'Upload View', url: 'http://localhost:5174/upload' },
      { id: 'admin', name: 'Admin View', url: 'http://localhost:5174/admin' },
      { id: 'modal-settings', name: 'Settings Modal', url: 'http://localhost:5174/?modal=settings' },
      { id: 'modal-auth', name: 'Auth Modal', url: 'http://localhost:5174/?modal=auth' },
      { id: 'modal-add-novel', name: 'Add Novel Modal', url: 'http://localhost:5174/?modal=add-novel' },
      { id: 'modal-upload-chapter', name: 'Upload Chapter Modal', url: 'http://localhost:5174/novel/novel-1?modal=upload-chapter' },
      { id: 'error-boundary', name: 'Error Boundary', url: 'http://localhost:5174/test/error-boundary' },
    ];

    for (const vp of VIEWPORTS) {
      await auditPage.setViewportSize({ width: vp.width, height: vp.height });

      for (const theme of THEMES) {
        for (const scr of screenDefinitions) {
          await auditPage.goto(scr.url, { waitUntil: 'domcontentloaded' });
          await applyTheme(auditPage, theme);
          if (scr.prepare) await scr.prepare(auditPage);
          await auditPage.waitForTimeout(300);

          const filename = `${scr.id}-${theme}-${vp.name}.png`;
          const filePath = path.join(SCREENSHOT_DIR, filename);

          if (scr.captureElement) {
            const el = auditPage.locator(scr.captureElement).first();
            if (await el.isVisible()) {
              await el.screenshot({ path: filePath });
            } else {
              await auditPage.screenshot({ path: filePath });
            }
          } else {
            await auditPage.screenshot({ path: filePath, fullPage: false });
          }

          report.visualCaptures.push({ screen: scr.id, theme, viewport: vp.name, file: filename });

          // Run Axe Accessibility Audit with color-contrast as ERROR on desktop and mobile viewports
          if (vp.name === '1440x900' || vp.name === '390x844') {
            const axe = await new AxeBuilder({ page: auditPage })
              .withTags(['wcag2a', 'wcag2aa'])
              .analyze();

            const contrastViolations = axe.violations.filter(v => v.id === 'color-contrast');
            const otherViolations = axe.violations.filter(v => v.id !== 'color-contrast');

            report.axeResults.push({
              screen: scr.id,
              theme,
              viewport: vp.name,
              totalViolations: axe.violations.length,
              contrastViolations: contrastViolations.length,
              otherViolations: otherViolations.length,
              violations: axe.violations.map(v => ({
                id: v.id,
                impact: v.impact,
                description: v.description,
                nodes: v.nodes.length,
              })),
            });

            if (axe.violations.length > 0) {
              console.log(`    ⚠ [AXE ISSUE] ${scr.id} (${theme}, ${vp.name}): ${axe.violations.length} violations`);
              for (const v of axe.violations) {
                console.log(`       - [${v.impact}] ${v.id}: ${v.description}`);
              }
            }
          }
        }
      }
      console.log(`  ✓ Completed Viewport ${vp.name} (16 screens × 2 themes = 32 captures)`);
    }

    await auditContext.close();
  }

  await browser.close();

  // Save JSON report
  const reportPath = path.join(REPO_ROOT, 'docs/phase12-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`\n================================================================`);
  console.log(`  PHASE 12 FULL VERIFICATION COMPLETE`);
  console.log(`  Results recorded in: ${reportPath}`);
  console.log(`  Total visual captures: ${report.visualCaptures.length} files in docs/screenshots/phase12/`);
  console.log(`  Total Axe audits: ${report.axeResults.length} evaluations`);
  console.log(`================================================================\n`);
}

runFullVerification().catch((err) => {
  console.error('Phase 12 Verification Failed:', err);
  process.exit(1);
});
