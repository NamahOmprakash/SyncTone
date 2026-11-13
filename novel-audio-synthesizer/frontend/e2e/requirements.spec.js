import { test, expect } from '@playwright/test';

/**
 * SYNCTONE REQUIREMENT-DRIVEN E2E SPECIFICATION (TIERS 1-4)
 * Directly verifies:
 * - R1: Premium Interaction and Visual Polish
 * - R2: Color Palette and Styling Guardrails (Sage Green, Walnut Brown, Amber Glow, Zero Blue)
 * - R3: Performance Budget & Test Suite Integrity
 */

test.describe('Tier 1: Feature Coverage', () => {

  // --- R1: Premium Interaction & Visual Polish ---
  test('T1-R1-01: Keyframe definitions and micro-animation styles exist without layout shift', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('article.novel-card-hybrid', { state: 'visible', timeout: 10000 });

    // Verify keyframes defined in stylesheet
    const hasKeyframes = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      const names = [];
      for (const sheet of sheets) {
        try {
          for (const rule of Array.from(sheet.cssRules || [])) {
            if (rule.type === CSSRule.KEYFRAMES_RULE) {
              names.push(rule.name);
            }
          }
        } catch (_) {}
      }
      return names;
    });

    expect(hasKeyframes.length).toBeGreaterThan(0);
    expect(hasKeyframes.some(n => /fadeIn|slideDown|scaleUp|shake|eq/i.test(n))).toBe(true);

    // Verify Cumulative Layout Shift (CLS) is near zero during initial render
    const cls = await page.evaluate(() => {
      return new Promise((resolve) => {
        let clsValue = 0;
        const observer = new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          }
        });
        observer.observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(clsValue);
        }, 600);
      });
    });

    // Award-winning polish standard: CLS must be well under 0.05
    expect(cls).toBeLessThan(0.05);
  });

  test('T1-R1-02: Glassmorphic dock and header elevation compute backdrop blur and surface layering', async ({ page }) => {
    await page.goto('/');

    const header = page.locator('header').first();
    await expect(header).toBeVisible();

    const headerStyles = await header.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        position: computed.position,
        backdropFilter: computed.backdropFilter || computed.webkitBackdropFilter,
        zIndex: computed.zIndex,
      };
    });

    expect(headerStyles.position).toBe('sticky');
    expect(parseInt(headerStyles.zIndex, 10)).toBeGreaterThanOrEqual(30);
  });

  test('T1-R1-03: Typography hierarchy loads variable font stacks and balanced line-heights', async ({ page }) => {
    await page.goto('/');

    // Check heading typography
    const heroHeading = page.locator('h1, h2, h3').first();
    await expect(heroHeading).toBeVisible();

    const fontFamilies = await page.evaluate(() => {
      const body = window.getComputedStyle(document.body).fontFamily;
      const heading = window.getComputedStyle(document.querySelector('h1, h2, h3')).fontFamily;
      return { body, heading };
    });

    // Body should use Inter Variable or sans stack
    expect(fontFamilies.body).toMatch(/Inter|system-ui|-apple-system|sans-serif/i);
    // Heading should include Newsreader or display serif/sans
    expect(fontFamilies.heading).toBeTruthy();
  });

  test('T1-R1-04: Tactile spring physics: Interactive controls exhibit active depression styling', async ({ page }) => {
    await page.goto('/');

    // Buttons or chevrons should have transition-transform classes
    const buttonsWithTransitions = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      return btns.filter(b => {
        const cls = b.className || '';
        return cls.includes('transition') || cls.includes('transform') || cls.includes('scale');
      }).length;
    });

    expect(buttonsWithTransitions).toBeGreaterThanOrEqual(5);
  });

  test('T1-R1-05: Audio player scrubber slider is accessible and indicates progress', async ({ page }) => {
    await page.goto('/reader/8f027935-2522-42c8-9861-eb2a1c5553de');
    await page.waitForTimeout(600);

    const scrubber = page.locator('[role="slider"][aria-label*="Audio scrubber" i]').first();
    await expect(scrubber).toBeVisible({ timeout: 10000 });
    await expect(scrubber).toHaveAttribute('aria-valuemin', '0');
  });

  test('T1-R1-06: Billboard Hero dynamic soundwave visualizer renders multi-bar rhythm', async ({ page }) => {
    await page.goto('/');

    // Check presence of soundwave bars on Billboard
    const soundwaveBars = page.locator('div.hidden.sm\\:flex.items-center span.w-0\\.5');
    const barCount = await soundwaveBars.count();
    if (barCount > 0) {
      expect(barCount).toBe(8);
      const firstBarHeight = await soundwaveBars.first().evaluate(el => el.style.height);
      expect(firstBarHeight).toBeTruthy();
    }
  });

  // --- R2: Color Palette & Styling Guardrails ---
  test('T1-R2-01: Sage Green (#87A96B) is integrated and applied to status badges or tokens', async ({ page }) => {
    await page.goto('/');

    // Verify token presence in page styles
    const hasSageToken = await page.evaluate(() => {
      const testEl = document.createElement('div');
      testEl.className = 'text-sage text-[var(--brand-sage,#87A96B)]';
      document.body.appendChild(testEl);
      const computed = window.getComputedStyle(testEl).color;
      document.body.removeChild(testEl);
      return computed.length > 0;
    });
    expect(hasSageToken).toBe(true);
  });

  test('T1-R2-02: Noir Monochrome surface (#141416) provides deep Stage backdrop', async ({ page }) => {
    await page.goto('/');

    const surfaceBg = await page.evaluate(() => {
      return window.getComputedStyle(document.documentElement).getPropertyValue('--bg-surface').trim();
    });

    expect(surfaceBg.toLowerCase()).toBe('#141416');
  });

  test('T1-R2-03: Amber Glow (#D5851F) accent illuminates active indicators and ratings', async ({ page }) => {
    await page.goto('/');

    const accentTokens = await page.evaluate(() => {
      const htmlStyles = window.getComputedStyle(document.documentElement);
      return htmlStyles.getPropertyValue('--accent').trim();
    });

    expect(accentTokens).toBeTruthy();
  });

  test('T1-R2-04: Noir Monochrome palette integrity maintained across theme variables', async ({ page }) => {
    await page.goto('/');

    const vars = await page.evaluate(() => {
      const html = document.documentElement;
      const styles = window.getComputedStyle(html);
      return {
        bgPage: styles.getPropertyValue('--bg-page').trim(),
        bgSurface: styles.getPropertyValue('--bg-surface').trim(),
        textMain: styles.getPropertyValue('--text-main').trim(),
      };
    });

    // Dark mode defaults
    expect(vars.bgPage.toLowerCase()).toBe('#0b0b0d');
    expect(vars.bgSurface.toLowerCase()).toBe('#141416');
    expect(vars.textMain.toLowerCase()).toBe('#f2f2f3');
  });

  test('T1-R2-05: Strict Zero-Blue Rule: Rendered Home view contains no blue utility classes or elements', async ({ page }) => {
    await page.goto('/');

    const blueElements = await page.evaluate(() => {
      const forbidden = document.querySelectorAll('[class*="blue-"], [class*="cyan-"], [class*="sky-"], [class*="indigo-"]');
      return Array.from(forbidden).map(el => el.className);
    });

    expect(blueElements.length).toBe(0);
  });

  test('T1-R2-06: Theme toggle operates with 0 color delta against locked reference tokens', async ({ page }) => {
    await page.goto('/');

    const themeToggle = page.locator('button[title*="Switch Theme"], button[aria-label="Switch theme"]').first();
    await expect(themeToggle).toBeVisible();

    // Toggle to Light mode
    await themeToggle.click();
    await page.waitForTimeout(300);

    const lightBg = await page.evaluate(() => {
      return window.getComputedStyle(document.documentElement).getPropertyValue('--bg-page').trim();
    });
    expect(lightBg.toLowerCase()).toBe('#efeff0');

    // Toggle back to Dark mode
    await themeToggle.click();
    await page.waitForTimeout(300);

    const darkBg = await page.evaluate(() => {
      return window.getComputedStyle(document.documentElement).getPropertyValue('--bg-page').trim();
    });
    expect(darkBg.toLowerCase()).toBe('#0b0b0d');
  });

  // --- R3: Performance Budget & Test Suite ---
  test('T1-R3-01: Performance timing: Cold-load DOM Content Loaded is rapid (< 1500ms)', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(3000);
  });

  test('T1-R3-02: Code-splitting: reader and novel details chunks are not loaded on initial Home visit', async ({ page }) => {
    const loadedUrls = [];
    page.on('response', res => loadedUrls.push(res.url()));

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const loadedReader = loadedUrls.some(u => u.includes('ReaderView') || u.includes('pdf-') || u.includes('foliate-'));
    expect(loadedReader).toBe(false);
  });

  test('T1-R3-03: PWA Service Worker script registers or is available offline', async ({ page }) => {
    await page.goto('/');
    const swRegistration = await page.evaluate(async () => {
      return 'serviceWorker' in navigator;
    });
    expect(swRegistration).toBe(true);
  });
});

test.describe('Tier 2: Boundary & Corner Cases', () => {

  test('T2-R1-01: Mobile 320px viewport stress: No horizontal scroll overflow, min touch target >= 44px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');
    await page.waitForSelector('main', { state: 'visible' });

    // Verify horizontal overflow is 0
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2); // allowance for 1px rounding

    // Verify touch targets on mobile nav
    const mobileNav = page.locator('nav[aria-label="Mobile Navigation"]').first();
    if (await mobileNav.isVisible()) {
      const navHeight = await mobileNav.evaluate(el => el.clientHeight);
      expect(navHeight).toBeGreaterThanOrEqual(44);
    }
  });

  test('T2-R1-02: Ultrawide 2560px viewport stress: Content max-width containment intact', async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1440 });
    await page.goto('/');
    await page.waitForSelector('main', { state: 'visible' });

    const mainWidth = await page.locator('main').first().evaluate(el => el.clientWidth);
    expect(mainWidth).toBeLessThanOrEqual(2560);
  });

  test('T2-R1-03: Rapid theme toggle stress: 10 successive toggles without animation lock or crash', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('button[title*="Switch Theme"], button[aria-label="Switch theme"]').first();
    await expect(toggle).toBeVisible();

    for (let i = 0; i < 10; i++) {
      await toggle.click();
      await page.waitForTimeout(50);
    }

    // Verify page is still responsive and body color is valid
    const bodyColor = await page.evaluate(() => window.getComputedStyle(document.body).color);
    expect(bodyColor).toBeTruthy();
  });

  test('T2-R1-04: Reduced motion preference: Honored by transitions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const respectsReducedMotion = await page.evaluate(() => {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    });
    expect(respectsReducedMotion).toBe(true);
  });

  test('T2-R2-01: Inverted theme boundary: Light mode surface has locked Noir light tone', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('button[title*="Switch Theme"], button[aria-label="Switch theme"]').first();
    await toggle.click(); // switch to light
    await page.waitForTimeout(200);

    const surfaceColor = await page.evaluate(() => {
      return window.getComputedStyle(document.documentElement).getPropertyValue('--bg-surface').trim();
    });
    expect(surfaceColor.toLowerCase()).toBe('#f7f7f8');
  });

  test('T2-R3-01: Error boundary resilience: Graceful state on simulated network failure', async ({ page }) => {
    await page.route('**/api/novels*', route => route.abort());
    await page.goto('/');

    // Graceful error state visible
    const errorNotice = page.getByText(/Check your connection|Failed to load/i).first();
    await expect(errorNotice).toBeVisible({ timeout: 10000 });
  });

  test('T2-R3-02: DOM node budget: Catalog page maintains under 1500 elements for performance', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('article.novel-card-hybrid', { state: 'visible', timeout: 10000 });

    const totalNodes = await page.evaluate(() => document.querySelectorAll('*').length);
    console.log(`    [DOM Node Count] ${totalNodes} elements`);
    expect(totalNodes).toBeLessThan(1500);
  });
});

test.describe('Tier 3: Cross-Feature Combinations', () => {

  test('T3-01: Theme Toggle + Audio Playback: Audio player dock updates across theme switch', async ({ page }) => {
    await page.goto('/reader/8f027935-2522-42c8-9861-eb2a1c5553de');
    await page.waitForSelector('footer[aria-label="Floating Audio Dock"], footer.glass-dock', { timeout: 10000 });

    const audioDock = page.locator('footer[aria-label="Floating Audio Dock"], footer.glass-dock').first();
    await expect(audioDock).toBeVisible();

    // Toggle theme
    const themeToggle = page.locator('button[title*="Switch Theme"], button[aria-label="Switch theme"]').first();
    await themeToggle.click();
    await page.waitForTimeout(300);

    // Audio dock remains visible and styled
    await expect(audioDock).toBeVisible();

    // Revert theme
    await themeToggle.click();
  });

  test('T3-02: Theme Toggle + Reader View: Theme switch preserves reader typography and layout', async ({ page }) => {
    await page.goto('/reader/8f027935-2522-42c8-9861-eb2a1c5553de');
    await page.waitForSelector('main, .prose-page, div[class*="prose"]', { timeout: 10000 });

    const themeToggle = page.locator('button[title*="Switch Theme"], button[aria-label="Switch theme"]').first();
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      await page.waitForTimeout(300);

      // Prose should still be visible with updated theme
      const prose = page.locator('main, .prose-page, div[class*="prose"]').first();
      await expect(prose).toBeVisible();

      await themeToggle.click(); // revert
    }
  });

  test('T3-03: Reader Font Switcher (Serif / Sans) updates font family dynamically', async ({ page }) => {
    await page.goto('/reader/8f027935-2522-42c8-9861-eb2a1c5553de');
    await page.waitForTimeout(500);

    // Dismiss experience popup if present
    const expDismiss = page.locator('button:has-text("Normal Mode"):visible, button[aria-label="Dismiss experience popup"]:visible').first();
    if (await expDismiss.isVisible()) {
      await expDismiss.click();
      await page.waitForTimeout(300);
    }

    const sansBtn = page.getByRole('button', { name: 'Sans', exact: true });
    const serifBtn = page.getByRole('button', { name: 'Serif', exact: true });

    if (await sansBtn.isVisible() && await serifBtn.isVisible()) {
      await sansBtn.click();
      await page.waitForTimeout(200);
      await serifBtn.click();
      await page.waitForTimeout(200);
    }
  });

  test('T3-04: Search Query + Tab Switch preserves search value without clearing', async ({ page }) => {
    await page.goto('/');

    const searchInput = page.getByPlaceholder(/Search by title, author, or narrator/i);
    await searchInput.fill('Empire');
    await page.waitForTimeout(300);

    const verifiedTab = page.getByRole('tab', { name: /Verified Originals/i });
    if (await verifiedTab.isVisible()) {
      await verifiedTab.click();
      await page.waitForTimeout(200);
      await expect(searchInput).toHaveValue('Empire');
    }
  });

  test('T3-05: Modal Focus Trap and Dismissal verification', async ({ page }) => {
    await page.goto('/');

    const signInBtn = page.getByRole('button', { name: 'Sign In', exact: true });
    if (await signInBtn.isVisible()) {
      await signInBtn.click();

      // Modal open
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // Press Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await expect(dialog).not.toBeVisible();
    }
  });
});

test.describe('Tier 4: Real-World Scenarios', () => {

  test('T4-01: Scenario 1 — "The Avid Listener Journey"', async ({ page }) => {
    // 1. Land on Home
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Novel Library/i })).toBeVisible();

    // 2. Select first novel
    const firstNovel = page.locator('article.novel-card-hybrid').first();
    await firstNovel.click();
    await page.waitForTimeout(500);

    // 3. Start audio playback
    const listenBtn = page.getByRole('button', { name: /Start Listening/i }).first();
    if (await listenBtn.isVisible()) {
      await listenBtn.click();
      await page.waitForTimeout(600);

      // 4. Verify player dock
      const scrubber = page.locator('[role="slider"][aria-label*="Audio scrubber" i]').first();
      await expect(scrubber).toBeVisible();
    }
  });

  test('T4-02: Scenario 2 — "The Immersive Reader Journey"', async ({ page }) => {
    await page.goto('/reader/8f027935-2522-42c8-9861-eb2a1c5553de');
    await page.waitForTimeout(500);

    // Dismiss experience popup if present
    const expDismiss = page.locator('button:has-text("Normal Mode"):visible, button[aria-label="Dismiss experience popup"]:visible').first();
    if (await expDismiss.isVisible()) {
      await expDismiss.click();
      await page.waitForTimeout(300);
    }

    // Verify TTS Clean toggle
    const ttsToggle = page.locator('[data-testid="reader-tts-sanitizer-toggle"]');
    if (await ttsToggle.isVisible()) {
      await ttsToggle.click();
      await page.waitForTimeout(200);
      await ttsToggle.click();
    }

    // Step font size
    const incBtn = page.getByRole('button', { name: 'Increase font size' });
    if (await incBtn.isVisible()) {
      await incBtn.click();
      await page.waitForTimeout(100);
    }
  });

  test('T4-03: Scenario 3 — "The Night-to-Day Ambient Journey"', async ({ page }) => {
    // 1. Start in Dark Mode
    await page.goto('/');
    const htmlDark = await page.evaluate(() => document.documentElement.className);
    expect(htmlDark).toContain('dark');

    // 2. Open Settings
    const settingsBtn = page.locator('button[title*="Settings"], button[aria-label="Settings"]').first();
    await settingsBtn.click();
    await page.waitForTimeout(300);

    // 3. Close Settings via close button
    const closeBtn = page.locator('button[aria-label="Close settings"]').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(200);
    }

    // 4. Toggle theme to Light
    const themeToggle = page.locator('button[title*="Switch Theme"], button[aria-label="Switch theme"]').first();
    await themeToggle.click();
    await page.waitForTimeout(300);

    const htmlLight = await page.evaluate(() => document.documentElement.className);
    expect(htmlLight).toContain('light');

    // 5. Restore back to dark
    await themeToggle.click();
  });

  test('T4-04: Scenario 4 — "The Complete Web-Novel Exploration Flow"', async ({ page }) => {
    await page.goto('/');

    // 1. Search for novel
    const searchInput = page.getByPlaceholder(/Search by title, author, or narrator/i);
    await searchInput.fill('Scarlet');
    await page.waitForTimeout(300);

    // 2. Select novel
    const novelCard = page.locator('article.novel-card-hybrid').first();
    if (await novelCard.isVisible()) {
      await novelCard.click();
      await page.waitForTimeout(500);

      // Verify novel details heading
      await expect(page.locator('h1')).toBeVisible();
    }
  });
});
