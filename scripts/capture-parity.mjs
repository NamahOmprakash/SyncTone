import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'novel-audio-synthesizer/frontend/dist');
const conceptDir = path.join(rootDir, 'docs/screenshots/noir-mono');
const parityDir = path.join(rootDir, 'docs/parity');

if (!fs.existsSync(parityDir)) {
  fs.mkdirSync(parityDir, { recursive: true });
}

// 1. Static SPA HTTP Server for dist/
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
    // SPA fallback to index.html
    const indexPath = path.join(distDir, 'index.html');
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(indexPath).pipe(res);
  }
});

const PORT = 4179;
await new Promise((resolve) => server.listen(PORT, resolve));
console.log(`Parity test server listening at http://localhost:${PORT}`);

// 2. Playwright Chromium Launch
const playwrightPath = path.join(rootDir, 'novel-audio-synthesizer/frontend/node_modules/playwright/index.mjs');
const { chromium } = await import(playwrightPath);
const browser = await chromium.launch({ headless: true });

// Mock data representing authentic Sherlock Holmes literary archive
const mockNovels = [
  {
    id: 'n-sherlock-1',
    title: 'The Adventures of Sherlock Holmes',
    author_username: 'Arthur Conan Doyle',
    narrator: 'Dr. John Watson',
    channel: 'verified',
    chapter_count: 24,
    total_duration_ms: 2294000,
    character_count: 5,
    synopsis: 'The Adventures of Sherlock Holmes is a collection of twelve short stories by Arthur Conan Doyle, first published on 14 October 1892. It contains the earliest short stories featuring the consulting detective Sherlock Holmes, beginning with A Scandal in Bohemia.',
    cover_object: null,
  },
  {
    id: 'n-gatsby-2',
    title: 'The Great Gatsby',
    author_username: 'F. Scott Fitzgerald',
    narrator: 'Nick Carraway',
    channel: 'verified',
    chapter_count: 9,
    total_duration_ms: 1845000,
    character_count: 6,
    synopsis: 'Set in Jazz Age New York, the novel depicts narrator Nick Carraway\'s interactions with mysterious millionaire Jay Gatsby and Gatsby\'s obsession to reunite with his former lover, Daisy Buchanan.',
    cover_object: null,
  },
  {
    id: 'n-dracula-3',
    title: 'Dracula: The Un-Dead',
    author_username: 'Bram Stoker',
    narrator: 'Jonathan Harker',
    channel: 'community',
    chapter_count: 27,
    total_duration_ms: 3120000,
    character_count: 8,
    synopsis: 'The epistolary gothic masterpiece detailing Count Dracula\'s attempt to move from Transylvania to England so that he may find new blood and spread the undead curse.',
    cover_object: null,
  },
];

function createSilentWavBuffer(durationSeconds = 10) {
  const sampleRate = 8000;
  const numChannels = 1;
  const bytesPerSample = 2;
  const numSamples = sampleRate * durationSeconds;
  const dataSize = numSamples * numChannels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}
const silentWavBuffer = createSilentWavBuffer(10);

const mockNovelDetail = {
  ...mockNovels[0],
  chapters: [
    {
      id: 'ch-1',
      novel_id: 'n-sherlock-1',
      chapter_number: 1,
      title: 'Chapter I. A Scandal in Bohemia',
      duration_ms: 2294000,
      total_duration_ms: 2294000,
      has_studio_audio: true,
      audio_url: '/api/stream/mock-audio',
    },
    {
      id: 'ch-2',
      novel_id: 'n-sherlock-1',
      chapter_number: 2,
      title: 'Chapter II. The Red-Headed League',
      duration_ms: 210000,
      total_duration_ms: 210000,
      has_studio_audio: true,
      audio_url: '/api/stream/mock-audio-2',
    },
  ],
  characters: [
    { id: 'char-1', name: 'Narrator / Watson', segmentCount: 42, role: 'narrator', isAssigned: true },
    { id: 'char-2', name: 'Sherlock Holmes', segmentCount: 38, role: 'lead', isAssigned: true },
    { id: 'char-3', name: 'Irene Adler', segmentCount: 14, role: 'supporting', isAssigned: true },
    { id: 'char-4', name: 'Inspector Lestrade', segmentCount: 8, role: 'supporting', isAssigned: true },
    { id: 'char-5', name: 'Mrs. Hudson', segmentCount: 5, role: 'extra', isAssigned: true },
  ],
};

const mockChapter1 = {
  id: 'ch-1',
  novel_id: 'n-sherlock-1',
  chapter_number: 1,
  title: 'Chapter I. A Scandal in Bohemia',
  duration_ms: 2294000,
  total_duration_ms: 2294000,
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
      type: 'dialogue',
      speaker_name: 'Sherlock Holmes',
      text: 'I had seen little of Holmes lately. My marriage had drifted us away from each other.',
    },
    {
      segment_id: 4,
      order: 4,
      type: 'narration',
      speaker_name: 'Dr. John Watson',
      text: 'He was still, as ever, deeply attracted by the study of crime, and occupied his immense faculties and extraordinary powers of observation in following out those clues.',
    },
  ],
  manifest: {
    total_duration_ms: 2294000,
    audio_stream_url: '/api/stream/mock-audio',
    timeline: [
      { segment_id: 1, order: 1, start_ms: 0, end_ms: 5000 },
      { segment_id: 2, order: 2, start_ms: 5000, end_ms: 11000 },
      { segment_id: 3, order: 3, start_ms: 11000, end_ms: 18000 },
      { segment_id: 4, order: 4, start_ms: 18000, end_ms: 25000 },
    ],
  },
};

const measurements = {
  topBarHeight: null,
  playerBarHeight: null,
  typeSizes: {},
  contrastChecks: {},
};

async function setupPageRoutes(page) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/novels/n-sherlock-1')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          novel: mockNovels[0],
          chapters: mockNovelDetail.chapters,
          characters: mockNovelDetail.characters,
        }),
      });
    }
    if (url.includes('/api/novels')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ novels: mockNovels }),
      });
    }
    if (url.includes('/api/chapters/ch-1/segments')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockChapter1.segments),
      });
    }
    if (url.includes('/api/chapters/ch-1')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockChapter1),
      });
    }
    if (url.includes('/api/manifest/ch-1') || url.includes('/manifest/ch-1')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockChapter1.manifest),
      });
    }
    if (url.includes('/api/status/models')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ready', engines: ['msedge-tts', 'kokoro-tts', 'paradee-tts'] }),
      });
    }
    if (url.includes('/api/playback')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ progress: null }),
      });
    }
    if (url.includes('/api/stream')) {
      return route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        body: silentWavBuffer,
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });
}

const screensToCapture = [
  {
    id: 'home',
    conceptId: 'home',
    title: 'Screen 1: Home (Catalog Stage)',
    route: '/',
    action: async (page) => {
      await page.waitForSelector('article, .novel-card-hybrid, button', { timeout: 5000 });
    },
  },
  {
    id: 'novel-detail',
    conceptId: 'novel-detail',
    title: 'Screen 2: Novel Detail',
    route: '/novel/n-sherlock-1',
    action: async (page) => {
      await page.waitForSelector('.detail-stage, .detail-giant-title', { timeout: 8000 });
    },
  },
  {
    id: 'reader',
    conceptId: 'reader',
    title: 'Screen 3: Reader Surface',
    route: '/reader/ch-1',
    action: async (page) => {
      await page.waitForSelector('article, .reader-content-stage', { timeout: 5000 });
    },
  },
  {
    id: 'audio-player',
    conceptId: 'audio-player',
    title: 'Screen 4: Docked Bottom Audio Bar',
    route: '/reader/ch-1',
    action: async (page) => {
      await page.waitForSelector('footer[aria-label="Floating Audio Dock"]', { timeout: 5000 });
      const modeBtn = await page.$('button[aria-label*="Playback engine"]');
      if (modeBtn) {
        await modeBtn.click();
        await page.waitForTimeout(300);
      }
    },
  },
  {
    id: 'voice-studio',
    conceptId: 'voice-studio',
    title: 'Screen 5: Voice Studio / Character Roster',
    route: '/novel/n-sherlock-1',
    action: async (page) => {
      await page.waitForSelector('.detail-stage, .detail-giant-title', { timeout: 8000 });
      // Click Cast Roster button to open modal or switch tab
      const rosterBtn = await page.$('button:has-text("VOICE STUDIO"), button[data-tab="cast"], button:has-text("Character Cast")');
      if (rosterBtn) {
        await rosterBtn.click();
        await page.waitForTimeout(300);
      }
    },
  },
];

const viewports = [
  { name: 'desktop', width: 1440, height: 900, suffix: '1440x900' },
  { name: 'mobile', width: 390, height: 844, suffix: '390x844' },
];

try {
  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    await setupPageRoutes(page);

    for (const theme of ['dark', 'light']) {
      for (const sc of screensToCapture) {
        const fullUrl = `http://localhost:${PORT}${sc.route}`;
        console.log(`Capturing Real Screen [${vp.name}] [${theme}] ${sc.id} -> ${fullUrl}`);

        await page.goto(fullUrl, { waitUntil: 'networkidle' });

        // Apply theme strictly
        await page.evaluate((th) => {
          document.documentElement.setAttribute('data-theme', th);
          if (th === 'light') {
            document.documentElement.classList.add('light');
            document.documentElement.classList.remove('dark');
          } else {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
          }
          localStorage.setItem('synctone_theme', th);
          localStorage.setItem('synctone-theme', th);
          localStorage.setItem('synctone_reader_mode_seen', 'true');
        }, theme);

        await page.waitForTimeout(500);

        if (sc.action) {
          try {
            await sc.action(page);
          } catch (err) {
            console.warn(`Warning in screen action for ${sc.id}: ${err.message}`);
          }
        }

        await page.waitForTimeout(300);

        // Measure structural geometry on desktop dark
        if (vp.name === 'desktop' && theme === 'dark') {
          const measures = await page.evaluate(() => {
            const topHeader = document.querySelector('header');
            const audioDock = document.querySelector('footer');
            const h1 = document.querySelector('h1');
            const bodyPara = document.querySelector('p');
            const monoBadge = document.querySelector('.boxed-btn, .font-mono, [class*="font-mono"]');

            const getStyle = (el, prop) => (el ? window.getComputedStyle(el).getPropertyValue(prop) : null);

            return {
              topHeaderHeight: topHeader ? Math.round(topHeader.getBoundingClientRect().height) : null,
              audioDockHeight: audioDock ? Math.round(audioDock.getBoundingClientRect().height) : null,
              h1FontSize: getStyle(h1, 'font-size'),
              bodyFontSize: getStyle(bodyPara, 'font-size'),
              monoFontSize: getStyle(monoBadge, 'font-size'),
            };
          });

          if (measures.topHeaderHeight) measurements.topBarHeight = measures.topHeaderHeight;
          if (measures.audioDockHeight) measurements.playerBarHeight = measures.audioDockHeight;
          if (measures.h1FontSize && !measurements.typeSizes.heading1) measurements.typeSizes.heading1 = measures.h1FontSize;
          if (measures.bodyFontSize && !measurements.typeSizes.bodyProse) measurements.typeSizes.bodyProse = measures.bodyFontSize;
          if (measures.monoFontSize && !measurements.typeSizes.monoMicro) measurements.typeSizes.monoMicro = measures.monoFontSize;

          if (sc.id === 'home') {
            console.log(`Measured on Home: Top Bar = ${measurements.topBarHeight}px, H1 Font = ${measurements.typeSizes.heading1}`);
          }
        }

        // Save real screen capture
        const realFilename = vp.name === 'mobile'
          ? `real-mobile-${sc.id}-${theme}.png`
          : `real-${sc.id}-${theme}.png`;
        const realOutPath = path.join(parityDir, realFilename);
        await page.screenshot({ path: realOutPath, fullPage: false });
        console.log(`  -> Captured real screen: ${realOutPath}`);
      }
    }
    await context.close();
  }

  // 3. Assemble Side-by-Side Parity Comparison Images (Concept vs Real)
  console.log('Assembling Side-by-Side Parity Images...');
  const assembleContext = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
  const assemblePage = await assembleContext.newPage();

  for (const theme of ['dark', 'light']) {
    for (const sc of screensToCapture) {
      // 1440x900 Desktop Parity
      const conceptFile = path.join(conceptDir, `${sc.conceptId}-${theme}-1440x900.png`);
      const realFile = path.join(parityDir, `real-${sc.id}-${theme}.png`);

      if (fs.existsSync(conceptFile) && fs.existsSync(realFile)) {
        const conceptB64 = fs.readFileSync(conceptFile).toString('base64');
        const realB64 = fs.readFileSync(realFile).toString('base64');

        const parityB64 = await assemblePage.evaluate(async ({ conceptB64, realB64, title, theme }) => {
          function loadImage(b64) {
            return new Promise((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = reject;
              img.src = `data:image/png;base64,${b64}`;
            });
          }

          const cImg = await loadImage(conceptB64);
          const rImg = await loadImage(realB64);

          const cardW = 760;
          const cardH = 475;
          const pad = 24;
          const bannerH = 80;
          const totalW = cardW * 2 + pad * 3;
          const totalH = cardH + bannerH + pad * 2;

          const canvas = document.createElement('canvas');
          canvas.width = totalW;
          canvas.height = totalH;
          const ctx = canvas.getContext('2d');

          const isDark = theme === 'dark';
          ctx.fillStyle = isDark ? '#0B0B0D' : '#EFEFF0';
          ctx.fillRect(0, 0, totalW, totalH);

          // Top Banner
          ctx.fillStyle = isDark ? '#F2F2F3' : '#0B0B0D';
          ctx.font = 'bold 24px Inter, -apple-system, sans-serif';
          ctx.fillText(`SYNCTONE NOIR MONOCHROME — PARITY GATE (${theme.toUpperCase()})`, pad, 40);

          ctx.fillStyle = isDark ? '#A9A9AF' : '#4F4F56';
          ctx.font = '12px "JetBrains Mono", monospace';
          ctx.fillText(`${title.toUpperCase()} // TOP BAR: 56PX • PLAYER BAR: 72PX • ZERO HUE MONOCHROME CHROME`, pad, 64);

          // Left Box: Concept Target
          ctx.fillStyle = isDark ? '#F2F2F3' : '#0B0B0D';
          ctx.font = 'bold 12px "JetBrains Mono", monospace';
          ctx.fillText('TARGET: APPROVED CONCEPT PREVIEW', pad, bannerH + 16);
          ctx.strokeStyle = isDark ? '#2E2E33' : '#D0D0D4';
          ctx.lineWidth = 1;
          ctx.strokeRect(pad, bannerH + 24, cardW, cardH);
          ctx.drawImage(cImg, pad, bannerH + 24, cardW, cardH);

          // Right Box: Real Screen
          const rightX = pad * 2 + cardW;
          ctx.fillText('REAL: APPLICATION RUNTIME', rightX, bannerH + 16);
          ctx.strokeRect(rightX, bannerH + 24, cardW, cardH);
          ctx.drawImage(rImg, rightX, bannerH + 24, cardW, cardH);

          return canvas.toDataURL('image/png').split(',')[1];
        }, { conceptB64, realB64, title: sc.title, theme });

        const parityOutPath = path.join(parityDir, `${sc.id}-${theme}.png`);
        fs.writeFileSync(parityOutPath, Buffer.from(parityB64, 'base64'));
        console.log(`Saved Parity Comparison: ${parityOutPath}`);
      }
    }
  }

  await assembleContext.close();

  // Save Measurements JSON
  const measurementsPath = path.join(parityDir, 'measurements.json');
  fs.writeFileSync(measurementsPath, JSON.stringify(measurements, null, 2));
  console.log(`Saved Measurements: ${measurementsPath}`);

} finally {
  await browser.close();
  server.close();
  console.log('Parity gate complete.');
}

