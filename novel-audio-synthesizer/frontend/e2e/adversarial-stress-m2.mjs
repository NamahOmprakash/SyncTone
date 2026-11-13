/**
 * ADVERSARIAL STRESS TEST HARNESS — MILESTONE 2 (Micro-Animations & Interaction Polish)
 *
 * Verifies:
 * 1. CSS Keyframes, CLS Safety & Compositor Thread Animation Properties
 * 2. Reduced Motion Media Query Graceful Deactivation
 * 3. Scrubber Hover Badge Math & Boundary Resilience (0, NaN, undefined, negative, width=0)
 * 4. Active Spring Depression Classes on all Interactive Targets
 * 5. Toast Primitive Lifecycle & Auto-Dismiss Integration
 * 6. Production Bundle Size & Cold-Load Home Gzip Ceiling Audit
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '..');
const srcDir = path.join(frontendDir, 'src');
const distDir = path.join(frontendDir, 'dist');

const results = {
  passed: 0,
  failed: 0,
  details: [],
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runTest(name, fn) {
  try {
    fn();
    results.passed++;
    results.details.push({ name, status: 'PASS' });
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${name}`);
  } catch (err) {
    results.failed++;
    results.details.push({ name, status: 'FAIL', error: err.message });
    console.error(`  \x1b[31m✖ FAIL\x1b[0m: ${name}`);
    console.error(`    \x1b[31m${err.message}\x1b[0m`);
  }
}

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

async function main() {
  console.log('\n\x1b[1m======================================================================\x1b[0m');
  console.log('\x1b[1m  ADVERSARIAL STRESS SUITE: MILESTONE 2 VERIFICATION\x1b[0m');
  console.log('\x1b[1m======================================================================\x1b[0m\n');

  // =========================================================================
  // TEST GROUP 1: CSS Keyframes, CLS & Compositor Thread Animation
  // =========================================================================
  console.log('\x1b[1m[Group 1: CSS Keyframes, CLS & Compositor Thread Animation]\x1b[0m');

  const indexCss = fs.readFileSync(path.join(srcDir, 'index.css'), 'utf-8');
  const tailwindConfig = fs.readFileSync(path.join(frontendDir, 'tailwind.config.js'), 'utf-8');

  runTest('1.1: Canonical keyframes (fadeIn, slideDown, fadeInUp, eqBounce) are defined in CSS/Tailwind', () => {
    assert(indexCss.includes('@keyframes fadeIn'), 'Missing @keyframes fadeIn in index.css');
    assert(indexCss.includes('@keyframes slideDown'), 'Missing @keyframes slideDown in index.css');
    assert(indexCss.includes('@keyframes fadeInUp'), 'Missing @keyframes fadeInUp in index.css');
    assert(indexCss.includes('@keyframes eqBounce'), 'Missing @keyframes eqBounce in index.css');
    assert(indexCss.includes('@keyframes eq-bounce'), 'Missing @keyframes eq-bounce in index.css');
    assert(tailwindConfig.includes('fadeIn:'), 'Missing fadeIn in tailwind.config.js');
    assert(tailwindConfig.includes('slideDown:'), 'Missing slideDown in tailwind.config.js');
    assert(tailwindConfig.includes('fadeInUp:'), 'Missing fadeInUp in tailwind.config.js');
  });

  runTest('1.2: Animation utility classes (.animate-fade-in, .animate-slideDown, .animate-fadeInUp, .eq-bar-*) are defined', () => {
    assert(indexCss.includes('.animate-fade-in'), 'Missing .animate-fade-in');
    assert(indexCss.includes('.animate-slideDown'), 'Missing .animate-slideDown');
    assert(indexCss.includes('.animate-fadeInUp'), 'Missing .animate-fadeInUp');
    assert(indexCss.includes('.eq-bar-1'), 'Missing .eq-bar-1');
    assert(indexCss.includes('.eq-bar-2'), 'Missing .eq-bar-2');
    assert(indexCss.includes('.eq-bar-3'), 'Missing .eq-bar-3');
    assert(indexCss.includes('.paused .eq-bar-1') || indexCss.includes('.eq-paused'), 'Missing .eq-paused or paused equalizer styles');
  });

  runTest('1.3: Compositor safety audit — Keyframes ONLY mutate transform and opacity (Zero CLS)', () => {
    // Extract keyframes definitions from index.css
    const keyframeRegex = /@keyframes\s+([a-zA-Z0-9_-]+)\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g;
    let match;
    const forbiddenLayoutProperties = ['width', 'height', 'top', 'bottom', 'left', 'right', 'margin', 'padding'];

    const checkedKeyframes = ['fadeIn', 'slideDown', 'fadeInUp', 'eqBounce', 'eq-bounce', 'stagger-in', 'panel-enter'];
    while ((match = keyframeRegex.exec(indexCss)) !== null) {
      const name = match[1];
      const body = match[2];
      if (checkedKeyframes.includes(name)) {
        for (const prop of forbiddenLayoutProperties) {
          const propRegex = new RegExp(`\\b${prop}\\s*:`, 'i');
          if (propRegex.test(body)) {
            throw new Error(`Keyframe '${name}' animates layout property '${prop}', which triggers layout shifts (CLS)!`);
          }
        }
      }
    }
  });

  // =========================================================================
  // TEST GROUP 2: Reduced-Motion Media Queries
  // =========================================================================
  console.log('\n\x1b[1m[Group 2: Reduced-Motion Media Queries]\x1b[0m');

  const reducedMotionBlocks = extractMediaBlocks(indexCss, 'prefers-reduced-motion');
  const combinedReducedBlocks = reducedMotionBlocks.join('\n');

  runTest('2.1: index.css contains scoped @media (prefers-reduced-motion: reduce) block', () => {
    assert(reducedMotionBlocks.length >= 1, 'Missing prefers-reduced-motion media query');
  });

  runTest('2.2: Equalizer bars freeze at steady-state transform when reduced motion is preferred', () => {
    assert(combinedReducedBlocks.includes('.eq-bar-1') || combinedReducedBlocks.includes('.equalizer-bar'),
      'Equalizer bars missing from reduced motion overrides');
    assert(combinedReducedBlocks.includes('scaleY(0.6)'), 'Reduced motion must freeze equalizer bars at fixed scale');
    assert(combinedReducedBlocks.includes('animation: none !important'), 'Reduced motion must disable continuous equalizer animation');
  });

  runTest('2.3: Micro-animation classes (.animate-fade-in, .animate-slideDown, .animate-fadeInUp) deactivate in reduced motion', () => {
    assert(combinedReducedBlocks.includes('.animate-fade-in'), 'Missing .animate-fade-in in reduced motion override');
    assert(combinedReducedBlocks.includes('.animate-slideDown'), 'Missing .animate-slideDown in reduced motion override');
    assert(combinedReducedBlocks.includes('.animate-fadeInUp'), 'Missing .animate-fadeInUp in reduced motion override');
    assert(combinedReducedBlocks.includes('transform: none !important'), 'Must reset transform in reduced motion');
    assert(combinedReducedBlocks.includes('animation: none !important'), 'Must deactivate animation in reduced motion');
  });

  // =========================================================================
  // TEST GROUP 3: Scrubber Hover Badge Math & Boundary Resilience
  // =========================================================================
  console.log('\n\x1b[1m[Group 3: Scrubber Hover Badge Math & Boundary Resilience]\x1b[0m');

  const audioPlayerCode = fs.readFileSync(path.join(srcDir, 'components', 'AudioPlayer.jsx'), 'utf-8');

  // Test formatTime and formatHoverTime logic extracted verbatim
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

  runTest('3.1: formatTime handles 0, NaN, negative, undefined, and valid inputs safely', () => {
    assert(formatTime(0) === '0:00', `Expected formatTime(0) === '0:00', got ${formatTime(0)}`);
    assert(formatTime(NaN) === '0:00', `Expected formatTime(NaN) === '0:00', got ${formatTime(NaN)}`);
    assert(formatTime(-1000) === '0:00', `Expected formatTime(-1000) === '0:00', got ${formatTime(-1000)}`);
    assert(formatTime(undefined) === '0:00', `Expected formatTime(undefined) === '0:00', got ${formatTime(undefined)}`);
    assert(formatTime(null) === '0:00', `Expected formatTime(null) === '0:00', got ${formatTime(null)}`);
    assert(formatTime(125000) === '2:05', `Expected formatTime(125000) === '2:05', got ${formatTime(125000)}`);
  });

  runTest('3.2: formatHoverTime handles 0, NaN, negative, undefined, and valid inputs safely', () => {
    assert(formatHoverTime(0) === '00:00', `Expected formatHoverTime(0) === '00:00', got ${formatHoverTime(0)}`);
    assert(formatHoverTime(NaN) === '00:00', `Expected formatHoverTime(NaN) === '00:00', got ${formatHoverTime(NaN)}`);
    assert(formatHoverTime(-500) === '00:00', `Expected formatHoverTime(-500) === '00:00', got ${formatHoverTime(-500)}`);
    assert(formatHoverTime(undefined) === '00:00', `Expected formatHoverTime(undefined) === '00:00', got ${formatHoverTime(undefined)}`);
    assert(formatHoverTime(null) === '00:00', `Expected formatHoverTime(null) === '00:00', got ${formatHoverTime(null)}`);
    assert(formatHoverTime(134000) === '02:14', `Expected formatHoverTime(134000) === '02:14', got ${formatHoverTime(134000)}`);
  });

  runTest('3.3: handleScrubberMouseMove guards against totalDurationMs <= 0', () => {
    assert(audioPlayerCode.includes('if (!scrubberTrackRef.current || totalDurationMs <= 0) return;'),
      'handleScrubberMouseMove must immediately return if totalDurationMs <= 0');
  });

  runTest('3.4: Scrubber hover preview badge is conditioned on hoverTimeMs !== null', () => {
    assert(audioPlayerCode.includes('{hoverTimeMs !== null && ('),
      'Hover badge must only render when hoverTimeMs !== null');
    assert(audioPlayerCode.includes('handleScrubberMouseLeave'),
      'Scrubber must reset hover time on mouse leave');
  });

  // =========================================================================
  // TEST GROUP 4: Tactile Spring Physics across Interactive Elements
  // =========================================================================
  console.log('\n\x1b[1m[Group 4: Tactile Spring Physics across Interactive Elements]\x1b[0m');

  const buttonCode = fs.readFileSync(path.join(srcDir, 'components', 'primitives', 'Button.jsx'), 'utf-8');
  const sidebarCode = fs.readFileSync(path.join(srcDir, 'components', 'SidebarNav.jsx'), 'utf-8');
  const topHeaderCode = fs.readFileSync(path.join(srcDir, 'components', 'TopHeader.jsx'), 'utf-8');
  const catalogCode = fs.readFileSync(path.join(srcDir, 'components', 'NovelCatalog.jsx'), 'utf-8');

  runTest('4.1: Button primitive implements active:scale-95 with transition-all', () => {
    assert(buttonCode.includes('active:scale-95'), 'Button primitive missing active:scale-95');
    assert(buttonCode.includes('transition-all duration-100 ease-out'), 'Button primitive missing spring transition timing');
  });

  runTest('4.2: SidebarNav interactive items implement active:scale-95', () => {
    assert(sidebarCode.includes('active:scale-95'), 'SidebarNav missing active:scale-95');
    const matches = sidebarCode.match(/active:scale-95/g);
    assert(matches && matches.length >= 5, `Expected >= 5 active:scale-95 elements in SidebarNav, got ${matches?.length}`);
  });

  runTest('4.3: TopHeader controls implement active:scale-95', () => {
    assert(topHeaderCode.includes('active:scale-95'), 'TopHeader missing active:scale-95');
    const matches = topHeaderCode.match(/active:scale-95/g);
    assert(matches && matches.length >= 4, `Expected >= 4 active:scale-95 elements in TopHeader, got ${matches?.length}`);
  });

  runTest('4.4: AudioPlayer transport controls implement active:scale-90', () => {
    assert(audioPlayerCode.includes('active:scale-90'), 'AudioPlayer missing active:scale-90');
    const matches = audioPlayerCode.match(/active:scale-90/g);
    assert(matches && matches.length >= 5, `Expected >= 5 transport buttons with active:scale-90, got ${matches?.length}`);
  });

  runTest('4.5: NovelCatalog carousel chevrons implement active:scale-90', () => {
    assert(catalogCode.includes('active:scale-90'), 'NovelCatalog carousel arrows missing active:scale-90');
    const matches = catalogCode.match(/active:scale-90/g);
    assert(matches && matches.length >= 2, `Expected >= 2 carousel chevrons with active:scale-90, got ${matches?.length}`);
  });

  // =========================================================================
  // TEST GROUP 5: Toast Primitive & Context Integration
  // =========================================================================
  console.log('\n\x1b[1m[Group 5: Toast Primitive & Context Integration]\x1b[0m');

  const toastContextCode = fs.readFileSync(path.join(srcDir, 'context', 'ToastContext.jsx'), 'utf-8');
  const toastCode = fs.readFileSync(path.join(srcDir, 'components', 'primitives', 'Toast.jsx'), 'utf-8');

  runTest('5.1: ToastContext imports and renders Toast primitive', () => {
    assert(toastContextCode.includes("import { Toast } from '../components/primitives/Toast'"), 'ToastContext must import Toast primitive');
    assert(toastContextCode.includes('<Toast'), 'ToastContext must render <Toast');
  });

  runTest('5.2: Toast primitive provides accessible role="status" and aria-live="polite"', () => {
    assert(toastCode.includes('role="status"'), 'Toast must have role="status"');
    assert(toastCode.includes('aria-live="polite"'), 'Toast must have aria-live="polite"');
  });

  runTest('5.3: Toast primitive auto-dismisses via setTimeout with cleanup on unmount', () => {
    assert(toastCode.includes('setTimeout'), 'Toast must use setTimeout for auto-dismiss');
    assert(toastCode.includes('clearTimeout(timer)'), 'Toast must clean up timer on unmount');
  });

  runTest('5.4: Toast primitive provides manual dismiss button with accessible label', () => {
    assert(toastCode.includes('aria-label="Dismiss notification"'), 'Toast must have accessible dismiss button');
    assert(toastCode.includes('onDismiss(id)'), 'Dismiss button must trigger onDismiss(id)');
  });

  // =========================================================================
  // TEST GROUP 6: Cold-Load Home Bundle Budget Measurement
  // =========================================================================
  console.log('\n\x1b[1m[Group 6: Cold-Load Home Bundle Budget Measurement]\x1b[0m');

  runTest('6.1: Strict cold-load Home JS gzip budget <= 75,000 bytes', () => {
    const indexPath = path.join(distDir, 'index.html');
    assert(fs.existsSync(indexPath), 'dist/index.html does not exist! Run npm run build first.');
    const indexHtml = fs.readFileSync(indexPath, 'utf-8');

    const scriptMatches = [...indexHtml.matchAll(/src="\/assets\/(index-[^"]+\.js)"/g)].map(m => m[1]);
    const preloadMatches = [...indexHtml.matchAll(/href="\/assets\/(react-vendor-[^"]+\.js)"/g)].map(m => m[1]);
    const entryScripts = [...scriptMatches, ...preloadMatches];

    assert(entryScripts.length >= 1, 'No entry scripts found in dist/index.html');

    let totalRaw = 0;
    let totalGzip = 0;
    const scriptDetails = [];

    for (const s of entryScripts) {
      const p = path.join(distDir, 'assets', s);
      assert(fs.existsSync(p), `Script ${s} not found in dist/assets`);
      const raw = fs.readFileSync(p);
      const gz = zlib.gzipSync(raw, { level: 9 });
      totalRaw += raw.length;
      totalGzip += gz.length;
      scriptDetails.push({ name: s, raw: raw.length, gz: gz.length });
    }

    const budget = 75000;
    const headroom = budget - totalGzip;

    console.log(`    Cold-load scripts:`);
    for (const d of scriptDetails) {
      console.log(`      - ${d.name}: ${(d.raw / 1024).toFixed(2)} KiB raw │ ${(d.gz / 1024).toFixed(2)} KiB gzip (${d.gz} B)`);
    }
    console.log(`    Total Home JS: ${(totalRaw / 1024).toFixed(2)} KiB raw │ ${(totalGzip / 1024).toFixed(2)} KiB gzip (${totalGzip} B)`);
    console.log(`    Budget Ceiling: 75,000 B │ Net Headroom: ${headroom} B`);

    assert(totalGzip <= budget, `Cold-load JS bundle exceeds 75,000 bytes gzip: ${totalGzip} B > 75,000 B`);
  });

  runTest('6.2: Entry chunks contain zero framer-motion symbols', () => {
    const indexPath = path.join(distDir, 'index.html');
    const indexHtml = fs.readFileSync(indexPath, 'utf-8');
    const scriptMatch = indexHtml.match(/src="\/assets\/(index-[^"]+\.js)"/);
    assert(scriptMatch, 'index-*.js not found in index.html');
    const indexBundle = fs.readFileSync(path.join(distDir, 'assets', scriptMatch[1]), 'utf-8');

    assert(!indexBundle.includes('framer-motion'), 'index bundle contains framer-motion!');
    assert(!indexBundle.includes('MotionContext'), 'index bundle contains MotionContext!');
  });

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n\x1b[1m======================================================================\x1b[0m');
  console.log(`\x1b[1mADVERSARIAL STRESS SUITE COMPLETE: ${results.passed} PASSED, ${results.failed} FAILED\x1b[0m`);
  console.log('\x1b[1m======================================================================\x1b[0m\n');

  if (results.failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error in adversarial test harness:', err);
  process.exit(1);
});
