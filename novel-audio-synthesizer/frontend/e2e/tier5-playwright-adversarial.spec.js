import { test, expect } from '@playwright/test';

/**
 * TIER 5 PLAYWRIGHT ADVERSARIAL STRESS TEST SUITE
 * Live Browser Verification of Edge Cases:
 * 1. Audio Scrubber Boundaries (0ms, negative offset, rapid scrubbing, hover timecode)
 * 2. Theme Toggle Resilience (corrupt localStorage recovery, rapid switching, meta sync)
 * 3. Reduced-Motion Media Query Live Computation
 */

test.describe('Tier 5: Adversarial Coverage Hardening (Live Browser)', () => {

  test('T5-01: Audio Scrubber Boundaries — Negative offset and overshoot clicks do not produce NaN or out-of-bounds', async ({ page }) => {
    await page.goto('/reader/8f027935-2522-42c8-9861-eb2a1c5553de');
    await page.waitForSelector('footer[aria-label="Floating Audio Dock"], footer.glass-dock', { timeout: 10000 });

    const scrubber = page.locator('div[role="slider"][aria-label="Audio scrubber"]').first();
    await expect(scrubber).toBeVisible();

    const box = await scrubber.boundingBox();
    expect(box).toBeTruthy();

    // 1. Click at negative offset (30px to left of scrubber track)
    await page.mouse.click(box.x - 30, box.y + box.height / 2);
    await page.waitForTimeout(100);

    let valueNow = await scrubber.getAttribute('aria-valuenow');
    let valueMax = await scrubber.getAttribute('aria-valuemax');
    expect(Number(valueNow)).toBeGreaterThanOrEqual(0);
    expect(Number(valueNow)).toBeLessThanOrEqual(Number(valueMax));
    expect(isNaN(Number(valueNow))).toBe(false);

    // 2. Click at exact start (0ms boundary)
    await page.mouse.click(box.x, box.y + box.height / 2);
    await page.waitForTimeout(100);
    valueNow = await scrubber.getAttribute('aria-valuenow');
    expect(Number(valueNow)).toBe(0);

    // 3. Click at overshoot (30px to right of scrubber track)
    await page.mouse.click(box.x + box.width + 30, box.y + box.height / 2);
    await page.waitForTimeout(100);
    valueNow = await scrubber.getAttribute('aria-valuenow');
    expect(Number(valueNow)).toBeLessThanOrEqual(Number(valueMax));
    expect(isNaN(Number(valueNow))).toBe(false);

    // 4. Rapid Scrubbing across track
    for (let i = 0; i < 20; i++) {
      const targetX = box.x + (box.width * (i / 20));
      await page.mouse.move(targetX, box.y + box.height / 2);
    }

    // Verify hover preview timecode badge does not display NaN
    const hoverBadge = scrubber.locator('div.absolute.-top-7');
    if (await hoverBadge.isVisible()) {
      const badgeText = await hoverBadge.textContent();
      expect(badgeText).toMatch(/^\d{2}:\d{2}$/);
      expect(badgeText).not.toContain('NaN');
    }
  });

  test('T5-02: Theme Toggle Resilience — Corrupt localStorage recovery & rapid switching', async ({ page }) => {
    // 1. Inject corrupt theme string into localStorage before initial load
    await page.addInitScript(() => {
      localStorage.setItem('synctone_theme', 'corrupted_theme_!@#$');
    });

    await page.goto('/');
    await page.waitForSelector('article.novel-card-hybrid', { state: 'visible', timeout: 10000 });

    // Verify graceful fallback to 'dark'
    const htmlClass = await page.locator('html').getAttribute('class');
    expect(htmlClass).toContain('dark');

    const metaColor = await page.locator('#meta-theme-color').getAttribute('content');
    expect(metaColor).toBe('#0B0B0D');

    // 2. Rapid Theme Switch Stress (15 successive clicks with 30ms gap)
    const toggle = page.locator('button[title*="Switch Theme"], button[aria-label="Switch theme"]').first();
    await expect(toggle).toBeVisible();

    for (let i = 0; i < 15; i++) {
      await toggle.click();
      await page.waitForTimeout(30);
    }

    await page.waitForTimeout(300);

    // Verify page state remained intact and synchronized
    const finalClass = await page.locator('html').getAttribute('class');
    const isDark = finalClass.includes('dark');
    const isLight = finalClass.includes('light');
    expect(isDark !== isLight).toBe(true); // exactly one mode active

    const finalMeta = await page.locator('#meta-theme-color').getAttribute('content');
    if (isDark) {
      expect(finalMeta).toBe('#0B0B0D');
    } else {
      expect(finalMeta).toBe('#EFEFF0');
    }
  });

  test('T5-03: Reduced Motion Compliance — Keyframes disabled and computed styles report animation: none', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForSelector('article.novel-card-hybrid', { state: 'visible', timeout: 10000 });

    // Verify prefers-reduced-motion media query matches in DOM
    const matchesReduced = await page.evaluate(() => {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    });
    expect(matchesReduced).toBe(true);

    // Verify that elements with .animate-fadeInUp or .animate-slideDown have animation-name: none
    const animatedElements = await page.evaluate(() => {
      const elements = document.querySelectorAll('.animate-fade-in, .animate-slideDown, .animate-fadeInUp, .eq-bar-1, .eq-bar-2, .eq-bar-3');
      const results = [];
      for (const el of elements) {
        const computed = window.getComputedStyle(el);
        results.push({
          className: el.className,
          animationName: computed.animationName,
          animationDuration: computed.animationDuration,
        });
      }
      return results;
    });

    for (const item of animatedElements) {
      expect(['none', '0s', ''].some(v => item.animationName === v || item.animationDuration === '0s')).toBe(true);
    }
  });

});
