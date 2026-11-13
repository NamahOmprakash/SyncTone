import { test, expect } from '@playwright/test';

test.describe('TopHeader Navigation & Character Roster Clearance', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept backend API requests with realistic fixtures
    await page.route('**/api/novels*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          novels: [
            {
              id: 'novel-test-1',
              title: 'The Great Gatsby',
              author: 'F. Scott Fitzgerald',
              chapter_count: 1,
              cover_url: '',
            },
          ],
        }),
      });
    });

    await page.route('**/api/chapters/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          chapter: {
            id: 'ch-test-1',
            novel_id: 'novel-test-1',
            title: 'Chapter 1: The Green Light',
            chapter_number: 1,
            audio_stream_url: '',
          },
          segments: [
            {
              order: 1,
              segment_id: 1,
              type: 'narration',
              text: 'In my younger and more vulnerable years my father gave me some advice.',
              speaker_name: 'Narrator',
            },
            {
              order: 2,
              segment_id: 2,
              type: 'dialogue',
              character_id: 'gatsby',
              speaker_name: 'Jay Gatsby',
              text: 'Glad to see you again, old sport.',
              assigned_voice_id: 'en-GB-ThomasNeural',
            },
          ],
        }),
      });
    });

    await page.route('**/api/voices*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          available_voices: {
            'British Young Hero': 'en-GB-ThomasNeural',
            'British Lead': 'bm_fable',
          },
        }),
      });
    });

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: null, role: 'reader' }),
      });
    });
  });

  test('Clicking + VOICES in reader view strictly navigates to /voices instead of opening cast roster', async ({ page }) => {
    await page.goto('/reader/ch-test-1');
    await page.waitForSelector('nav[aria-label="Main Navigation"]', { state: 'visible', timeout: 10000 });

    const voicesNavBtn = page.locator('nav[aria-label="Main Navigation"] button:has-text("+ VOICES")');
    const readerNavBtn = page.locator('nav[aria-label="Main Navigation"] button:has-text("+ READER")');

    // Initially in reader view: + READER is active, + VOICES is inactive
    await expect(readerNavBtn).toHaveAttribute('aria-current', 'page');
    await expect(voicesNavBtn).not.toHaveAttribute('aria-current');

    // Click + VOICES
    await voicesNavBtn.click();

    // Verify navigation strictly transitions to /voices
    await expect(page).toHaveURL(/\/voices/);
    await expect(voicesNavBtn).toHaveAttribute('aria-current', 'page');
    await expect(readerNavBtn).not.toHaveAttribute('aria-current');

    // Cast roster drawer must NOT be open
    await expect(page.locator('div[role="dialog"][aria-label="Character Roster"]')).not.toBeVisible();
  });

  test('CAST ROSTER button opens drawer cleanly under topbar without occluding header and dismisses on scrim click', async ({ page }) => {
    await page.goto('/reader/ch-test-1');
    await page.waitForSelector('nav[aria-label="Main Navigation"]', { state: 'visible', timeout: 10000 });

    const castRosterBtn = page.locator('header button[aria-label="Toggle Cast Roster"]');
    const voicesNavBtn = page.locator('nav[aria-label="Main Navigation"] button:has-text("+ VOICES")');
    const readerNavBtn = page.locator('nav[aria-label="Main Navigation"] button:has-text("+ READER")');
    const themeBtn = page.locator('header button[aria-label*="Switch Theme"]');
    const signInBtn = page.locator('header button:has-text("Sign In")');

    await expect(castRosterBtn).toBeVisible();

    // 1. Click CAST ROSTER button
    await castRosterBtn.click();

    // 2. Drawer and Scrim are visible
    const drawer = page.locator('div[role="dialog"][aria-label="Character Roster"]');
    const scrim = page.locator('div[data-testid="roster-scrim"]');
    await expect(drawer).toBeVisible();
    await expect(scrim).toBeVisible();

    // 3. Header clearance: Header is at y=0, height=56px. Drawer top must be >= 56px
    const header = page.locator('header');
    const headerBox = await header.boundingBox();
    const drawerBox = await drawer.boundingBox();
    expect(headerBox).toBeTruthy();
    expect(drawerBox).toBeTruthy();

    // Drawer starts cleanly below or at header bottom
    expect(drawerBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1);

    // 4. Stacking: Nav links state when roster is open
    // Only + READER is active, + VOICES remains strictly inactive, CAST ROSTER is active
    await expect(readerNavBtn).toHaveAttribute('aria-current', 'page');
    await expect(voicesNavBtn).not.toHaveAttribute('aria-current');
    await expect(castRosterBtn).toHaveAttribute('aria-expanded', 'true');

    // 5. Controls in header remain visible and clickable above scrim
    await expect(themeBtn).toBeVisible();
    await expect(signInBtn).toBeVisible();

    // 6. Dismissing via Scrim click
    await scrim.click({ position: { x: 50, y: 150 } });
    await expect(drawer).not.toBeVisible();
  });

  test('Character Roster closes when Escape key is pressed', async ({ page }) => {
    await page.goto('/reader/ch-test-1');
    await page.waitForSelector('button[aria-label="Toggle Cast Roster"]', { state: 'visible', timeout: 10000 });

    const castRosterBtn = page.locator('button[aria-label="Toggle Cast Roster"]');
    await castRosterBtn.click();

    const drawer = page.locator('div[role="dialog"][aria-label="Character Roster"]');
    await expect(drawer).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
  });

  test('THEME toggle and SIGN IN buttons are clickable and accessible while Character Roster is open', async ({ page }) => {
    await page.goto('/reader/ch-test-1');
    await page.waitForSelector('header button[aria-label="Toggle Cast Roster"]', { state: 'visible', timeout: 10000 });

    const castRosterBtn = page.locator('header button[aria-label="Toggle Cast Roster"]');
    await castRosterBtn.click();

    const drawer = page.locator('div[role="dialog"][aria-label="Character Roster"]');
    await expect(drawer).toBeVisible();

    const themeBtn = page.locator('header button[aria-label*="Switch Theme"]');
    const signInBtn = page.locator('header button:has-text("Sign In")');

    // Theme toggle works over drawer scrim
    const initialThemeText = (await themeBtn.textContent()) || '';
    await themeBtn.click();
    await expect(themeBtn).not.toHaveText(initialThemeText);

    // Sign In button works over drawer scrim and opens Auth modal
    await signInBtn.click();
    const authModal = page.locator('div[role="dialog"][aria-labelledby="auth-modal-title"]');
    await expect(authModal).toBeVisible();
  });

  test('Clicking + VOICES while Character Roster drawer is open navigates to /voices and closes the roster', async ({ page }) => {
    await page.goto('/reader/ch-test-1');
    await page.waitForSelector('header button[aria-label="Toggle Cast Roster"]', { state: 'visible', timeout: 10000 });

    const castRosterBtn = page.locator('header button[aria-label="Toggle Cast Roster"]');
    const voicesNavBtn = page.locator('nav[aria-label="Main Navigation"] button:has-text("+ VOICES")');
    const drawer = page.locator('div[role="dialog"][aria-label="Character Roster"]');

    // 1. Open Cast Roster
    await castRosterBtn.click();
    await expect(drawer).toBeVisible();
    await expect(castRosterBtn).toHaveAttribute('aria-expanded', 'true');

    // 2. Click + VOICES while roster is open
    await voicesNavBtn.click();

    // 3. Verify route transitioned to /voices
    await expect(page).toHaveURL(/\/voices/);
    await expect(voicesNavBtn).toHaveAttribute('aria-current', 'page');

    // 4. Verify Character Roster drawer is closed
    await expect(drawer).not.toBeVisible();
    await expect(castRosterBtn).not.toBeVisible();
  });
});
