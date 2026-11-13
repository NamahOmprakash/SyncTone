import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5055;
const BACKEND_URL = 'http://localhost:4000';
const OUT_DIR = path.resolve(__dirname, '../../../docs/screenshots/palette-history');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function createStaticServer(distDir) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    
    // Proxy /api to backend
    if (url.pathname.startsWith('/api')) {
      const proxyReq = http.request(
        `${BACKEND_URL}${url.pathname}${url.search}`,
        {
          method: req.method,
          headers: { ...req.headers, host: 'localhost:4000' }
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res);
        }
      );
      proxyReq.on('error', (err) => {
        res.writeHead(502);
        res.end(err.message);
      });
      req.pipe(proxyReq);
      return;
    }

    let filePath = path.join(distDir, url.pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.woff2': 'font/woff2',
      '.webmanifest': 'application/manifest+json'
    };

    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(data);
    } catch (e) {
      res.writeHead(404);
      res.end('Not found');
    }
  });
}

const PALETTES = [
  {
    hash: '556d693',
    date: '2026-10-21',
    author: 'Mohd Faizan Khan',
    name: 'Cinematic Literary OTT (Original Amber-Gold Theme)',
    darkAccent: '#E5A93C (brand.gold) / #F59E0B (amber-500)',
    lightAccent: '#B45309 (amber-700) / #D97706 (amber-600)',
    accentHover: '#D97706 (amber-600) / #FBBF24 (amber-400)',
    focusRing: 'rgba(180, 83, 9, 0.45) / rgba(99, 102, 241, 0.4)',
    accentSurface: 'rgba(245, 158, 11, 0.12)',
    swatchDark: '#E5A93C',
    swatchLight: '#B45309'
  },
  {
    hash: 'ae0438a',
    date: '2026-10-21',
    author: 'Mohd Faizan Khan',
    name: 'Literary Cinema Hex Tri-Theme (Indigo / Amber-Brown / Indigo)',
    darkAccent: '#818CF8 (Indigo-400)',
    lightAccent: '#4F46E5 (Indigo-600) [Sepia: #92400E]',
    accentHover: '#6366F1 (Indigo-500) / #4338CA (Indigo-700)',
    focusRing: 'rgba(129, 140, 248, 0.4) / rgba(79, 70, 229, 0.4)',
    accentSurface: 'rgba(129, 140, 248, 0.08) / rgba(79, 70, 229, 0.08)',
    swatchDark: '#818CF8',
    swatchLight: '#4F46E5'
  },
  {
    hash: '1879dd7',
    date: '2026-10-31',
    author: 'Mohd Faizan Khan',
    name: 'Atelier Obsidian OKLCH Tokens (Cinnabar / Signal Vermilion)',
    darkAccent: 'oklch(0.67 0.220 36) [#FF4F17 / #e0533c Cinnabar]',
    lightAccent: 'oklch(0.52 0.220 34) [#C80000 Signal Vermilion]',
    accentHover: 'oklch(0.72 0.210 38) / oklch(0.45 0.220 32)',
    focusRing: 'oklch(0.70 0.220 36) / oklch(0.52 0.220 34)',
    accentSurface: 'rgba(255, 95, 65, 0.12) / rgba(220, 60, 40, 0.10)',
    swatchDark: '#FF4F17',
    swatchLight: '#C80000'
  }
];

async function captureViewsForPalette(paletteInfo) {
  const { hash } = paletteInfo;
  console.log(`\n========================================`);
  console.log(`Processing Palette: ${hash} (${paletteInfo.name})`);
  console.log(`========================================`);

  const paletteDir = path.join(OUT_DIR, hash);
  if (!fs.existsSync(paletteDir)) {
    fs.mkdirSync(paletteDir, { recursive: true });
  }

  const distDir = `/tmp/palette-worktrees/${hash}/novel-audio-synthesizer/frontend/dist`;
  const server = createStaticServer(distDir);
  await new Promise(r => server.listen(PORT, r));
  console.log(`Static server running on port ${PORT}`);

  const browser = await chromium.launch({ headless: true });
  const screenshots = { light: {}, dark: {} };

  try {
    for (const theme of ['light', 'dark']) {
      console.log(`\nCapturing views for theme: ${theme}`);
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        reducedMotion: 'reduce'
      });
      const page = await context.newPage();

      // 1. Home View
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
      await page.evaluate((t) => {
        localStorage.setItem('synctone_theme', t);
        document.documentElement.className = t;
      }, theme);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      await page.evaluate((t) => { document.documentElement.className = t; }, theme);
      await page.waitForTimeout(300);

      const homeFile = path.join(paletteDir, `${theme}-home.png`);
      await page.screenshot({ path: homeFile });
      screenshots[theme]['home'] = homeFile;
      console.log(`  -> Captured: ${theme}-home.png`);

      // 2. Novel Detail View
      const card = page.locator('.preview-card-container, article, .novel-card-hybrid, div[class*="group cursor-pointer"]').first();
      let hasDetail = false;
      try {
        if (await card.count() > 0) {
          await card.click({ timeout: 5000 });
          await page.waitForTimeout(800);
          await page.evaluate((t) => { document.documentElement.className = t; }, theme);
          const detailFile = path.join(paletteDir, `${theme}-novel-detail.png`);
          await page.screenshot({ path: detailFile });
          screenshots[theme]['novel-detail'] = detailFile;
          hasDetail = true;
          console.log(`  -> Captured: ${theme}-novel-detail.png`);
        }
      } catch (e) {
        console.warn(`  Warning: Failed to capture novel detail: ${e.message}`);
      }
      if (!hasDetail) {
        screenshots[theme]['novel-detail'] = homeFile;
      }

      // 3. Reader (Normal) View
      let hasReader = false;
      try {
        const readBtn = page.locator('button:has-text("Start Reading"), button:has-text("Start Listening"), button:has-text("Read & Listen"), button:has-text("Read Chapter"), button:has-text("Read")').first();
        if (await readBtn.count() > 0) {
          await readBtn.click({ timeout: 5000 });
          await page.waitForTimeout(1000);
          await page.evaluate((t) => { document.documentElement.className = t; }, theme);
          const readerFile = path.join(paletteDir, `${theme}-reader-normal.png`);
          await page.screenshot({ path: readerFile });
          screenshots[theme]['reader-normal'] = readerFile;
          hasReader = true;
          console.log(`  -> Captured: ${theme}-reader-normal.png`);
        }
      } catch (e) {
        console.warn(`  Warning: Failed to capture reader: ${e.message}`);
      }
      if (!hasReader) {
        screenshots[theme]['reader-normal'] = screenshots[theme]['novel-detail'] || homeFile;
      }

      // 4. Settings Modal (Fresh navigation)
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
      await page.evaluate((t) => {
        localStorage.setItem('synctone_theme', t);
        document.documentElement.className = t;
      }, theme);
      await page.waitForTimeout(400);

      let hasSettings = false;
      try {
        const settingsBtn = page.locator('aside button[title*="Settings"], aside button[title*="TTS"], header button[aria-label*="Settings"], header button[aria-label*="TTS"], button[aria-label*="Settings"]:visible, button[aria-label*="TTS Settings"]:visible').first();
        if (await settingsBtn.count() > 0) {
          await settingsBtn.click({ timeout: 5000 });
          await page.waitForTimeout(600);
          await page.evaluate((t) => { document.documentElement.className = t; }, theme);
          const settingsFile = path.join(paletteDir, `${theme}-settings.png`);
          await page.screenshot({ path: settingsFile });
          screenshots[theme]['settings'] = settingsFile;
          hasSettings = true;
          console.log(`  -> Captured: ${theme}-settings.png`);
        }
      } catch (e) {
        console.warn(`  Warning: Failed to capture settings modal: ${e.message}`);
      }
      if (!hasSettings) {
        screenshots[theme]['settings'] = homeFile;
      }

      // 5. Auth Modal (Fresh navigation to avoid any lingering dialog backdrop)
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
      await page.evaluate((t) => {
        localStorage.setItem('synctone_theme', t);
        document.documentElement.className = t;
      }, theme);
      await page.waitForTimeout(400);

      let hasAuth = false;
      try {
        const authBtn = page.locator('header button:has-text("Sign In"), aside button[aria-label*="User Account"], button[aria-label*="Account / Sign In"]:visible, button:has-text("Sign In"):visible').first();
        if (await authBtn.count() > 0) {
          await authBtn.click({ timeout: 5000 });
          await page.waitForTimeout(600);
          await page.evaluate((t) => { document.documentElement.className = t; }, theme);
          const authFile = path.join(paletteDir, `${theme}-auth.png`);
          await page.screenshot({ path: authFile });
          screenshots[theme]['auth'] = authFile;
          hasAuth = true;
          console.log(`  -> Captured: ${theme}-auth.png`);
        }
      } catch (e) {
        console.warn(`  Warning: Failed to capture auth modal: ${e.message}`);
      }
      if (!hasAuth) {
        screenshots[theme]['auth'] = homeFile;
      }

      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }

  // Assemble Contact Sheet
  console.log(`\nAssembling contact sheet for ${hash}...`);
  await buildContactSheet(paletteInfo, screenshots);
}

async function buildContactSheet(paletteInfo, screenshots) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const views = [
    { id: 'home', label: 'Home (Catalog)' },
    { id: 'novel-detail', label: 'Novel Detail' },
    { id: 'reader-normal', label: 'Reader (Normal)' },
    { id: 'settings', label: 'Settings Modal' },
    { id: 'auth', label: 'Auth Modal' }
  ];

  // Read images as base64
  const lightB64 = {};
  const darkB64 = {};
  for (const v of views) {
    lightB64[v.id] = 'data:image/png;base64,' + fs.readFileSync(screenshots.light[v.id]).toString('base64');
    darkB64[v.id] = 'data:image/png;base64,' + fs.readFileSync(screenshots.dark[v.id]).toString('base64');
  }

  const sheetHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        background: #0b0d14;
        color: #f1f5f9;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        padding: 36px;
        width: 3080px;
      }
      .header {
        background: #141724;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 20px;
        padding: 28px 36px;
        margin-bottom: 28px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.5);
      }
      .title-box h1 {
        font-size: 34px;
        font-weight: 800;
        letter-spacing: -0.02em;
        margin-bottom: 8px;
        color: #ffffff;
      }
      .title-box .badge {
        display: inline-block;
        padding: 5px 14px;
        background: #23283c;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 10px;
        font-size: 15px;
        font-family: monospace;
        font-weight: bold;
        color: #93c5fd;
        margin-right: 14px;
      }
      .title-box .desc {
        display: inline-block;
        font-size: 17px;
        color: #94a3b8;
      }
      .tokens-box {
        display: flex;
        gap: 36px;
        background: #0f121d;
        padding: 18px 28px;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      .token-col {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .token-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #64748b;
        font-weight: 800;
      }
      .token-val {
        font-size: 14px;
        font-family: monospace;
        color: #f8fafc;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .swatch {
        width: 20px;
        height: 20px;
        border-radius: 5px;
        border: 1px solid rgba(255, 255, 255, 0.3);
        display: inline-block;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      }
      .section-label {
        font-size: 22px;
        font-weight: 700;
        margin: 24px 0 14px 4px;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .pill {
        font-size: 13px;
        padding: 4px 12px;
        border-radius: 8px;
        text-transform: uppercase;
        font-weight: 800;
        letter-spacing: 0.05em;
      }
      .pill-light { background: #e2e8f0; color: #0f172a; }
      .pill-dark { background: #1e293b; color: #f8fafc; border: 1px solid #334155; }
      .grid {
        display: grid;
        grid-template-columns: repeat(5, 580px);
        gap: 24px;
        margin-bottom: 34px;
      }
      .card {
        background: #141724;
        border-radius: 14px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 12px 30px -6px rgba(0, 0, 0, 0.6);
      }
      .card-header {
        padding: 12px 18px;
        background: #10121d;
        font-size: 14px;
        font-weight: 700;
        color: #cbd5e1;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .card img {
        width: 580px;
        height: 362px;
        object-fit: cover;
        display: block;
      }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="title-box">
        <h1>${paletteInfo.name}</h1>
        <div style="margin-top: 6px;">
          <span class="badge">commit ${paletteInfo.hash}</span>
          <span class="desc">${paletteInfo.date} • ${paletteInfo.author} • SyncTone History Contact Sheet</span>
        </div>
      </div>
      <div class="tokens-box">
        <div class="token-col">
          <div class="token-label">Dark Accent</div>
          <div class="token-val">
            <span class="swatch" style="background: ${paletteInfo.swatchDark};"></span>
            ${paletteInfo.darkAccent}
          </div>
          <div class="token-label" style="margin-top: 6px;">Light Accent</div>
          <div class="token-val">
            <span class="swatch" style="background: ${paletteInfo.swatchLight};"></span>
            ${paletteInfo.lightAccent}
          </div>
        </div>
        <div class="token-col">
          <div class="token-label">Accent Hover</div>
          <div class="token-val">${paletteInfo.accentHover}</div>
          <div class="token-label" style="margin-top: 6px;">Focus Ring / Border</div>
          <div class="token-val">${paletteInfo.focusRing}</div>
        </div>
        <div class="token-col">
          <div class="token-label">Accent Surface Tint</div>
          <div class="token-val">${paletteInfo.accentSurface}</div>
        </div>
      </div>
    </div>

    <!-- LIGHT MODE ROW -->
    <div class="section-label">
      <span class="pill pill-light">Light Mode</span>
      <span>Editorial Light Canvas (1440 × 900)</span>
    </div>
    <div class="grid">
      ${views.map(v => `
        <div class="card">
          <div class="card-header">
            <span>${v.label}</span>
            <span style="opacity: 0.6; font-size: 12px; font-family: monospace;">Light</span>
          </div>
          <img src="${lightB64[v.id]}" alt="${v.label} Light" />
        </div>
      `).join('')}
    </div>

    <!-- DARK MODE ROW -->
    <div class="section-label">
      <span class="pill pill-dark">Dark Mode</span>
      <span>Atelier Dark / OLED Canvas (1440 × 900)</span>
    </div>
    <div class="grid">
      ${views.map(v => `
        <div class="card">
          <div class="card-header">
            <span>${v.label}</span>
            <span style="opacity: 0.6; font-size: 12px; font-family: monospace;">Dark</span>
          </div>
          <img src="${darkB64[v.id]}" alt="${v.label} Dark" />
        </div>
      `).join('')}
    </div>
  </body>
  </html>
  `;

  await page.setContent(sheetHtml, { waitUntil: 'load' });
  await page.setViewportSize({ width: 3080, height: 1250 });
  await page.waitForTimeout(600);

  const contactSheetPath = path.join(OUT_DIR, `${paletteInfo.hash}-contact-sheet.png`);
  await page.screenshot({ path: contactSheetPath, fullPage: true });
  console.log(`>>> Successfully wrote contact sheet: ${contactSheetPath}`);

  await browser.close();
}

async function run() {
  for (const pal of PALETTES) {
    try {
      await captureViewsForPalette(pal);
    } catch (err) {
      console.error(`Error capturing palette ${pal.hash}:`, err);
    }
  }
  console.log('\nAll palette contact sheets completed successfully!');
}

run().catch(console.error);
