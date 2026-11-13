import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5180;
const BACKEND_URL = 'http://localhost:4000';
const DIST_DIR = path.resolve(__dirname, '../dist');

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

const VIEWPORTS = [
  { width: 1440, height: 900, label: '1440x900' },
  { width: 1190, height: 770, label: '1190x770' }
];

const THEMES = ['dark', 'light'];

export async function captureAllScreens(outSubdir = 'ref') {
  const targetDir = path.resolve(__dirname, `../../../docs/screenshots/theme-diff/${outSubdir}`);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const server = createStaticServer();
  await new Promise(r => server.listen(PORT, r));
  console.log(`Server running on port ${PORT} capturing to ${outSubdir}...`);

  const browser = await chromium.launch({ headless: true });

  try {
    for (const vp of VIEWPORTS) {
      for (const theme of THEMES) {
        console.log(`\n=== Viewport: ${vp.label} | Theme: ${theme} ===`);
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          reducedMotion: 'reduce'
        });
        const page = await context.newPage();

        async function initPage(pathUrl = '/', mockAdmin = false) {
          if (mockAdmin) {
            await page.route('**/api/auth/me', route => {
              route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ user: { id: 'admin1', username: 'admin', role: 'admin' } })
              });
            });
          } else {
            await page.unroute('**/api/auth/me').catch(() => {});
          }
          await page.goto(`http://localhost:${PORT}${pathUrl}`, { waitUntil: 'networkidle' });
          await page.evaluate((t) => {
            localStorage.setItem('synctone_theme', t);
            document.documentElement.className = t;
          }, theme);
          await page.reload({ waitUntil: 'networkidle' });
          await page.waitForTimeout(400);
          await page.evaluate((t) => { document.documentElement.className = t; }, theme);
          await page.waitForTimeout(200);
        }

        // 1. Home
        try {
          await initPage('/');
          const homePath = path.join(targetDir, `home-${theme}-${vp.label}.png`);
          await page.screenshot({ path: homePath });
          console.log(`  Captured Home: ${homePath}`);
        } catch (e) { console.error('  Failed Home:', e.message); }

        // 2. Novel Detail
        try {
          const card = page.locator('.preview-card-container, article, .novel-card-hybrid, div[class*="group cursor-pointer"]').first();
          if (await card.count() > 0) {
            await card.click({ timeout: 5000 });
            await page.waitForTimeout(600);
            await page.evaluate((t) => { document.documentElement.className = t; }, theme);
            const detailPath = path.join(targetDir, `novel-detail-${theme}-${vp.label}.png`);
            await page.screenshot({ path: detailPath });
            console.log(`  Captured Novel Detail: ${detailPath}`);

            // 3. Reader (Normal)
            const readBtn = page.locator('button:has-text("Start Reading"), button:has-text("Start Listening"), button:has-text("Read & Listen"), button:has-text("Read Chapter"), button:has-text("Read")').first();
            if (await readBtn.count() > 0) {
              await readBtn.click({ timeout: 5000 });
              await page.waitForTimeout(800);
              await page.evaluate((t) => { document.documentElement.className = t; }, theme);
              const readerNormalPath = path.join(targetDir, `reader-normal-${theme}-${vp.label}.png`);
              await page.screenshot({ path: readerNormalPath });
              console.log(`  Captured Reader Normal: ${readerNormalPath}`);

              // 4. Reader (3D)
              const toggle3d = page.locator('button:has-text("OpenGL 3D"), button:has-text("3D"), button[aria-label*="3D"]').first();
              if (await toggle3d.count() > 0) {
                await toggle3d.click({ timeout: 5000 });
                await page.waitForTimeout(800);
                await page.evaluate((t) => { document.documentElement.className = t; }, theme);
                const reader3dPath = path.join(targetDir, `reader-3d-${theme}-${vp.label}.png`);
                await page.screenshot({ path: reader3dPath });
                console.log(`  Captured Reader 3D: ${reader3dPath}`);
              } else {
                fs.copyFileSync(readerNormalPath, path.join(targetDir, `reader-3d-${theme}-${vp.label}.png`));
              }
            }
          }
        } catch (e) { console.error('  Failed Detail/Reader:', e.message); }

        // 5. Settings Modal
        try {
          await initPage('/');
          const settingsBtn = page.locator('aside button[title*="Settings"], aside button[title*="TTS"], header button[aria-label*="Settings"], header button[aria-label*="TTS"], button[aria-label*="Settings"]:visible').first();
          if (await settingsBtn.count() > 0) {
            await settingsBtn.click({ timeout: 5000 });
            await page.waitForTimeout(500);
            await page.evaluate((t) => { document.documentElement.className = t; }, theme);
            const settingsPath = path.join(targetDir, `settings-${theme}-${vp.label}.png`);
            await page.screenshot({ path: settingsPath });
            console.log(`  Captured Settings: ${settingsPath}`);
          }
        } catch (e) { console.error('  Failed Settings:', e.message); }

        // 6. Auth Modal
        try {
          await initPage('/');
          const authBtn = page.locator('header button:has-text("Sign In"), aside button[aria-label*="User Account"], button[aria-label*="Account / Sign In"]:visible, button:has-text("Sign In"):visible').first();
          if (await authBtn.count() > 0) {
            await authBtn.click({ timeout: 5000 });
            await page.waitForTimeout(500);
            await page.evaluate((t) => { document.documentElement.className = t; }, theme);
            const authPath = path.join(targetDir, `auth-${theme}-${vp.label}.png`);
            await page.screenshot({ path: authPath });
            console.log(`  Captured Auth: ${authPath}`);
          }
        } catch (e) { console.error('  Failed Auth:', e.message); }

        // 7. Add Novel Modal
        try {
          await initPage('/', true);
          const addNovelBtn = page.locator('button:visible:has-text("Add Novel")').first();
          if (await addNovelBtn.count() > 0) {
            await addNovelBtn.click({ timeout: 5000 });
            await page.waitForTimeout(600);
            await page.evaluate((t) => { document.documentElement.className = t; }, theme);
            const addNovelPath = path.join(targetDir, `add-novel-${theme}-${vp.label}.png`);
            await page.screenshot({ path: addNovelPath });
            console.log(`  Captured Add Novel: ${addNovelPath}`);
          }
        } catch (e) { console.error('  Failed Add Novel:', e.message); }

        // 8. Upload Chapter Modal
        try {
          await initPage('/', true);
          const card2 = page.locator('.preview-card-container, article, .novel-card-hybrid, div[class*="group cursor-pointer"]').first();
          if (await card2.count() > 0) {
            await card2.click({ timeout: 5000 });
            await page.waitForTimeout(600);
            const uploadChBtn = page.locator('button:visible:has-text("Upload Chapter")').first();
            if (await uploadChBtn.count() > 0) {
              await uploadChBtn.click({ timeout: 5000 });
              await page.waitForTimeout(600);
              await page.evaluate((t) => { document.documentElement.className = t; }, theme);
              const uploadChPath = path.join(targetDir, `upload-chapter-${theme}-${vp.label}.png`);
              await page.screenshot({ path: uploadChPath });
              console.log(`  Captured Upload Chapter: ${uploadChPath}`);
            }
          }
        } catch (e) { console.error('  Failed Upload Chapter:', e.message); }

        // 9. Cast Roster
        try {
          await initPage('/');
          const card3 = page.locator('.preview-card-container, article, .novel-card-hybrid, div[class*="group cursor-pointer"]').first();
          if (await card3.count() > 0) {
            await card3.click({ timeout: 5000 });
            await page.waitForTimeout(500);
            const rosterTab = page.locator('button:has-text("Characters"), button:has-text("Cast"), button[aria-label*="Character Roster"]').first();
            if (await rosterTab.count() > 0) {
              await rosterTab.click({ timeout: 5000 });
              await page.waitForTimeout(500);
              await page.evaluate((t) => { document.documentElement.className = t; }, theme);
              const rosterPath = path.join(targetDir, `cast-roster-${theme}-${vp.label}.png`);
              await page.screenshot({ path: rosterPath });
              console.log(`  Captured Cast Roster: ${rosterPath}`);
            }
          }
        } catch (e) { console.error('  Failed Cast Roster:', e.message); }

        // 10. Profile View
        try {
          await initPage('/profile');
          const profilePath = path.join(targetDir, `profile-${theme}-${vp.label}.png`);
          await page.screenshot({ path: profilePath });
          console.log(`  Captured Profile: ${profilePath}`);
        } catch (e) { console.error('  Failed Profile:', e.message); }

        await context.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }

  console.log(`\nCompleted capture for ${outSubdir}!`);
}

const mode = process.argv[2] || 'ref';
captureAllScreens(mode).catch(console.error);
