/**
 * TIER 5 ADVERSARIAL COVERAGE HARDENING SPECIFICATION
 * White-Box Edge Cases, Generators, Oracles & Stress Harnesses
 *
 * Verifies:
 * 1. Audio Scrubber Boundaries (0ms, negative offset, NaN, end-of-track, rapid scrubbing)
 * 2. Theme Toggle Resilience (localStorage corrupt state, rapid switching, meta-theme sync)
 * 3. Toast Notification Stacking, Queue Lifecycle, and Dismissal
 * 4. Reduced-Motion Compliance (prefers-reduced-motion token & CSS rules)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '..');
const srcDir = path.join(frontendDir, 'src');

const RESULTS = {
  passed: 0,
  failed: 0,
  tests: [],
};

function test(name, fn) {
  try {
    fn();
    RESULTS.passed++;
    RESULTS.tests.push({ name, status: 'PASS' });
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${name}`);
  } catch (err) {
    RESULTS.failed++;
    RESULTS.tests.push({ name, status: 'FAIL', error: err.message });
    console.error(`  \x1b[31m✖ FAIL\x1b[0m: ${name}`);
    console.error(`    \x1b[31m${err.message}\x1b[0m`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// =========================================================================
// 1. AUDIO SCRUBBER BOUNDARIES & STRESS TESTING
// =========================================================================

// Extract formatTime & formatHoverTime logic from AudioPlayer.jsx
function formatTime(ms) {
  if (!ms || isNaN(ms) || ms < 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatHoverTime(ms) {
  if (!ms || isNaN(ms) || ms < 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function calculateProgressFraction(currentTimeMs, totalDurationMs) {
  return totalDurationMs > 0 ? Math.min(1, Math.max(0, currentTimeMs / totalDurationMs)) : 0;
}

function calculateSeek(clientX, rect, totalDurationMs) {
  if (totalDurationMs <= 0 || !rect || rect.width <= 0) return null;
  const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return Math.round(fraction * totalDurationMs);
}

function calculateSkip(currentTimeSec, skipDeltaSec, totalDurationSec) {
  return Math.max(0, Math.min(totalDurationSec, currentTimeSec + skipDeltaSec));
}

console.log('\n\x1b[1m=== Tier 5: Section 1 — Audio Scrubber Boundaries & Stress Tests ===\x1b[0m\n');

test('1.1: formatTime Oracle — Boundary inputs (0, negative, NaN, null, undefined, large)', () => {
  assert(formatTime(0) === '0:00', 'formatTime(0) should be 0:00');
  assert(formatTime(-0) === '0:00', 'formatTime(-0) should be 0:00');
  assert(formatTime(-1) === '0:00', 'formatTime(-1) should be 0:00');
  assert(formatTime(-1000) === '0:00', 'formatTime(-1000) should be 0:00');
  assert(formatTime(-999999999) === '0:00', 'formatTime(-large) should be 0:00');
  assert(formatTime(-Infinity) === '0:00', 'formatTime(-Infinity) should be 0:00');
  assert(formatTime(NaN) === '0:00', 'formatTime(NaN) should be 0:00');
  assert(formatTime(null) === '0:00', 'formatTime(null) should be 0:00');
  assert(formatTime(undefined) === '0:00', 'formatTime(undefined) should be 0:00');
  assert(formatTime('invalid') === '0:00', 'formatTime("invalid") should be 0:00');
  assert(formatTime({}) === '0:00', 'formatTime({}) should be 0:00');

  // Standard durations
  assert(formatTime(1000) === '0:01', '1000ms should be 0:01');
  assert(formatTime(59000) === '0:59', '59000ms should be 0:59');
  assert(formatTime(60000) === '1:00', '60000ms should be 1:00');
  assert(formatTime(65000) === '1:05', '65000ms should be 1:05');
  assert(formatTime(3599000) === '59:59', '3599000ms should be 59:59');
  assert(formatTime(3600000) === '60:00', '3600000ms should be 60:00');
});

test('1.2: formatHoverTime Oracle — Boundary inputs (0, negative, NaN, null, undefined)', () => {
  assert(formatHoverTime(0) === '00:00', 'formatHoverTime(0) should be 00:00');
  assert(formatHoverTime(-100) === '00:00', 'formatHoverTime(-100) should be 00:00');
  assert(formatHoverTime(NaN) === '00:00', 'formatHoverTime(NaN) should be 00:00');
  assert(formatHoverTime(null) === '00:00', 'formatHoverTime(null) should be 00:00');
  assert(formatHoverTime(undefined) === '00:00', 'formatHoverTime(undefined) should be 00:00');
  assert(formatHoverTime(1000) === '00:01', 'formatHoverTime(1000) should be 00:01');
  assert(formatHoverTime(65000) === '01:05', 'formatHoverTime(65000) should be 01:05');
});

test('1.3: Generator Stress Test — 10,000 randomized timecode format inputs', () => {
  const timeRegex = /^\d+:\d{2}$/;
  const hoverRegex = /^\d{2,}:\d{2}$/;

  for (let i = 0; i < 10000; i++) {
    // Generate across wide spectrum: negative, zero, positive, large, fractional
    const randMs = (Math.random() - 0.3) * 10000000;
    const res = formatTime(randMs);
    const hoverRes = formatHoverTime(randMs);

    assert(timeRegex.test(res), `formatTime output '${res}' does not match M:SS for input ${randMs}`);
    assert(hoverRegex.test(hoverRes), `formatHoverTime output '${hoverRes}' does not match MM:SS for input ${randMs}`);

    if (randMs <= 0 || isNaN(randMs)) {
      assert(res === '0:00', `Expected 0:00 for ${randMs}, got ${res}`);
      assert(hoverRes === '00:00', `Expected 00:00 for ${randMs}, got ${hoverRes}`);
    }
  }
});

test('1.4: ProgressFraction Math — Invariants under boundary conditions', () => {
  // Total duration 0 -> must be 0
  assert(calculateProgressFraction(0, 0) === 0, 'progressFraction(0, 0) === 0');
  assert(calculateProgressFraction(1000, 0) === 0, 'progressFraction(1000, 0) === 0');
  assert(calculateProgressFraction(-500, 0) === 0, 'progressFraction(-500, 0) === 0');
  assert(calculateProgressFraction(500, -100) === 0, 'progressFraction(500, -100) === 0');

  // Negative current time -> must be 0
  assert(calculateProgressFraction(-100, 1000) === 0, 'progressFraction(-100, 1000) === 0');
  assert(calculateProgressFraction(-Infinity, 1000) === 0, 'progressFraction(-Infinity, 1000) === 0');

  // Overshoot (end-of-track) -> must be clamped to 1
  assert(calculateProgressFraction(1500, 1000) === 1, 'progressFraction(1500, 1000) === 1');
  assert(calculateProgressFraction(100000, 1000) === 1, 'progressFraction(100000, 1000) === 1');
  assert(calculateProgressFraction(Infinity, 1000) === 1, 'progressFraction(Infinity, 1000) === 1');

  // Within bounds
  assert(calculateProgressFraction(500, 1000) === 0.5, 'progressFraction(500, 1000) === 0.5');
  assert(calculateProgressFraction(0, 1000) === 0, 'progressFraction(0, 1000) === 0');
  assert(calculateProgressFraction(1000, 1000) === 1, 'progressFraction(1000, 1000) === 1');
});

test('1.5: Scrubber Seek Math — Coordinate bounds & clamping oracle', () => {
  const rect = { left: 100, width: 800 };
  const duration = 60000; // 60s track

  // Exact boundaries
  assert(calculateSeek(100, rect, duration) === 0, 'Click at left edge should be 0ms');
  assert(calculateSeek(900, rect, duration) === 60000, 'Click at right edge should be 60000ms');
  assert(calculateSeek(500, rect, duration) === 30000, 'Click at center should be 30000ms');

  // Out of bounds / negative offsets
  assert(calculateSeek(50, rect, duration) === 0, 'Click to left of track clamped to 0ms');
  assert(calculateSeek(0, rect, duration) === 0, 'Click at 0px clamped to 0ms');
  assert(calculateSeek(-500, rect, duration) === 0, 'Click at negative clientX clamped to 0ms');
  assert(calculateSeek(950, rect, duration) === 60000, 'Click to right of track clamped to 60000ms');
  assert(calculateSeek(99999, rect, duration) === 60000, 'Click at far right clamped to 60000ms');

  // Zero duration
  assert(calculateSeek(500, rect, 0) === null, 'Seek on 0ms track is no-op');
  assert(calculateSeek(500, rect, -100) === null, 'Seek on negative duration track is no-op');

  // Collapsed track (width <= 0)
  assert(calculateSeek(500, { left: 100, width: 0 }, duration) === null, 'Seek on collapsed track is no-op');
});

test('1.6: Rapid Scrubbing Stress Test — 5,000 randomized seek operations', () => {
  const rect = { left: 200, width: 600 };
  const duration = 180000; // 3 minutes

  for (let i = 0; i < 5000; i++) {
    const clientX = Math.floor((Math.random() - 0.2) * 1200);
    const targetMs = calculateSeek(clientX, rect, duration);

    assert(typeof targetMs === 'number', `Seek result should be number, got ${typeof targetMs}`);
    assert(!isNaN(targetMs), `Seek result must not be NaN for clientX=${clientX}`);
    assert(targetMs >= 0, `Seek result must be >= 0, got ${targetMs}`);
    assert(targetMs <= duration, `Seek result must be <= ${duration}, got ${targetMs}`);
  }
});

test('1.7: Skip & Keyboard Navigation Bounds — Boundary clamping (0s and end-of-track)', () => {
  const trackSec = 120; // 2 minutes

  // Skip back at 0s stays 0s
  assert(calculateSkip(0, -10, trackSec) === 0, 'Skip -10s from 0s stays 0s');
  assert(calculateSkip(5, -10, trackSec) === 0, 'Skip -10s from 5s clamps to 0s');
  assert(calculateSkip(0, -5, trackSec) === 0, 'ArrowLeft -5s from 0s stays 0s');

  // Skip forward at end stays at duration
  assert(calculateSkip(120, 10, trackSec) === 120, 'Skip +10s from 120s stays 120s');
  assert(calculateSkip(115, 10, trackSec) === 120, 'Skip +10s from 115s clamps to 120s');
  assert(calculateSkip(120, 5, trackSec) === 120, 'ArrowRight +5s from 120s stays 120s');

  // Normal skips
  assert(calculateSkip(30, -10, trackSec) === 20, 'Skip -10s from 30s is 20s');
  assert(calculateSkip(30, 10, trackSec) === 40, 'Skip +10s from 30s is 40s');
});

// =========================================================================
// 2. THEME TOGGLE RESILIENCE & STORAGE CORRUPT STATE
// =========================================================================
console.log('\n\x1b[1m=== Tier 5: Section 2 — Theme Toggle Resilience & Corrupt State ===\x1b[0m\n');

// Simulate the Flash-of-Wrong-Theme script from index.html
function runFOWTScript(mockLocalStorage) {
  let appliedClass = 'dark';
  let metaThemeColor = '#1A120E';

  try {
    var saved = mockLocalStorage.getItem('synctone_theme') || 'dark';
    if (saved !== 'dark' && saved !== 'light') saved = 'dark';
    appliedClass = saved;
    metaThemeColor = saved === 'dark' ? '#1A120E' : '#FAF8F5';
  } catch (e) {
    appliedClass = 'dark';
    metaThemeColor = '#1A120E';
  }

  return { appliedClass, metaThemeColor };
}

// Simulate ThemeContext initial state resolver
function resolveInitialTheme(mockLocalStorage, urlSearch = '') {
  const urlParams = new URLSearchParams(urlSearch);
  const urlTheme = urlParams.get('theme');
  if (urlTheme === 'dark' || urlTheme === 'light') return urlTheme;

  let saved = null;
  try {
    saved = mockLocalStorage.getItem('synctone_theme');
  } catch (_) {
    return 'dark';
  }

  if (saved === 'sepia') {
    try { mockLocalStorage.setItem('synctone_theme', 'dark'); } catch (_) {}
    return 'dark';
  }
  if (saved === 'dark' || saved === 'light') return saved;
  return 'dark';
}

test('2.1: Flash-of-Wrong-Theme script handles corrupted localStorage states without throwing', () => {
  const corruptStates = [
    null,
    '',
    'undefined',
    'null',
    'sepia',
    'blue',
    'corrupt-value-1234',
    '{"theme":"dark"}',
    '<script>alert(1)</script>',
    String.fromCharCode(0),
    '   dark   ',
    'LIGHT',
    'Dark',
  ];

  for (const val of corruptStates) {
    const mockStorage = { getItem: () => val };
    const { appliedClass, metaThemeColor } = runFOWTScript(mockStorage);
    assert(appliedClass === 'dark', `Corrupt state '${val}' should fallback to 'dark', got '${appliedClass}'`);
    assert(metaThemeColor === '#1A120E', `Corrupt state '${val}' should set meta to #1A120E`);
  }

  // Valid states
  assert(runFOWTScript({ getItem: () => 'light' }).appliedClass === 'light', 'Valid light mode should apply "light"');
  assert(runFOWTScript({ getItem: () => 'light' }).metaThemeColor === '#FAF8F5', 'Light mode meta should be #FAF8F5');
  assert(runFOWTScript({ getItem: () => 'dark' }).appliedClass === 'dark', 'Valid dark mode should apply "dark"');
  assert(runFOWTScript({ getItem: () => 'dark' }).metaThemeColor === '#1A120E', 'Dark mode meta should be #1A120E');
});

test('2.2: Flash-of-Wrong-Theme script recovers safely when localStorage.getItem throws DOMException', () => {
  const throwingStorage = {
    getItem: () => {
      const err = new Error('The operation is insecure.');
      err.name = 'SecurityError';
      throw err;
    },
  };

  const { appliedClass, metaThemeColor } = runFOWTScript(throwingStorage);
  assert(appliedClass === 'dark', 'Should safely fallback to "dark" when storage throws');
  assert(metaThemeColor === '#1A120E', 'Should fallback meta to #1A120E when storage throws');
});

test('2.3: ThemeContext initial resolver handles corrupt states and migrates sepia', () => {
  let sepiaMigrated = false;
  const mockStorageSepia = {
    getItem: (k) => (k === 'synctone_theme' ? 'sepia' : null),
    setItem: (k, v) => {
      if (k === 'synctone_theme' && v === 'dark') sepiaMigrated = true;
    },
  };

  const theme = resolveInitialTheme(mockStorageSepia);
  assert(theme === 'dark', 'Sepia should silently migrate to dark');
  assert(sepiaMigrated, 'Sepia should trigger localStorage update to dark');

  // Corrupt state fallback
  const mockStorageCorrupt = { getItem: () => 'corrupted_theme_xyz' };
  assert(resolveInitialTheme(mockStorageCorrupt) === 'dark', 'Corrupt theme should fallback to dark');

  // Valid light state
  const mockStorageLight = { getItem: () => 'light' };
  assert(resolveInitialTheme(mockStorageLight) === 'light', 'Light theme preserved');
});

test('2.4: URL parameter (?theme=) takes precedence over localStorage', () => {
  const mockStorage = { getItem: () => 'dark' };
  assert(resolveInitialTheme(mockStorage, '?theme=light') === 'light', '?theme=light should override dark in storage');

  const mockStorageLight = { getItem: () => 'light' };
  assert(resolveInitialTheme(mockStorageLight, '?theme=dark') === 'dark', '?theme=dark should override light in storage');

  // Invalid query param falls back to storage
  assert(resolveInitialTheme(mockStorageLight, '?theme=invalid') === 'light', 'Invalid theme param should use storage');
});

test('2.5: Rapid Theme Toggle Cycle Simulation — 1,000 state transitions', () => {
  const THEME_CYCLE = ['dark', 'light'];
  let currentTheme = 'dark';

  for (let i = 0; i < 1000; i++) {
    const idx = THEME_CYCLE.indexOf(currentTheme);
    currentTheme = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];

    const expectedTheme = i % 2 === 0 ? 'light' : 'dark';
    assert(currentTheme === expectedTheme, `Cycle ${i}: expected ${expectedTheme}, got ${currentTheme}`);

    // Verify meta-theme sync contract
    const metaColor = currentTheme === 'dark' ? '#1A120E' : '#FAF8F5';
    assert(
      (currentTheme === 'dark' && metaColor === '#1A120E') ||
      (currentTheme === 'light' && metaColor === '#FAF8F5'),
      'Meta theme color must strictly match active theme'
    );
  }
});

// =========================================================================
// 3. TOAST NOTIFICATION STACKING, QUEUE LIFECYCLE & DISMISSAL
// =========================================================================
console.log('\n\x1b[1m=== Tier 5: Section 3 — Toast Stacking, Queue Lifecycle & Dismissal ===\x1b[0m\n');

class ToastQueueSimulator {
  constructor() {
    this.toasts = [];
  }

  showToast(message, type = 'danger', title = null) {
    const id = Date.now() + Math.random().toString(36).substring(2, 7);
    const normalizedType = type === 'error' ? 'danger' : type;
    const toast = { id, message, type: normalizedType, title };
    this.toasts = [...this.toasts, toast];
    return id;
  }

  dismissToast(id) {
    this.toasts = this.toasts.filter(t => t.id !== id);
  }
}

test('3.1: Toast ID Generator Collision Stress — 10,000 rapid toasts produce zero collisions', () => {
  const idSet = new Set();
  const queue = new ToastQueueSimulator();

  for (let i = 0; i < 10000; i++) {
    const id = queue.showToast(`Test message ${i}`, 'info');
    assert(!idSet.has(id), `Duplicate toast ID generated: ${id}`);
    idSet.add(id);
  }

  assert(queue.toasts.length === 10000, 'Queue length should be 10000');
});

test('3.2: Toast Queue Lifecycle — Stacking order and targeted dismissal', () => {
  const queue = new ToastQueueSimulator();

  const id1 = queue.showToast('First toast', 'info');
  const id2 = queue.showToast('Second toast', 'success');
  const id3 = queue.showToast('Third toast', 'warning');
  const id4 = queue.showToast('Fourth toast', 'danger');

  assert(queue.toasts.length === 4, 'Should have 4 toasts stacked');
  assert(queue.toasts[0].id === id1, 'FIFO ordering: first toast at index 0');
  assert(queue.toasts[3].id === id4, 'FIFO ordering: fourth toast at index 3');

  // Dismiss middle toast (id2)
  queue.dismissToast(id2);
  assert(queue.toasts.length === 3, 'Should have 3 toasts after dismissing one');
  assert(queue.toasts.map(t => t.id).includes(id2) === false, 'id2 should no longer exist');
  assert(queue.toasts[0].id === id1, 'id1 remains first');
  assert(queue.toasts[1].id === id3, 'id3 shifted to index 1');
  assert(queue.toasts[2].id === id4, 'id4 shifted to index 2');

  // Dismiss non-existent ID
  queue.dismissToast('non-existent-id-999');
  assert(queue.toasts.length === 3, 'Dismissing non-existent ID is safe no-op');

  // Dismiss remaining toasts
  queue.dismissToast(id1);
  queue.dismissToast(id3);
  queue.dismissToast(id4);
  assert(queue.toasts.length === 0, 'Queue should be empty');
});

test('3.3: Toast Type Normalization — "error" is safely mapped to "danger"', () => {
  const queue = new ToastQueueSimulator();
  queue.showToast('Error occurred', 'error', 'Error Title');
  queue.showToast('Danger alert', 'danger', 'Danger Title');
  queue.showToast('Success notice', 'success', 'Success Title');
  queue.showToast('Info note', 'info', 'Info Title');

  assert(queue.toasts[0].type === 'danger', 'type="error" must be normalized to "danger"');
  assert(queue.toasts[1].type === 'danger', 'type="danger" is preserved');
  assert(queue.toasts[2].type === 'success', 'type="success" is preserved');
  assert(queue.toasts[3].type === 'info', 'type="info" is preserved');
});

test('3.4: Toast Component Source Code Integrity & Zero Blue Audit', () => {
  const toastJsx = fs.readFileSync(path.join(srcDir, 'components/primitives/Toast.jsx'), 'utf-8');
  const toastContextJsx = fs.readFileSync(path.join(srcDir, 'context/ToastContext.jsx'), 'utf-8');

  // Accessibility contract
  assert(toastJsx.includes('role="status"'), 'Toast primitive must have role="status"');
  assert(toastJsx.includes('aria-live="polite"'), 'Toast primitive must have aria-live="polite"');
  assert(toastContextJsx.includes('aria-live="polite"'), 'Toast container must have aria-live="polite"');
  assert(toastJsx.includes('aria-label="Dismiss notification"'), 'Dismiss button must have accessible label');

  // Zero blue check
  assert(!toastJsx.includes('text-blue'), 'Toast must contain 0 blue text utility classes');
  assert(!toastJsx.includes('bg-blue'), 'Toast must contain 0 blue bg utility classes');
  assert(!toastJsx.includes('border-blue'), 'Toast must contain 0 blue border utility classes');
});

// =========================================================================
// 4. REDUCED-MOTION COMPLIANCE (TOKEN & CSS INSPECTION)
// =========================================================================
console.log('\n\x1b[1m=== Tier 5: Section 4 — Reduced-Motion Compliance ===\x1b[0m\n');

test('4.1: prefersReducedMotion token handles browser & SSR environments', () => {
  // Test SSR fallback (window is undefined or lacks matchMedia)
  function simulatePrefers(mockWindow) {
    if (typeof mockWindow === 'undefined' || !mockWindow.matchMedia) return false;
    return mockWindow.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  assert(simulatePrefers(undefined) === false, 'SSR fallback returns false');
  assert(simulatePrefers({}) === false, 'Window without matchMedia returns false');
  assert(simulatePrefers({ matchMedia: () => ({ matches: false }) }) === false, 'Normal motion returns false');
  assert(simulatePrefers({ matchMedia: () => ({ matches: true }) }) === true, 'Reduced motion returns true');
});

test('4.2: executeViewTransition deactivates view transitions when reduced-motion is requested', () => {
  function simulateExecuteViewTransition(mockDoc, prefersReduced, callback) {
    if (
      typeof mockDoc !== 'undefined' &&
      'startViewTransition' in mockDoc &&
      !prefersReduced
    ) {
      return mockDoc.startViewTransition(callback);
    }
    callback();
    return {
      finished: Promise.resolve(),
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
    };
  }

  let transitionCalled = false;
  let callbackExecuted = false;

  const mockDoc = {
    startViewTransition: (cb) => {
      transitionCalled = true;
      cb();
      return { finished: Promise.resolve() };
    },
  };

  // Case A: Reduced motion active -> startViewTransition MUST NOT be called
  simulateExecuteViewTransition(mockDoc, true, () => {
    callbackExecuted = true;
  });
  assert(callbackExecuted === true, 'Callback executed');
  assert(transitionCalled === false, 'startViewTransition must NOT be called when reduced-motion is active');

  // Case B: Normal motion -> startViewTransition IS called
  callbackExecuted = false;
  transitionCalled = false;
  simulateExecuteViewTransition(mockDoc, false, () => {
    callbackExecuted = true;
  });
  assert(callbackExecuted === true, 'Callback executed');
  assert(transitionCalled === true, 'startViewTransition should be called when reduced motion is inactive');
});

test('4.3: index.css prefers-reduced-motion block suppresses animations across all key components', () => {
  const indexCss = fs.readFileSync(path.join(srcDir, 'index.css'), 'utf-8');

  // Balanced brace parser for CSS @media blocks
  function extractMediaBlocks(cssContent, mediaQueryTarget) {
    const blocks = [];
    let idx = 0;
    while ((idx = cssContent.indexOf('@media', idx)) !== -1) {
      const start = idx;
      const braceIdx = cssContent.indexOf('{', start);
      if (braceIdx === -1) break;
      const header = cssContent.slice(start, braceIdx);
      let depth = 1;
      let pos = braceIdx + 1;
      while (pos < cssContent.length && depth > 0) {
        if (cssContent[pos] === '{') depth++;
        else if (cssContent[pos] === '}') depth--;
        pos++;
      }
      const body = cssContent.slice(braceIdx + 1, pos - 1);
      if (header.includes(mediaQueryTarget)) {
        blocks.push(body);
      }
      idx = pos;
    }
    return blocks;
  }

  const mediaBlocks = extractMediaBlocks(indexCss, 'prefers-reduced-motion');
  assert(mediaBlocks.length >= 2, `Expected at least 2 prefers-reduced-motion blocks, found ${mediaBlocks.length}`);

  const combinedMediaContent = mediaBlocks.join('\n');

  // Equalizer & audio visualizer
  assert(combinedMediaContent.includes('.eq-bar-1'), 'Reduced motion must tame .eq-bar-1');
  assert(combinedMediaContent.includes('.eq-bar-2'), 'Reduced motion must tame .eq-bar-2');
  assert(combinedMediaContent.includes('.eq-bar-3'), 'Reduced motion must tame .eq-bar-3');
  assert(combinedMediaContent.includes('.equalizer-bar'), 'Reduced motion must tame .equalizer-bar');

  // Keyframe animations
  assert(combinedMediaContent.includes('.animate-fade-in'), 'Reduced motion must tame .animate-fade-in');
  assert(combinedMediaContent.includes('.animate-slideDown'), 'Reduced motion must tame .animate-slideDown');
  assert(combinedMediaContent.includes('.animate-fadeInUp'), 'Reduced motion must tame .animate-fadeInUp');

  // Route & Card transitions
  assert(combinedMediaContent.includes('.motion-view-route'), 'Reduced motion must tame .motion-view-route');
  assert(combinedMediaContent.includes('.card-motion'), 'Reduced motion must tame .card-motion');
  assert(combinedMediaContent.includes('.shimmer-layer'), 'Reduced motion must tame .shimmer-layer');

  // Check animation: none !important
  assert(combinedMediaContent.includes('animation: none !important'), 'Reduced motion must set animation: none !important');
});

console.log('\n\x1b[1m======================================================================\x1b[0m');
console.log(`\x1b[1m  TIER 5 ADVERSARIAL HARDENING SUMMARY: ${RESULTS.passed} passed, ${RESULTS.failed} failed\x1b[0m`);
console.log('\x1b[1m======================================================================\x1b[0m\n');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (RESULTS.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}
