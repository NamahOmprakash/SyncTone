import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const previewDir = path.join(rootDir, 'docs/design-preview');
const outDir = path.join(rootDir, 'docs/screenshots/noir-mono');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 1. Simple HTTP Server for docs/design-preview
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
  const filePath = path.join(previewDir, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const PORT = 8899;
await new Promise((resolve) => server.listen(PORT, resolve));
console.log(`Preview server listening at http://localhost:${PORT}`);

// 2. Playwright Launch
const playwrightPath = path.join(rootDir, 'novel-audio-synthesizer/frontend/node_modules/playwright/index.mjs');
const { chromium } = await import(playwrightPath);

const browser = await chromium.launch({ headless: true });

const screens = [
  { id: 'home', file: 'home.html' },
  { id: 'novel-detail', file: 'novel-detail.html' },
  { id: 'reader', file: 'reader.html' },
  { id: 'audio-player', file: 'audio-player.html' },
  { id: 'voice-studio', file: 'voice-studio.html' },
];

const viewports = [
  { name: 'desktop', width: 1440, height: 900, suffix: '1440x900' },
  { name: 'mobile', width: 390, height: 844, suffix: '390x844' },
];

const capturedImages = {
  dark: [],
  light: [],
};

try {
  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2, // Crisp retina quality
    });
    const page = await context.newPage();

    for (const theme of ['dark', 'light']) {
      for (const sc of screens) {
        const url = `http://localhost:${PORT}/${sc.file}?theme=${theme}`;
        console.log(`Capturing [${vp.name}] [${theme}] ${sc.id} -> ${url}`);

        await page.goto(url, { waitUntil: 'networkidle' });
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

        // Wait for font rendering
        await page.waitForTimeout(400);

        const filename = vp.name === 'mobile'
          ? `mobile-${sc.id}-${theme}-${vp.suffix}.png`
          : `${sc.id}-${theme}-${vp.suffix}.png`;

        const outPath = path.join(outDir, filename);
        await page.screenshot({ path: outPath, fullPage: false });
        console.log(`  -> Saved ${outPath}`);

        if (vp.name === 'desktop') {
          const imgBase64 = fs.readFileSync(outPath).toString('base64');
          capturedImages[theme].push({ id: sc.id, name: sc.id.toUpperCase(), base64: imgBase64 });
        }
      }
    }
    await context.close();
  }

  // 3. Assemble Visual Contact Sheets (One for Dark, One for Light)
  console.log('Assembling High-Resolution Contact Sheets...');
  const sheetContext = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
  });
  const sheetPage = await sheetContext.newPage();

  for (const theme of ['dark', 'light']) {
    const images = capturedImages[theme];
    console.log(`Generating contact sheet for ${theme} (${images.length} screens)...`);

    const sheetBuffer = await sheetPage.evaluate(async ({ images, theme }) => {
      function loadImage(b64) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = `data:image/png;base64,${b64}`;
        });
      }

      const cols = 2;
      const rows = Math.ceil(images.length / cols);
      const thumbW = 740;
      const thumbH = 462; // ~1440x900 aspect ratio
      const pad = 24;
      const headerH = 90;

      const totalW = cols * thumbW + (cols + 1) * pad;
      const totalH = rows * (thumbH + 34) + headerH + pad;

      const canvas = document.createElement('canvas');
      canvas.width = totalW;
      canvas.height = totalH;
      const ctx = canvas.getContext('2d');

      const isDark = theme === 'dark';
      ctx.fillStyle = isDark ? '#0B0B0D' : '#EFEFF0';
      ctx.fillRect(0, 0, totalW, totalH);

      // Header Banner
      ctx.fillStyle = isDark ? '#F2F2F3' : '#0B0B0D';
      ctx.font = 'bold 28px Inter, -apple-system, sans-serif';
      ctx.fillText(
        `SYNCTONE NOIR MONOCHROME — ${theme.toUpperCase()} MODE (1440x900)`,
        pad,
        48
      );

      ctx.fillStyle = isDark ? '#A9A9AF' : '#4F4F56';
      ctx.font = '13px "JetBrains Mono", monospace';
      ctx.fillText(
        'Phase 2 High-Fidelity Concept Preview — Mathematical WCAG 2.2 AA Contrast & Token Parity',
        pad,
        74
      );

      for (let idx = 0; idx < images.length; idx++) {
        const item = images[idx];
        const img = await loadImage(item.base64);
        const col = idx % cols;
        const row = Math.floor(idx / cols);

        const x = pad + col * (thumbW + pad);
        const y = headerH + row * (thumbH + 34 + pad);

        // Screen Label Bar
        ctx.fillStyle = isDark ? '#F2F2F3' : '#0B0B0D';
        ctx.font = 'bold 13px "JetBrains Mono", monospace';
        ctx.fillText(`SCREEN ${idx + 1}: ${item.name}`, x, y + 16);

        // Card Border and Image
        ctx.strokeStyle = isDark ? '#2E2E33' : '#D0D0D4';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y + 24, thumbW, thumbH);
        ctx.drawImage(img, x, y + 24, thumbW, thumbH);
      }

      return canvas.toDataURL('image/png').split(',')[1];
    }, { images, theme });

    const sheetOutPath = path.join(outDir, `noir-mono-${theme}-contact-sheet.png`);
    fs.writeFileSync(sheetOutPath, Buffer.from(sheetBuffer, 'base64'));
    console.log(`Saved contact sheet: ${sheetOutPath}`);
  }

  await sheetContext.close();
} finally {
  await browser.close();
  server.close();
  console.log('Capture run complete.');
}
