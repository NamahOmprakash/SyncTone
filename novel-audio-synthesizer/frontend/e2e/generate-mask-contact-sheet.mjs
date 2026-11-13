import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MASK_DIR = path.resolve(__dirname, '../../../docs/screenshots/theme-diff/masks');
const OUT_DIR = path.resolve(__dirname, '../../../docs/screenshots/theme-diff');

async function buildContactSheet() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const screens = [
    'home',
    'novel-detail',
    'reader-normal',
    'reader-3d',
    'settings',
    'auth',
    'add-novel',
    'upload-chapter',
    'cast-roster',
    'profile'
  ];

  for (const theme of ['dark', 'light']) {
    const images = [];
    for (const s of screens) {
      const filename = `${s}-${theme}-1440x900-mask.png`;
      const p = path.join(MASK_DIR, filename);
      if (fs.existsSync(p)) {
        images.push({ name: s, data: fs.readFileSync(p).toString('base64') });
      }
    }

    const sheetBase64 = await page.evaluate(async ({ images, theme }) => {
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
      const thumbW = 720;
      const thumbH = 450;
      const pad = 24;
      const headerH = 70;

      const totalW = cols * thumbW + (cols + 1) * pad;
      const totalH = rows * (thumbH + 30) + headerH + pad;

      const canvas = document.createElement('canvas');
      canvas.width = totalW;
      canvas.height = totalH;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#0F1117';
      ctx.fillRect(0, 0, totalW, totalH);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillText(`SyncTone Pixel-Diff Masks (${theme.toUpperCase()} MODE) — 1440x900`, pad, 45);

      for (let idx = 0; idx < images.length; idx++) {
        const item = images[idx];
        const img = await loadImage(item.data);
        const col = idx % cols;
        const row = Math.floor(idx / cols);

        const x = pad + col * (thumbW + pad);
        const y = headerH + row * (thumbH + 30 + pad);

        ctx.fillStyle = '#94A3B8';
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.fillText(`Screen: ${item.name}`, x, y + 18);

        ctx.drawImage(img, x, y + 26, thumbW, thumbH);

        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y + 26, thumbW, thumbH);
      }

      return canvas.toDataURL('image/png').split(',')[1];
    }, { images, theme });

    const outPath = path.join(OUT_DIR, `diff-masks-${theme}-contact-sheet.png`);
    fs.writeFileSync(outPath, Buffer.from(sheetBase64, 'base64'));
    console.log(`Saved contact sheet: ${outPath}`);
  }

  await browser.close();
}

buildContactSheet().catch(console.error);

