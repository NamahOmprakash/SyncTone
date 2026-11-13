import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const PORT = 5058;
const BACKEND_URL = 'http://localhost:4000';
const OUT_DIR = '/Users/mohdfaizankhan/SyncTone-/docs/screenshots/orange-preview';
const DIST_DIR = '/tmp/orange-preview/novel-audio-synthesizer/frontend/dist';

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function createStaticServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    
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

    let filePath = path.join(DIST_DIR, url.pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
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

const CANDIDATES = [
  {
    id: 'D1',
    theme: 'dark',
    name: 'Candidate D1: Vibrant Electric Orange (User Specified)',
    accent: 'oklch(0.72 0.200 55)',
    hover: 'oklch(0.76 0.190 58)',
    surface: 'rgba(255, 121, 0, 0.12)',
    focus: 'oklch(0.72 0.200 55)',
    onAccent: 'oklch(0.12 0.010 260)', // Dark text: 7.73:1 contrast
    buttonLabelColor: '#0B0D14 (Dark)',
    hex: '#FF7900',
    contrastBg: '7.66:1 (AAA)',
    contrastSurface: '7.39:1 (AAA)',
    contrastButtonLabel: '7.73:1 (AAA, dark label)',
    contrastSubtle: '6.74:1 (AAA)',
    contrastFocus: '7.66:1 (AAA)'
  },
  {
    id: 'D2',
    theme: 'dark',
    name: 'Candidate D2: Warm Amber-Tangerine (Softer Chroma)',
    accent: 'oklch(0.70 0.160 56)',
    hover: 'oklch(0.74 0.150 58)',
    surface: 'rgba(231, 128, 34, 0.12)',
    focus: 'oklch(0.70 0.160 56)',
    onAccent: 'oklch(0.12 0.010 260)', // Dark text: 7.24:1 contrast
    buttonLabelColor: '#0B0D14 (Dark)',
    hex: '#E78022',
    contrastBg: '7.18:1 (AAA)',
    contrastSurface: '6.93:1 (AAA)',
    contrastButtonLabel: '7.24:1 (AAA, dark label)',
    contrastSubtle: '6.33:1 (AAA)',
    contrastFocus: '7.18:1 (AAA)'
  },
  {
    id: 'L1',
    theme: 'light',
    name: 'Candidate L1: Burnt Amber Orange (User Specified)',
    accent: 'oklch(0.58 0.190 50)',
    hover: 'oklch(0.52 0.190 48)',
    surface: 'rgba(205, 75, 0, 0.10)',
    focus: 'oklch(0.58 0.190 50)',
    onAccent: 'oklch(1.00 0.000 0)', // White text: 4.58:1 contrast
    buttonLabelColor: '#FFFFFF (White)',
    hex: '#CD4B00',
    contrastBg: '4.38:1 (Near AA)',
    contrastSurface: '4.58:1 (AA)',
    contrastButtonLabel: '4.58:1 (AA, white label)',
    contrastSubtle: '3.83:1 (AA large)',
    contrastFocus: '4.38:1 (3:1 graphical UI)'
  },
  {
    id: 'L2',
    theme: 'light',
    name: 'Candidate L2: Deep Terracotta Orange (WCAG AA 4.5:1 Compliant)',
    accent: 'oklch(0.52 0.170 48)',
    hover: 'oklch(0.46 0.170 46)',
    surface: 'rgba(178, 62, 0, 0.10)',
    focus: 'oklch(0.52 0.170 48)',
    onAccent: 'oklch(1.00 0.000 0)', // White text: 5.87:1 contrast
    buttonLabelColor: '#FFFFFF (White)',
    hex: '#B23E00',
    contrastBg: '5.63:1 (AA+)',
    contrastSurface: '5.89:1 (AA+)',
    contrastButtonLabel: '5.87:1 (AA+, white label)',
    contrastSubtle: '4.85:1 (AA)',
    contrastFocus: '5.63:1 (AA)'
  },
  {
    id: 'L3',
    theme: 'light',
    name: 'Candidate L3: Balanced Amber Orange (Midpoint AA Compliant)',
    accent: 'oklch(0.55 0.180 49)',
    hover: 'oklch(0.49 0.180 47)',
    surface: 'rgba(191, 68, 0, 0.10)',
    focus: 'oklch(0.55 0.180 49)',
    onAccent: 'oklch(1.00 0.000 0)', // White text: 5.18:1 contrast
    buttonLabelColor: '#FFFFFF (White)',
    hex: '#BF4400',
    contrastBg: '4.96:1 (AA)',
    contrastSurface: '5.18:1 (AA)',
    contrastButtonLabel: '5.18:1 (AA, white label)',
    contrastSubtle: '4.31:1 (Near AA)',
    contrastFocus: '4.96:1 (AA)'
  }
];

async function captureCandidate(candidate, browser) {
  const { id, theme } = candidate;
  console.log(`\nCapturing candidate: ${id} (${theme})`);

  const candDir = path.join(OUT_DIR, id);
  if (!fs.existsSync(candDir)) {
    fs.mkdirSync(candDir, { recursive: true });
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce'
  });

  const page = await context.newPage();

  // CSS injection rule
  const cssOverride = `
    ${theme === 'dark' ? ':root, html.dark' : 'html.light'} {
      --accent: ${candidate.accent} !important;
      --accent-hover: ${candidate.hover} !important;
      --accent-surface: ${candidate.surface} !important;
      --border-focus: ${candidate.focus} !important;
      --on-accent: ${candidate.onAccent} !important;
      --card-accent: ${candidate.accent} !important;
      --top10-active: ${candidate.accent} !important;
    }
  `;

  async function applyThemeAndTokens() {
    await page.evaluate(({ t, css }) => {
      localStorage.setItem('synctone_theme', t);
      document.documentElement.className = t;
      let styleTag = document.getElementById('preview-orange-style');
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'preview-orange-style';
        document.head.appendChild(styleTag);
      }
      styleTag.textContent = css;
    }, { t: theme, css: cssOverride });
  }

  const views = {};

  // 1. Home
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await applyThemeAndTokens();
  await page.waitForTimeout(400);
  const homeFile = path.join(candDir, 'home.png');
  await page.screenshot({ path: homeFile });
  views['home'] = homeFile;
  console.log(`  -> Home captured`);

  // 2. Novel Detail
  const card = page.locator('.preview-card-container, article, .novel-card-hybrid, div[class*="group cursor-pointer"]').first();
  if (await card.count() > 0) {
    await card.click({ timeout: 5000 });
    await page.waitForTimeout(600);
    await applyThemeAndTokens();
    const detailFile = path.join(candDir, 'novel-detail.png');
    await page.screenshot({ path: detailFile });
    views['novel-detail'] = detailFile;
    console.log(`  -> Novel Detail captured`);

    // 3. Reader (Normal)
    const readBtn = page.locator('button:has-text("Start Reading"), button:has-text("Start Listening"), button:has-text("Read & Listen"), button:has-text("Read Chapter"), button:has-text("Read")').first();
    if (await readBtn.count() > 0) {
      await readBtn.click({ timeout: 5000 });
      await page.waitForTimeout(800);
      await applyThemeAndTokens();
      const readerFile = path.join(candDir, 'reader-normal.png');
      await page.screenshot({ path: readerFile });
      views['reader-normal'] = readerFile;
      console.log(`  -> Reader Normal captured`);
    } else {
      views['reader-normal'] = detailFile;
    }
  } else {
    views['novel-detail'] = homeFile;
    views['reader-normal'] = homeFile;
  }

  // 4. Settings Modal
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await applyThemeAndTokens();
  await page.waitForTimeout(300);
  const settingsBtn = page.locator('aside button[title*="Settings"], aside button[title*="TTS"], header button[aria-label*="Settings"], header button[aria-label*="TTS"], button[aria-label*="Settings"]:visible').first();
  if (await settingsBtn.count() > 0) {
    await settingsBtn.click({ timeout: 5000 });
    await page.waitForTimeout(500);
    await applyThemeAndTokens();
    const settingsFile = path.join(candDir, 'settings.png');
    await page.screenshot({ path: settingsFile });
    views['settings'] = settingsFile;
    console.log(`  -> Settings Modal captured`);
  } else {
    views['settings'] = homeFile;
  }

  // 5. Auth Modal
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await applyThemeAndTokens();
  await page.waitForTimeout(300);
  const authBtn = page.locator('header button:has-text("Sign In"), aside button[aria-label*="User Account"], button[aria-label*="Account / Sign In"]:visible, button:has-text("Sign In"):visible').first();
  if (await authBtn.count() > 0) {
    await authBtn.click({ timeout: 5000 });
    await page.waitForTimeout(500);
    await applyThemeAndTokens();
    const authFile = path.join(candDir, 'auth.png');
    await page.screenshot({ path: authFile });
    views['auth'] = authFile;
    console.log(`  -> Auth Modal captured`);
  } else {
    views['auth'] = homeFile;
  }

  await context.close();
  return views;
}

async function assembleThemeSheet(themeName, candidatesList, candidateScreenshots) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const views = [
    { id: 'home', label: 'Home (Catalog)' },
    { id: 'reader-normal', label: 'Reader (Normal)' },
    { id: 'settings', label: 'Settings Modal' },
    { id: 'auth', label: 'Auth Modal' },
    { id: 'novel-detail', label: 'Novel Detail' }
  ];

  const sheetHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        background: #0a0c12;
        color: #f1f5f9;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        padding: 36px;
        width: 3080px;
      }
      .top-banner {
        background: #141724;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 20px;
        padding: 24px 36px;
        margin-bottom: 30px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        box-shadow: 0 15px 35px -5px rgba(0,0,0,0.5);
      }
      .top-banner h1 {
        font-size: 32px;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: #ffffff;
      }
      .top-banner .subtitle {
        font-size: 16px;
        color: #94a3b8;
        margin-top: 4px;
      }
      .candidate-section {
        background: #10121c;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 20px;
        padding: 28px;
        margin-bottom: 36px;
      }
      .candidate-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 18px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .candidate-title {
        font-size: 24px;
        font-weight: 800;
        color: #ffffff;
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .badge-id {
        padding: 5px 14px;
        background: #222738;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 10px;
        font-size: 16px;
        font-family: monospace;
        font-weight: 800;
        color: #fb923c;
      }
      .meta-grid {
        display: flex;
        gap: 28px;
        background: #090a10;
        padding: 14px 22px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.06);
      }
      .meta-col {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .meta-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #64748b;
        font-weight: 800;
      }
      .meta-val {
        font-size: 13px;
        font-family: monospace;
        color: #f1f5f9;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .swatch {
        width: 18px;
        height: 18px;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.3);
        display: inline-block;
      }
      .views-grid {
        display: grid;
        grid-template-columns: repeat(5, 580px);
        gap: 20px;
      }
      .card {
        background: #151826;
        border-radius: 14px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 10px 24px -4px rgba(0,0,0,0.5);
      }
      .card-header {
        padding: 10px 16px;
        background: #0d0f17;
        font-size: 13px;
        font-weight: 700;
        color: #cbd5e1;
        display: flex;
        justify-content: space-between;
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
    <div class="top-banner">
      <div>
        <h1>SyncTone Orange Accent Preview — ${themeName.toUpperCase()} CANDIDATES</h1>
        <div class="subtitle">Step B1 Verification Matrix • 1440 × 900 • Reduced Motion Active</div>
      </div>
      <div>
        <span style="font-family: monospace; font-size: 14px; color: #fb923c; background: #1f2434; padding: 6px 14px; border-radius: 8px; border: 1px solid rgba(251, 146, 60, 0.3);">
          ${candidatesList.length} Candidates Evaluated
        </span>
      </div>
    </div>

    ${candidatesList.map(cand => {
      const viewsMap = candidateScreenshots[cand.id];
      const imagesB64 = {};
      for (const v of views) {
        imagesB64[v.id] = 'data:image/png;base64,' + fs.readFileSync(viewsMap[v.id]).toString('base64');
      }

      return `
      <div class="candidate-section">
        <div class="candidate-header">
          <div class="candidate-title">
            <span class="badge-id">${cand.id}</span>
            <span>${cand.name}</span>
          </div>
          <div class="meta-grid">
            <div class="meta-col">
              <span class="meta-label">Accent (OKLCH & Hex)</span>
              <span class="meta-val">
                <span class="swatch" style="background: ${cand.hex};"></span>
                ${cand.accent} (${cand.hex})
              </span>
              <span class="meta-label" style="margin-top: 4px;">Button Label</span>
              <span class="meta-val">${cand.buttonLabelColor}</span>
            </div>
            <div class="meta-col">
              <span class="meta-label">vs Page Contrast</span>
              <span class="meta-val">${cand.contrastBg}</span>
              <span class="meta-label" style="margin-top: 4px;">vs Surface Contrast</span>
              <span class="meta-val">${cand.contrastSurface}</span>
            </div>
            <div class="meta-col">
              <span class="meta-label">Button Label Contrast</span>
              <span class="meta-val">${cand.contrastButtonLabel}</span>
              <span class="meta-label" style="margin-top: 4px;">Accent Subtle Contrast</span>
              <span class="meta-val">${cand.contrastSubtle}</span>
            </div>
          </div>
        </div>

        <div class="views-grid">
          ${views.map(v => `
            <div class="card">
              <div class="card-header">
                <span>${v.label}</span>
                <span style="opacity: 0.6; font-size: 11px; font-family: monospace;">${cand.id}</span>
              </div>
              <img src="${imagesB64[v.id]}" alt="${v.label}" />
            </div>
          `).join('')}
        </div>
      </div>
      `;
    }).join('')}
  </body>
  </html>
  `;

  await page.setContent(sheetHtml, { waitUntil: 'load' });
  const totalHeight = 140 + candidatesList.length * 520;
  await page.setViewportSize({ width: 3080, height: totalHeight });
  await page.waitForTimeout(600);

  const outPath = path.join(OUT_DIR, `${themeName}-candidates-contact-sheet.png`);
  await page.screenshot({ path: outPath, fullPage: true });
  console.log(`>>> Wrote contact sheet: ${outPath}`);
  await browser.close();
}

async function run() {
  const server = createStaticServer();
  await new Promise(r => server.listen(PORT, r));
  console.log(`Preview server running on port ${PORT}`);

  const browser = await chromium.launch({ headless: true });
  const candidateScreenshots = {};

  try {
    for (const cand of CANDIDATES) {
      const views = await captureCandidate(cand, browser);
      candidateScreenshots[cand.id] = views;
    }
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }

  // Assemble Dark contact sheet
  console.log('\nAssembling Dark Candidates Contact Sheet...');
  const darkCandidates = CANDIDATES.filter(c => c.theme === 'dark');
  await assembleThemeSheet('dark', darkCandidates, candidateScreenshots);

  // Assemble Light contact sheet
  console.log('\nAssembling Light Candidates Contact Sheet...');
  const lightCandidates = CANDIDATES.filter(c => c.theme === 'light');
  await assembleThemeSheet('light', lightCandidates, candidateScreenshots);

  console.log('\nAll candidate previews and contact sheets generated successfully!');
}

run().catch(console.error);
