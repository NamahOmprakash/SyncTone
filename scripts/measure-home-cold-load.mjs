import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'novel-audio-synthesizer/frontend/dist');

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

// 1. Static Web Server with gzip encoding support
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  let filePath = path.join(distDir, reqPath === '/' ? 'index.html' : reqPath);

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    filePath = path.join(distDir, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  const content = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': content.length,
    'Access-Control-Allow-Origin': '*',
  });
  res.end(content);
});

const PORT = 4188;
await new Promise((resolve) => server.listen(PORT, resolve));
console.log(`Cold load server listening at http://localhost:${PORT}`);

const playwrightPath = path.join(rootDir, 'novel-audio-synthesizer/frontend/node_modules/playwright/index.mjs');
const { chromium } = await import(playwrightPath);
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Attach CDP Session
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });

  const networkRecords = new Map();

  client.on('Network.requestWillBeSent', (e) => {
    networkRecords.set(e.requestId, {
      requestId: e.requestId,
      url: e.request.url,
      method: e.request.method,
      type: e.type || 'Other',
      wallTime: e.wallTime,
      timestamp: e.timestamp,
    });
  });

  client.on('Network.responseReceived', (e) => {
    const record = networkRecords.get(e.requestId);
    if (record) {
      record.status = e.response.status;
      record.mimeType = e.response.mimeType;
      record.encodedDataLength = e.response.encodedDataLength;
      record.headers = e.response.headers;
      record.fromDiskCache = e.response.fromDiskCache;
      record.fromServiceWorker = e.response.fromServiceWorker;
    }
  });

  client.on('Network.loadingFinished', (e) => {
    const record = networkRecords.get(e.requestId);
    if (record) {
      record.encodedDataLength = e.encodedDataLength;
      record.finishTimestamp = e.timestamp;
      record.durationMs = Math.round((e.timestamp - record.timestamp) * 1000);
    }
  });

  // Intercept mock API calls so network request measurement is clean
  await page.route('**/api/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ novels: [] }),
    });
  });

  // Navigate to Home
  const response = await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  console.log('\n========================================================================================');
  console.log('HOME COLD-LOAD NETWORK REQUEST AUDIT (PLAYWRIGHT + CHROME DEVTOOLS PROTOCOL)');
  console.log('========================================================================================\n');

  const requests = Array.from(networkRecords.values()).filter((r) => !r.url.startsWith('data:'));

  let totalTransferBytes = 0;
  let totalJsTransferBytes = 0;
  let totalCssTransferBytes = 0;
  let totalFontTransferBytes = 0;

  const rows = [];

  for (const r of requests) {
    const urlObj = new URL(r.url);
    const filename = path.basename(urlObj.pathname) || '/';
    const transferBytes = r.encodedDataLength || 0;
    totalTransferBytes += transferBytes;

    const isJs = filename.endsWith('.js') || r.mimeType?.includes('javascript');
    const isCss = filename.endsWith('.css') || r.mimeType?.includes('css');
    const isFont = filename.endsWith('.woff2') || filename.endsWith('.woff') || r.mimeType?.includes('font');

    if (isJs) totalJsTransferBytes += transferBytes;
    if (isCss) totalCssTransferBytes += transferBytes;
    if (isFont) totalFontTransferBytes += transferBytes;

    rows.push({
      file: filename,
      type: r.type,
      status: r.status,
      mime: r.mimeType || 'unknown',
      sizeBytes: transferBytes,
      sizeKb: (transferBytes / 1024).toFixed(2),
      durationMs: r.durationMs !== undefined ? `${r.durationMs}ms` : 'n/a',
    });
  }

  console.table(rows);

  console.log('\n----------------------------------------------------------------------------------------');
  console.log(`TOTAL COLD-LOAD TRANSFER SIZE: ${(totalTransferBytes / 1024).toFixed(2)} kB`);
  console.log(`TOTAL JAVASCRIPT TRANSFER:     ${(totalJsTransferBytes / 1024).toFixed(2)} kB`);
  console.log(`TOTAL CSS TRANSFER:            ${(totalCssTransferBytes / 1024).toFixed(2)} kB`);
  console.log(`TOTAL FONTS TRANSFER:          ${(totalFontTransferBytes / 1024).toFixed(2)} kB`);
  console.log('----------------------------------------------------------------------------------------\n');

  // Also read on-disk gzip sizes of the dist bundles for exact mathematical verification
  const distAssets = path.join(distDir, 'assets');
  if (fs.existsSync(distAssets)) {
    console.log('ON-DISK ASSET GZIP BREAKDOWN:');
    const zlib = await import('zlib');
    const files = fs.readdirSync(distAssets);
    let totalGzipJs = 0;
    for (const f of files) {
      if (f.endsWith('.js')) {
        const full = path.join(distAssets, f);
        const buf = fs.readFileSync(full);
        const gzipped = zlib.gzipSync(buf);
        const gzKb = (gzipped.length / 1024).toFixed(2);
        console.log(`  - ${f.padEnd(35)} : ${gzKb.padStart(6)} kB gzip (uncompressed: ${(buf.length / 1024).toFixed(2)} kB)`);
      }
    }
  }

} finally {
  await browser.close();
  server.close();
}

