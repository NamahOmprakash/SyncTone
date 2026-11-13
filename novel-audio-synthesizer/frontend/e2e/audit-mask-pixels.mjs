import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REF_DIR = path.resolve(__dirname, '../../../docs/screenshots/theme-diff/ref');
const ORANGE_DIR = path.resolve(__dirname, '../../../docs/screenshots/theme-diff/orange');

async function auditDifferingPixels() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const files = fs.readdirSync(REF_DIR).filter(f => f.endsWith('.png'));
  console.log(`Auditing 40 screen pairs for outside-accent drift...`);

  const auditReport = [];

  for (const file of files) {
    const refPath = path.join(REF_DIR, file);
    const orangePath = path.join(ORANGE_DIR, file);

    const refB64 = fs.readFileSync(refPath).toString('base64');
    const orangeB64 = fs.readFileSync(orangePath).toString('base64');

    const result = await page.evaluate(async ({ refB64, orangeB64 }) => {
      function loadImage(b64) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = `data:image/png;base64,${b64}`;
        });
      }

      const imgRef = await loadImage(refB64);
      const imgOrange = await loadImage(orangeB64);
      const w = imgRef.naturalWidth;
      const h = imgRef.naturalHeight;

      const c1 = document.createElement('canvas');
      c1.width = w; c1.height = h;
      const ctx1 = c1.getContext('2d');
      ctx1.drawImage(imgRef, 0, 0);
      const d1 = ctx1.getImageData(0, 0, w, h).data;

      const c2 = document.createElement('canvas');
      c2.width = w; c2.height = h;
      const ctx2 = c2.getContext('2d');
      ctx2.drawImage(imgOrange, 0, 0);
      const d2 = ctx2.getImageData(0, 0, w, h).data;

      // Identify diff pixels
      const diffGrid = new Uint8Array(w * h);
      let totalDiff = 0;

      for (let i = 0, p = 0; i < d1.length; i += 4, p++) {
        const delta = Math.abs(d1[i] - d2[i]) +
                      Math.abs(d1[i+1] - d2[i+1]) +
                      Math.abs(d1[i+2] - d2[i+2]) +
                      Math.abs(d1[i+3] - d2[i+3]);
        if (delta > 12) {
          diffGrid[p] = 1;
          totalDiff++;
        }
      }

      // Check for each diff pixel whether it is an accent pixel or directly connected to one
      // An accent pixel in ref has reddish/cinnabar hue: r > b + 15 and r > g - 20 (red-dominant)
      // or in orange has orange hue: r > b + 30 and g > b (orange-dominant)
      // or is text directly sitting on an accent surface/button (white/black text)
      // Any diff pixel that is NOT an accent pixel and NOT adjacent to an accent pixel is "outside accent".

      const isAccentColor = (r, g, b) => {
        // Cinnabar/Orange: Red-dominant or orange tone
        const redDominant = (r > 120 && r > b * 1.3 && (r > g || Math.abs(r - g) < 60));
        // Subtle accent surface tint:
        const tint = (r > g && r > b && (r - b) > 10);
        return redDominant || tint;
      };

      let outsideAccent = 0;
      let edgeAntiAliasing = 0;
      let primaryAccent = 0;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x);
          if (diffGrid[idx] === 1) {
            const pi = idx * 4;
            const r1 = d1[pi], g1 = d1[pi+1], b1 = d1[pi+2];
            const r2 = d2[pi], g2 = d2[pi+1], b2 = d2[pi+2];

            const refAccent = isAccentColor(r1, g1, b1);
            const orangeAccent = isAccentColor(r2, g2, b2);

            if (refAccent || orangeAccent) {
              primaryAccent++;
            } else {
              // Check 2px neighborhood to see if it's edge anti-aliasing of an accent pixel
              let neighborAccent = false;
              for (let dy = -2; dy <= 2 && !neighborAccent; dy++) {
                for (let dx = -2; dx <= 2 && !neighborAccent; dx++) {
                  const ny = y + dy;
                  const nx = x + dx;
                  if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                    const npi = (ny * w + nx) * 4;
                    if (isAccentColor(d1[npi], d1[npi+1], d1[npi+2]) ||
                        isAccentColor(d2[npi], d2[npi+1], d2[npi+2])) {
                      neighborAccent = true;
                    }
                  }
                }
              }

              if (neighborAccent) {
                edgeAntiAliasing++;
              } else {
                outsideAccent++;
              }
            }
          }
        }
      }

      return {
        totalDiff,
        primaryAccent,
        edgeAntiAliasing,
        outsideAccent
      };
    }, { refB64, orangeB64 });

    auditReport.push({
      file,
      ...result
    });

    console.log(`[${file}] Total diff: ${result.totalDiff} | Primary Accent: ${result.primaryAccent} | Edge AA: ${result.edgeAntiAliasing} | Outside Accent: ${result.outsideAccent}`);
  }

  await browser.close();

  fs.writeFileSync(
    path.resolve(__dirname, '../../../docs/screenshots/theme-diff/outside-accent-audit.json'),
    JSON.stringify(auditReport, null, 2)
  );
}

auditDifferingPixels().catch(console.error);

