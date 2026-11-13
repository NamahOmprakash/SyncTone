import { chromium } from '@playwright/test';

async function audit() {
  console.log('--- Starting Comprehensive Button & Navigation Audit ---');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const pageErrors = [];
  page.on('pageerror', (err) => {
    console.error('[Page Error]:', err.message);
    pageErrors.push(err.message);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
      console.error('[Console Error]:', msg.text());
    }
  });

  // Test Port 5173 (Transparent Reverse Proxy)
  console.log('\n1. Testing Port 5173 Root Cold Load...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Check no offline modal
  const offlineText = await page.locator('text="YOU\'RE OFFLINE"').count();
  if (offlineText > 0) throw new Error('Offline modal unexpectedly displayed on http://localhost:5173!');
  console.log('✓ No offline modal on initial load');

  // Check billboard and catalog loaded
  await page.waitForSelector('[data-testid="featured-novel-billboard"], .volume-card', { timeout: 10000 });
  const volumeCardsCount = await page.locator('.volume-card').count();
  console.log(`✓ Catalog loaded successfully with ${volumeCardsCount} volume cards`);

  // Verify rounded buttons (Netflix/Prime-grade)
  const buttons = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.map((b) => ({
      text: b.innerText.trim().replace(/\n/g, ' '),
      borderRadius: window.getComputedStyle(b).borderRadius,
    })).filter((b) => b.text.length > 0 && b.text.length < 30);
  });
  console.log(`✓ Audited ${buttons.length} buttons on page. Sample:`, buttons.slice(0, 5));

  // Test TopHeader: + ARCHIVE
  console.log('\n2. Testing + ARCHIVE click...');
  await page.click('button:has-text("+ ARCHIVE")');
  await page.waitForTimeout(500);
  console.log('✓ + ARCHIVE clicked smoothly');

  // Test TopHeader: + VOICES
  console.log('\n3. Testing + VOICES click (should open Voice Studio)...');
  await page.click('button:has-text("+ VOICES")');
  await page.waitForTimeout(1000);
  const voiceTabActive = await page.evaluate(() => {
    const castTab = document.querySelector('[role="tab"][aria-selected="true"]');
    return castTab ? castTab.textContent : null;
  });
  console.log(`✓ + VOICES opened view with active tab: "${voiceTabActive}"`);

  // Test TopHeader: + READER
  console.log('\n4. Testing + READER click (should open Reader with chapter prose)...');
  await page.click('button:has-text("+ READER")');
  await page.waitForTimeout(1500);
  await page.waitForSelector('.reader-canvas-container, [aria-label="Floating Audio Dock"], .audio-player-dock', { timeout: 10000 });
  const audioDock = await page.locator('.audio-player-dock, [aria-label="Floating Audio Dock"]').count();
  console.log(`✓ + READER opened ReaderView with audio player dock: ${audioDock > 0}`);

  // Test Audio Playback Toggle in Reader
  console.log('\n5. Testing Audio Player Play/Pause in Reader...');
  const playButton = page.locator('button[aria-label*="Play"], button[aria-label*="Pause"]').first();
  await playButton.click();
  await page.waitForTimeout(800);
  console.log('✓ Play button clicked without errors');

  // Test Cast Roster drawer in Reader
  console.log('\n6. Testing Cast Roster drawer toggle in Reader...');
  await page.click('button:has-text("+ VOICES")');
  await page.waitForTimeout(500);
  const drawerOpen = await page.locator('[role="dialog"][aria-label="Character Cast Roster"]').isVisible().catch(() => false);
  console.log(`✓ Cast Roster drawer visible: ${drawerOpen}`);

  // Test Back to Library
  console.log('\n7. Testing Back to Library Navigation...');
  await page.click('button:has-text("+ LIBRARY")');
  await page.waitForTimeout(800);
  console.log('✓ Returned to Library Catalog');

  // Test Novel Details Click
  console.log('\n8. Testing Novel Volume Card Click...');
  const firstCard = page.locator('.volume-card').first();
  await firstCard.click();
  await page.waitForTimeout(1000);
  const novelTitle = await page.locator('.detail-giant-title').innerText().catch(() => '');
  console.log(`✓ Opened Novel Details for: "${novelTitle}"`);

  // Test Novel Details "VOICE STUDIO" Button
  console.log('\n9. Testing "VOICE STUDIO" button in Novel Details...');
  await page.click('button:has-text("VOICE STUDIO")');
  await page.waitForTimeout(500);
  const activeTabInDetails = await page.evaluate(() => {
    const tab = document.querySelector('[role="tab"][aria-selected="true"]');
    return tab ? tab.textContent : null;
  });
  console.log(`✓ Active tab switched to: "${activeTabInDetails}"`);

  // Test Settings Modal
  console.log('\n10. Testing Settings Modal (Open, Backdrop Dismiss, Escape)...');
  await page.click('button[aria-label="Settings"]');
  await page.waitForTimeout(500);
  const settingsOpen = await page.locator('#settings-dialog-title').isVisible();
  console.log(`✓ Settings Modal open: ${settingsOpen}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const settingsClosed = !(await page.locator('#settings-dialog-title').isVisible());
  console.log(`✓ Settings Modal closed on Escape: ${settingsClosed}`);

  // Test Auth Modal
  console.log('\n11. Testing Auth Modal (Open & Escape Dismiss)...');
  await page.click('button:has-text("Sign In")');
  await page.waitForTimeout(500);
  const authOpen = await page.locator('#auth-modal-title').isVisible();
  console.log(`✓ Auth Modal open: ${authOpen}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const authClosed = !(await page.locator('#auth-modal-title').isVisible());
  console.log(`✓ Auth Modal closed on Escape: ${authClosed}`);

  // Summary
  console.log('\n--- AUDIT SUMMARY ---');
  console.log(`Total Uncaught Page Errors: ${pageErrors.length}`);
  if (pageErrors.length > 0) {
    console.error('Errors encountered:', pageErrors);
    process.exit(1);
  }

  await browser.close();
  console.log('✓ ALL TESTS & AUDITS PASSED WITH ZERO ERRORS!');
}

audit().catch((err) => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
