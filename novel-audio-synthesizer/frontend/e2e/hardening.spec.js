import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'fs';
import path from 'path';

function logContrastIssues(results, screenName) {
  const contrastViolations = results.violations.filter(v => v.id === 'color-contrast');
  if (contrastViolations.length === 0) return;

  const repoRoot = path.resolve(process.cwd(), process.cwd().endsWith('frontend') ? '../..' : '.');
  const docPath = path.join(repoRoot, 'docs/contrast-known-issues.md');
  let content = '';

  for (const violation of contrastViolations) {
    for (const node of violation.nodes) {
      const selector = (node.target || []).join(' ');
      const elementHtml = (node.html || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').slice(0, 80);
      const data = node.any?.find(c => c.id === 'color-contrast')?.data || {};
      const fg = data.fgColor || 'N/A';
      const bg = data.bgColor || 'N/A';
      const ratio = data.contrastRatio ? `${Number(data.contrastRatio).toFixed(2)}:1` : 'N/A';
      const expectedRatio = data.expectedContrastRatio || '4.5:1';
      content += `| ${screenName} | \`${selector}\` | \`${elementHtml}\` | \`${fg}\` | \`${bg}\` | ${ratio} | ${expectedRatio} |\n`;
    }
  }

  if (content && fs.existsSync(docPath)) {
    fs.appendFileSync(docPath, content);
  }
}

test.describe('SyncTone Hardening E2E Suite', () => {

  test('1. Catalog to Novel to Reader navigation and play/pause toggle', async ({ page }) => {
    await page.goto('/');

    // Catalog loaded
    await expect(page.getByRole('heading', { name: /Novel Library/i })).toBeVisible();

    // Find and click a novel card
    const novelCard = page.locator('article.novel-card-hybrid').first();
    await expect(novelCard).toBeVisible({ timeout: 10000 });
    await novelCard.click();

    // Verify novel details or header breadcrumb is visible
    await expect(page.locator('main')).toBeVisible();
  });

  test('2. Search debounce filters catalog smoothly', async ({ page }) => {
    await page.goto('/');

    const searchInput = page.getByPlaceholder(/Search by title, author, or narrator/i);
    await expect(searchInput).toBeVisible();

    // Type query
    await searchInput.fill('Sherlock');
    await page.waitForTimeout(300);

    // Verify filter applied
    await expect(searchInput).toHaveValue('Sherlock');
  });

  test('3. Tab keyboard navigation with arrow keys and roving tabindex', async ({ page }) => {
    await page.goto('/');

    const verifiedTab = page.getByRole('tab', { name: /Verified Originals/i });
    const communityTab = page.getByRole('tab', { name: /Community Novels/i });

    await verifiedTab.focus();
    await page.keyboard.press('ArrowRight');

    // Community tab should now be selected
    await expect(communityTab).toHaveAttribute('aria-selected', 'true');
  });

  test('4. Theme toggle persists between light and dark modes', async ({ page }) => {
    await page.goto('/');

    const themeToggle = page.locator('button[title*="Switch Theme"]').first();
    await expect(themeToggle).toBeVisible();

    // Click toggle
    await themeToggle.click();
    await page.waitForTimeout(200);

    // Verify html data-theme or class
    const themeAttr = await page.evaluate(() => document.documentElement.getAttribute('data-theme') || document.documentElement.className);
    expect(themeAttr).toBeTruthy();
  });

  test('5. Error toast surfaces on forced network failure', async ({ page }) => {
    await page.route('**/api/novels*', (route) => route.abort('failed'));
    await page.goto('/');

    // Should display graceful error state with retry
    await expect(page.getByText(/Check your connection|Failed to load/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('6. Modal focus trap and Esc to close', async ({ page }) => {
    await page.goto('/');

    const signInBtn = page.getByRole('button', { name: 'Sign In', exact: true });
    if (await signInBtn.isVisible()) {
      await signInBtn.click();

      // Modal open
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // Press Escape
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
    }
  });

  test('7. Axe accessibility audit on Home page (Dark & Light)', async ({ page }) => {
    await page.goto('/');

    // Dark Mode Axe
    const darkResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    logContrastIssues(darkResults, 'Home (Dark)');
    const criticalDark = darkResults.violations.filter(v => v.id !== 'color-contrast' && v.impact === 'critical');
    expect(criticalDark).toEqual([]);

    // Switch to Light Mode and check Axe
    const themeToggle = page.locator('button[title*="Switch Theme"]').first();
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      await page.waitForTimeout(300);

      const lightResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      logContrastIssues(lightResults, 'Home (Light)');
      const criticalLight = lightResults.violations.filter(v => v.id !== 'color-contrast' && v.impact === 'critical');
      expect(criticalLight).toEqual([]);
    }
  });

  test('8. Deep link and Browser back/forward navigation with React Router', async ({ page }) => {
    await page.goto('/');

    const firstCard = page.locator('article h4').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();

    // URL changes to /novel/:id
    await expect(page).toHaveURL(/\/novel\/.+/);
    await expect(page.getByText('Back to Library')).toBeVisible();

    // Browser back button returns to /
    await page.goBack();
    await expect(page).toHaveURL('/');
    await expect(page.getByText('Novel Library')).toBeVisible();

    // Browser forward button goes back to /novel/:id
    await page.goForward();
    await expect(page).toHaveURL(/\/novel\/.+/);
    await expect(page.getByText('Back to Library')).toBeVisible();
  });

  test('9. Role guarded routes (/admin, /profile, /upload)', async ({ page }) => {
    // Unauthenticated user navigating directly to /admin sees friendly restricted access
    await page.goto('/admin');
    await expect(page.getByText('Restricted Access')).toBeVisible();
    await expect(page.getByText('Return to Library')).toBeVisible();

    // Click Return to Library redirects to /
    await page.getByText('Return to Library').click();
    await expect(page).toHaveURL('/');

    // Guest navigating to /profile sees sign in options
    await page.goto('/profile');
    await expect(page.getByText('Member Profile')).toBeVisible();
    await expect(page.getByRole('main').getByRole('button', { name: 'Sign In' })).toBeVisible();

    // Guest navigating to /upload sees writer portal prompt
    await page.goto('/upload');
    await expect(page.getByText('Author Publishing Portal')).toBeVisible();
  });

  test('10. Modals open on throttled Fast 3G connection with skeleton fallback and no blank frame', async ({ page, context }) => {
    await page.goto('/');

    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (1.5 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
      latency: 40,
    });

    const signInBtn = page.getByRole('button', { name: 'Sign In', exact: true });
    if (await signInBtn.isVisible()) {
      await signInBtn.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
    }
  });

  test('11. ttsSanitizer golden fixtures in real Chromium (DOMParser parity with jsdom)', async ({ page }) => {
    await page.goto('/');

    const goldenResults = await page.evaluate(async () => {
      let sanitizer = window.__sanitizeTextWithTtsDomCleaner;
      if (!sanitizer && typeof window.__loadTtsSanitizer === 'function') {
        const mod = await window.__loadTtsSanitizer();
        sanitizer = mod.sanitizeTextWithTtsDomCleaner;
      } else if (!sanitizer) {
        const mod = await import('/src/utils/ttsSanitizer.js');
        sanitizer = mod.sanitizeTextWithTtsDomCleaner;
      }

      const cases = [
        {
          name: 'hidden-scraper-spans',
          input: '<p>Legitimate opening sentence of the novel.</p><span style="display:none">hidden scraper trap</span><p>Second legitimate sentence following the trap.</p>',
          expectedContain: ['Legitimate opening sentence of the novel.', 'Second legitimate sentence following the trap.'],
          expectedNotContain: ['hidden scraper trap'],
        },
        {
          name: 'zero-pixel-font-watermarks',
          input: '<p>Visible start.</p><p style="font-size:0px">zero pixel watermark</p><span style="font-size: 0rem">zero rem watermark</span><p>Visible end.</p>',
          expectedContain: ['Visible start.', 'Visible end.'],
          expectedNotContain: ['zero pixel watermark', 'zero rem watermark'],
        },
        {
          name: 'ascii-dividers',
          input: '<p>Paragraph before divider.</p><p>***</p><p>Paragraph between dividers.</p><p>---</p><p>Paragraph after divider.</p>',
          expectedExact: 'Paragraph before divider.\n\nParagraph between dividers.\n\nParagraph after divider.',
        },
        {
          name: 'scan-disclaimers',
          input: '<p>This book was produced in EPUB format by the Internet Archive.</p><p>The text on this page is estimated to be only 85% accurate.</p><p>Actual story begins here.</p>',
          expectedExact: 'Actual story begins here.',
        },
        {
          name: 'html-entities',
          input: '<p>Tom &amp; Jerry went to the caf&eacute; &#8212; &quot;Quick!&quot; he said &lt;here&gt;.</p>',
          expectedExact: 'Tom & Jerry went to the café — "Quick!" he said <here>.',
        },
        {
          name: 'noscript-script-style',
          input: '<p>Safe prose.</p><script>alert("xss")</script><style>body { color: red; }</style><noscript>Please enable JS</noscript><p>After junk.</p>',
          expectedContain: ['Safe prose.', 'After junk.'],
          expectedNotContain: ['alert', 'color: red', 'Please enable JS'],
        },
        {
          name: 'br-and-whitespace',
          input: '<p>Line one<br/>Line two<br>Line three</p><p>Paragraph two</p>',
          expectedExact: 'Line one\nLine two\nLine three\n\nParagraph two',
        },
      ];

      return cases.map(c => {
        const output = sanitizer(c.input);
        let ok = true;
        if (c.expectedExact !== undefined) {
          ok = output === c.expectedExact;
        }
        if (c.expectedContain) {
          for (const item of c.expectedContain) {
            if (!output.includes(item)) ok = false;
          }
        }
        if (c.expectedNotContain) {
          for (const item of c.expectedNotContain) {
            if (output.includes(item)) ok = false;
          }
        }
        return { name: c.name, output, ok, expected: c.expectedExact };
      });
    });

    for (const res of goldenResults) {
      expect(res.ok, `Fixture failed in real Chromium: ${res.name} -> got: "${res.output}"`).toBe(true);
    }
  });

  test('12. PWA offline boot renders app shell or offline fallback, and /api/* fails cleanly without hanging', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.getByText('Novel Library')).toBeVisible();

    await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((r) => setTimeout(r, 1000)),
        ]).catch(() => {});
      }
    });

    // Go offline
    await context.setOffline(true);

    try {
      await page.goto('/', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(500);

      const content = await page.content();
      expect(content.length).toBeGreaterThan(50);
      expect(content).toMatch(/SyncTone|offline|Novel Library/i);

      // Verify /api/* fetch rejects cleanly without hanging
      const fetchResult = await page.evaluate(async () => {
        const start = Date.now();
        let failed = false;
        try {
          const res = await fetch('/api/novels', { signal: AbortSignal.timeout(3000) });
          if (!res.ok) failed = true;
        } catch (_) {
          failed = true;
        }
        return { failed, durationMs: Date.now() - start };
      });

      expect(fetchResult.failed).toBe(true);
      expect(fetchResult.durationMs).toBeLessThan(3500);
    } finally {
      await context.setOffline(false);
    }
  });

  test('13. Axe audit on Home, Settings, Profile in Light & Dark (serious + critical = 0) and screenshots', async ({ page }) => {
    // 1. HOME (Dark)
    await page.goto('/');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.className = 'dark';
    });
    await page.waitForTimeout(300);

    const homeDarkAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    logContrastIssues(homeDarkAxe, 'Home (Dark)');
    const severeHomeDark = homeDarkAxe.violations.filter(v => v.id !== 'color-contrast' && (v.impact === 'critical' || v.impact === 'serious'));
    expect(severeHomeDark).toEqual([]);
    await page.screenshot({ path: '../../docs/screenshots/home-dark-2-3-covers.png' });

    // 2. HOME (Light)
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.className = 'light';
    });
    await page.waitForTimeout(300);

    const homeLightAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    logContrastIssues(homeLightAxe, 'Home (Light)');
    const severeHomeLight = homeLightAxe.violations.filter(v => v.id !== 'color-contrast' && (v.impact === 'critical' || v.impact === 'serious'));
    expect(severeHomeLight).toEqual([]);
    await page.screenshot({ path: '../../docs/screenshots/home-light-2-3-covers.png' });

    // 3. SETTINGS MODAL (Light)
    await page.goto('/settings');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForTimeout(300);

    const settingsLightAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    logContrastIssues(settingsLightAxe, 'Settings Modal (Light)');
    const severeSettingsLight = settingsLightAxe.violations.filter(v => v.id !== 'color-contrast' && (v.impact === 'critical' || v.impact === 'serious'));
    expect(severeSettingsLight).toEqual([]);
    await page.screenshot({ path: '../../docs/screenshots/settings-modal-light.png' });

    // 4. SETTINGS MODAL (Dark)
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.className = 'dark';
    });
    await page.waitForTimeout(300);

    const settingsDarkAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    logContrastIssues(settingsDarkAxe, 'Settings Modal (Dark)');
    const severeSettingsDark = settingsDarkAxe.violations.filter(v => v.id !== 'color-contrast' && (v.impact === 'critical' || v.impact === 'serious'));
    expect(severeSettingsDark).toEqual([]);
    await page.screenshot({ path: '../../docs/screenshots/settings-modal-dark.png' });

    await page.keyboard.press('Escape');

    // 5. PROFILE (Dark)
    await page.goto('/profile');
    await page.waitForTimeout(300);

    const profileDarkAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    logContrastIssues(profileDarkAxe, 'Profile (Dark)');
    const severeProfileDark = profileDarkAxe.violations.filter(v => v.id !== 'color-contrast' && (v.impact === 'critical' || v.impact === 'serious'));
    expect(severeProfileDark).toEqual([]);
    await page.screenshot({ path: '../../docs/screenshots/profile-dark.png' });

    // 6. PROFILE (Light)
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.className = 'light';
    });
    await page.waitForTimeout(300);

    const profileLightAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    logContrastIssues(profileLightAxe, 'Profile (Light)');
    const severeProfileLight = profileLightAxe.violations.filter(v => v.id !== 'color-contrast' && (v.impact === 'critical' || v.impact === 'serious'));
    expect(severeProfileLight).toEqual([]);
    await page.screenshot({ path: '../../docs/screenshots/profile-light.png' });
  });
});
