import { chromium } from '@playwright/test';
import path from 'path';

async function capture() {
  const artifactDir = '/Users/mohdfaizankhan/.gemini/antigravity/brain/da99ff54-aab7-4185-8fbe-77633dd4e9bb';
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // 1. Home Catalog on 5173
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(artifactDir, 'synctone_production_home_5173.png') });
  console.log('✓ Captured synctone_production_home_5173.png');

  // 2. Click + VOICES -> Voice Studio
  await page.click('button:has-text("+ VOICES")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(artifactDir, 'synctone_production_voice_studio.png') });
  console.log('✓ Captured synctone_production_voice_studio.png');

  // 3. Click + READER -> Synchronized Reader
  await page.click('button:has-text("+ READER")');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(artifactDir, 'synctone_production_reader.png') });
  console.log('✓ Captured synctone_production_reader.png');

  await browser.close();
}

capture().catch((e) => {
  console.error(e);
  process.exit(1);
});

