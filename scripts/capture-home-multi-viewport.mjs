import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'novel-audio-synthesizer/frontend/dist');
const outDir = path.join(rootDir, 'docs/parity');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 1. Static SPA HTTP Server
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
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

const PORT = 4192;
await new Promise((resolve) => server.listen(PORT, resolve));
console.log(`Multi-viewport capture server listening at http://localhost:${PORT}`);

const playwrightPath = path.join(rootDir, 'novel-audio-synthesizer/frontend/node_modules/playwright/index.mjs');
const { chromium } = await import(playwrightPath);
const browser = await chromium.launch({ headless: true });

const mockNovels = [
  {
    id: 'n-sherlock-1',
    title: 'The Adventures of Sherlock Holmes',
    author_username: 'Arthur Conan Doyle',
    narrator_name: 'Dr. John Watson',
    channel: 'verified',
    chapter_count: 24,
    total_duration_ms: 2294000,
    global_tone: 'Victorian Mystery',
    synopsis: 'The Adventures of Sherlock Holmes is a collection of twelve short stories by Arthur Conan Doyle, first published on 14 October 1892. It contains the earliest short stories featuring the consulting detective Sherlock Holmes, beginning with A Scandal in Bohemia.',
    cover_object: null,
  },
  {
    id: 'n-gatsby-2',
    title: 'The Great Gatsby',
    author_username: 'F. Scott Fitzgerald',
    narrator_name: 'Nick Carraway',
    channel: 'verified',
    chapter_count: 9,
    total_duration_ms: 1845000,
    global_tone: 'Jazz Age Drama',
    synopsis: 'Set in Jazz Age New York, the novel depicts narrator Nick Carraway\'s interactions with mysterious millionaire Jay Gatsby and Gatsby\'s obsession to reunite with his former lover, Daisy Buchanan.',
    cover_object: null,
  },
  {
    id: 'n-dracula-3',
    title: 'Dracula: The Un-Dead',
    author_username: 'Bram Stoker',
    narrator_name: 'Jonathan Harker',
    channel: 'community',
    chapter_count: 27,
    total_duration_ms: 3120000,
    global_tone: 'Gothic Horror',
    synopsis: 'The epistolary gothic masterpiece detailing Count Dracula\'s attempt to move from Transylvania to England so that he may find new blood and spread the undead curse.',
    cover_object: null,
  },
];

const viewports = [
  { width: 1440, height: 900, name: '1440x900' },
  { width: 1190, height: 770, name: '1190x770' },
  { width: 768, height: 1024, name: '768x1024' },
  { width: 390, height: 844, name: '390x844' },
  { width: 320, height: 568, name: '320x568' },
];

try {
  for (const vp of viewports) {
    for (const theme of ['dark', 'light']) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();

      await page.route('**/api/**', async (route) => {
        const url = route.request().url();
        if (url.includes('/api/novels')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ novels: mockNovels }),
          });
        }
        if (url.includes('/api/auth/me')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ user: null }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        });
      });

      await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

      await page.evaluate((th) => {
        localStorage.setItem('synctone_theme', th);
        document.documentElement.setAttribute('data-theme', th);
        if (th === 'light') {
          document.documentElement.classList.add('light');
          document.documentElement.classList.remove('dark');
        } else {
          document.documentElement.classList.add('dark');
          document.documentElement.classList.remove('light');
        }
      }, theme);

      await page.waitForTimeout(400);

      const filename = `real-home-${theme}-${vp.name}.png`;
      const outPath = path.join(outDir, filename);
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`Saved screenshot: ${outPath} [${vp.name}] [${theme}]`);

      await context.close();
    }
  }
} finally {
  await browser.close();
  server.close();
  console.log('Multi-viewport captures completed successfully.');
}
