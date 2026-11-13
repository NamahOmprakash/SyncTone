import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REF_DIR = path.resolve(__dirname, '../../../docs/screenshots/theme-diff/ref');
const ORANGE_DIR = path.resolve(__dirname, '../../../docs/screenshots/theme-diff/orange');
const MASK_DIR = path.resolve(__dirname, '../../../docs/screenshots/theme-diff/masks');

if (!fs.existsSync(MASK_DIR)) {
  fs.mkdirSync(MASK_DIR, { recursive: true });
}

async function runDiff() {
  const files = fs.readdirSync(REF_DIR).filter(f => f.endsWith('.png'));
  console.log(`Found ${files.length} screenshots to compare...`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const results = [];

  for (const file of files) {
    const refPath = path.join(REF_DIR, file);
    const orangePath = path.join(ORANGE_DIR, file);
    const maskPath = path.join(MASK_DIR, file.replace('.png', '-mask.png'));

    if (!fs.existsSync(orangePath)) {
      console.warn(`Missing orange image for ${file}`);
      continue;
    }

    const refBase64 = fs.readFileSync(refPath).toString('base64');
    const orangeBase64 = fs.readFileSync(orangePath).toString('base64');

    const diffData = await page.evaluate(async ({ refBase64, orangeBase64 }) => {
      function loadImage(src) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
      }

      const imgRef = await loadImage(`data:image/png;base64,${refBase64}`);
      const imgOrange = await loadImage(`data:image/png;base64,${orangeBase64}`);

      const width = imgRef.naturalWidth;
      const height = imgRef.naturalHeight;

      const canvas1 = document.createElement('canvas');
      canvas1.width = width;
      canvas1.height = height;
      const ctx1 = canvas1.getContext('2d');
      ctx1.drawImage(imgRef, 0, 0);
      const dataRef = ctx1.getImageData(0, 0, width, height).data;

      const canvas2 = document.createElement('canvas');
      canvas2.width = width;
      canvas2.height = height;
      const ctx2 = canvas2.getContext('2d');
      ctx2.drawImage(imgOrange, 0, 0);
      const dataOrange = ctx2.getImageData(0, 0, width, height).data;

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = width;
      maskCanvas.height = height;
      const maskCtx = maskCanvas.getContext('2d');
      const maskImageData = maskCtx.createImageData(width, height);
      const maskData = maskImageData.data;

      let diffPixels = 0;
      const totalPixels = width * height;

      // Color distance threshold (allow minor 1-2 subpixel raster anti-aliasing variations)
      const THRESHOLD = 12;

      for (let i = 0; i < dataRef.length; i += 4) {
        const r1 = dataRef[i], g1 = dataRef[i + 1], b1 = dataRef[i + 2], a1 = dataRef[i + 3];
        const r2 = dataOrange[i], g2 = dataOrange[i + 1], b2 = dataOrange[i + 2], a2 = dataOrange[i + 3];

        const delta = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2) + Math.abs(a1 - a2);

        if (delta > THRESHOLD) {
          diffPixels++;
          // High-contrast electric magenta highlight for changed pixels
          maskData[i] = 255;      // R
          maskData[i + 1] = 0;    // G
          maskData[i + 2] = 128;  // B
          maskData[i + 3] = 255;  // A
        } else {
          // Dimmed grayscale background of the reference image
          const gray = Math.round(0.299 * r1 + 0.587 * g1 + 0.114 * b1) * 0.25;
          maskData[i] = gray;
          maskData[i + 1] = gray;
          maskData[i + 2] = gray;
          maskData[i + 3] = 255;
        }
      }

      maskCtx.putImageData(maskImageData, 0, 0);
      const maskPngBase64 = maskCanvas.toDataURL('image/png').split(',')[1];

      return {
        width,
        height,
        totalPixels,
        diffPixels,
        diffPercent: (diffPixels / totalPixels) * 100,
        maskPngBase64
      };
    }, { refBase64, orangeBase64 });

    fs.writeFileSync(maskPath, Buffer.from(diffData.maskPngBase64, 'base64'));

    results.push({
      file,
      width: diffData.width,
      height: diffData.height,
      totalPixels: diffData.totalPixels,
      diffPixels: diffData.diffPixels,
      diffPercent: diffData.diffPercent.toFixed(2),
      maskPath: path.relative(path.resolve(__dirname, '../../..'), maskPath)
    });

    console.log(`[${file}] Diff: ${diffData.diffPixels} px (${diffData.diffPercent.toFixed(2)}%) -> ${path.basename(maskPath)}`);
  }

  await browser.close();

  console.log('\n=== PIXEL DIFF SUMMARY TABLE ===\n');
  console.log('| Screen File | Viewport | Theme | Diff Pixels | Diff % | Mask Image |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const r of results) {
    const parts = r.file.replace('.png', '').split('-');
    const vp = parts.slice(-1)[0];
    const theme = parts.slice(-2)[0];
    const name = parts.slice(0, -2).join('-');
    console.log(`| ${name} | ${vp} | ${theme} | ${r.diffPixels.toLocaleString()} | ${r.diffPercent}% | \`${r.maskPath}\` |`);
  }

  const jsonSummaryPath = path.resolve(__dirname, '../../../docs/screenshots/theme-diff/diff-summary.json');
  fs.writeFileSync(jsonSummaryPath, JSON.stringify(results, null, 2));
  console.log(`\nDiff summary written to ${jsonSummaryPath}`);
}

runDiff().catch(console.error);

