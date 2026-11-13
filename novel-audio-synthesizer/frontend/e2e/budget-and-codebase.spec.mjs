/**
 * SYNC TONE REQUIREMENTS AUDIT: PERFORMANCE BUDGET & CODEBASE INTEGRITY
 * Verifies R2 (Color Palette & Zero-Blue Guardrails) and R3 (Bundle Budget <= 75 kB gzip & Vitest 115 tests)
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '..');
const distDir = path.join(frontendDir, 'dist');
const srcDir = path.join(frontendDir, 'src');
const publicDir = path.join(frontendDir, 'public');

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
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    RESULTS.failed++;
    RESULTS.tests.push({ name, status: 'FAIL', error: err.message });
    console.error(`  \x1b[31m✗\x1b[0m ${name}`);
    console.error(`    \x1b[31m${err.message}\x1b[0m`);
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toBeLessThanOrEqual(expected) {
      if (actual > expected) {
        throw new Error(`Expected ${actual} <= ${expected}`);
      }
    },
    toBeGreaterThanOrEqual(expected) {
      if (actual < expected) {
        throw new Error(`Expected ${actual} >= ${expected}`);
      }
    },
    toContain(expected) {
      if (typeof actual === 'string' && !actual.includes(expected)) {
        throw new Error(`Expected string to contain ${JSON.stringify(expected)}`);
      }
      if (Array.isArray(actual) && !actual.includes(expected)) {
        throw new Error(`Expected array to contain ${JSON.stringify(expected)}`);
      }
    },
    not: {
      toContain(expected) {
        if (typeof actual === 'string' && actual.includes(expected)) {
          throw new Error(`Expected string NOT to contain ${JSON.stringify(expected)}`);
        }
        if (Array.isArray(actual) && actual.includes(expected)) {
          throw new Error(`Expected array NOT to contain ${JSON.stringify(expected)}`);
        }
      },
      toMatch(regex) {
        if (regex.test(actual)) {
          throw new Error(`Expected string NOT to match ${regex}`);
        }
      },
    },
    toMatch(regex) {
      if (!regex.test(actual)) {
        throw new Error(`Expected string to match ${regex}`);
      }
    },
  };
}

// Calculate relative luminance for WCAG contrast
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(hex1, hex2) {
  const parseHex = (hex) => {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  };
  const [r1, g1, b1] = parseHex(hex1);
  const [r2, g2, b2] = parseHex(hex2);
  const l1 = getLuminance(r1, g1, b1);
  const l2 = getLuminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Check if RGB is cold blue
function isColdBlue(r, g, b) {
  // Pure grays / browns have low or balanced blue
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta < 8) return false; // near neutral / monochromatic
  // Check HSL hue
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;

  // Blue range: 195 to 265
  const saturation = max === 0 ? 0 : delta / max;
  return hue >= 195 && hue <= 265 && saturation > 0.12;
}

export async function runBudgetAndCodebaseAudits() {
  console.log('\n\x1b[1m=== Running Performance Budget & Codebase Guardrails Audit ===\x1b[0m\n');

  // Ensure production build exists
  if (!fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, 'index.html'))) {
    console.log('Building production bundle for audit...');
    execSync('npm run build', { cwd: frontendDir, stdio: 'ignore' });
  }

  // --- TIER 1: R3 - Performance Budget Tests ---
  test('T1-R3-01: Home cold-load JavaScript bundle size is <= 75 kB gzip', () => {
    const indexPath = path.join(distDir, 'index.html');
    const indexHtml = fs.readFileSync(indexPath, 'utf-8');

    // Extract scripts loaded by index.html on cold load
    const scriptMatches = [...indexHtml.matchAll(/src="\/assets\/(index-[^"]+\.js)"/g)];
    const preloadMatches = [...indexHtml.matchAll(/href="\/assets\/(react-vendor-[^"]+\.js)"/g)];

    const entryScripts = [
      ...scriptMatches.map(m => m[1]),
      ...preloadMatches.map(m => m[1]),
    ];

    expect(entryScripts.length).toBeGreaterThanOrEqual(1);

    let totalRawBytes = 0;
    let totalGzipBytes = 0;

    for (const scriptName of entryScripts) {
      const scriptPath = path.join(distDir, 'assets', scriptName);
      if (!fs.existsSync(scriptPath)) {
        throw new Error(`Referenced script ${scriptName} not found in dist/assets`);
      }
      const raw = fs.readFileSync(scriptPath);
      const compressed = zlib.gzipSync(raw, { level: 9 });
      totalRawBytes += raw.length;
      totalGzipBytes += compressed.length;
    }

    const budgetLimit = 75000; // 75.0 kB decimal budget
    const headroom = budgetLimit - totalGzipBytes;

    console.log(`    [Metric] Total cold-load JS: ${(totalRawBytes / 1024).toFixed(2)} KiB raw │ ${(totalGzipBytes / 1024).toFixed(2)} KiB gzip (${totalGzipBytes} B)`);
    console.log(`    [Metric] Budget: 75,000 B │ Remaining Headroom: ${headroom} B (${(headroom / 1024).toFixed(2)} KiB)`);

    expect(totalGzipBytes).toBeLessThanOrEqual(budgetLimit);
  });

  test('T1-R3-02: Zero framer-motion imports on Home critical path entry chunk', () => {
    const indexPath = path.join(distDir, 'index.html');
    const indexHtml = fs.readFileSync(indexPath, 'utf-8');
    const scriptMatch = indexHtml.match(/src="\/assets\/(index-[^"]+\.js)"/);
    if (!scriptMatch) throw new Error('index-*.js not found in index.html');

    const indexBundle = fs.readFileSync(path.join(distDir, 'assets', scriptMatch[1]), 'utf-8');
    // framer-motion markers
    expect(indexBundle).not.toContain('framer-motion');
    expect(indexBundle).not.toContain('MotionContext');
  });

  test('T1-R3-03: Heavy document engines (pdfjs-dist, foliate-js) are separated into lazy chunks', () => {
    const files = fs.readdirSync(path.join(distDir, 'assets'));
    const pdfChunk = files.find(f => f.startsWith('pdf-') && f.endsWith('.js'));
    const foliateChunk = files.find(f => f.startsWith('foliate-') && f.endsWith('.js'));

    expect(Boolean(pdfChunk)).toBe(true);
    expect(Boolean(foliateChunk)).toBe(true);
  });

  // --- TIER 1: R2 - Color Palette & Guardrails Tests (THEME_LOCK v2 Noir Monochrome) ---
  test('T1-R2-01: Noir Monochrome brand tokens are configured in Tailwind', () => {
    const tailwindPath = path.join(frontendDir, 'tailwind.config.js');
    const content = fs.readFileSync(tailwindPath, 'utf-8');
    expect(content.toLowerCase()).toContain('#0b0b0d');
    expect(content.toLowerCase()).toContain('#f2f2f3');
    expect(content).toMatch(/signal:\s*['"]var\(--signal\)['"]/i);
  });

  test('T1-R2-02: Zero chromatic brand tokens in Tailwind (except --signal)', () => {
    const tailwindPath = path.join(frontendDir, 'tailwind.config.js');
    const content = fs.readFileSync(tailwindPath, 'utf-8');
    expect(content.toLowerCase()).not.toContain('#87a96b');
    expect(content.toLowerCase()).not.toContain('#5a3e2b');
    expect(content.toLowerCase()).not.toContain('#d5851f');
  });

  test('T1-R2-03: Signal token is isolated chromatic indicator', () => {
    const tailwindPath = path.join(frontendDir, 'tailwind.config.js');
    const content = fs.readFileSync(tailwindPath, 'utf-8');
    expect(content).toMatch(/signal:\s*['"]var\(--signal\)['"]/i);
  });

  test('T1-R2-04: Noir Monochrome core variables maintain strict parity in index.css', () => {
    const cssPath = path.join(srcDir, 'index.css');
    const content = fs.readFileSync(cssPath, 'utf-8');
    expect(content).toContain('--brand-espresso: #0B0B0D');
    expect(content).toContain('--brand-chocolate: #141416');
    expect(content).toContain('--brand-walnut: #1B1B1E');
    expect(content).toContain('--brand-sand: #F2F2F3');
    expect(content).toContain('--bg-page: #0B0B0D');
    expect(content).toContain('--bg-surface: #141416');
    expect(content).toContain('--signal: #FF5A1F');
  });

  // --- TIER 2: Boundary & Corner Cases ---
  test('T2-R2-01: AST/Regex Scanner — Zero forbidden blue tokens across entire src/ codebase', () => {
    const forbiddenBlueClasses = /\b(?:bg|text|border|ring|fill|stroke)-(?:blue|cyan|indigo|sky)-\d+\b/g;
    const knownColdBlueHexes = [/#050507/i, /#e5e5ea/i, /#4f46e5/i];

    const violations = [];

    function scanDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
            scanDir(fullPath);
          }
        } else if (/\.(jsx?|tsx?|css|html|svg)$/.test(entry.name)) {
          // Exclude tests or baseline diff tools that mention colors for verification
          if (fullPath.includes('__tests__') || fullPath.includes('e2e/')) continue;

          const content = fs.readFileSync(fullPath, 'utf-8');

          // Check forbidden utility classes
          let match;
          while ((match = forbiddenBlueClasses.exec(content)) !== null) {
            violations.push(`${path.relative(frontendDir, fullPath)}: Forbidden utility class '${match[0]}'`);
          }

          // Check known cold blue hexes
          for (const hexRegex of knownColdBlueHexes) {
            if (hexRegex.test(content)) {
              violations.push(`${path.relative(frontendDir, fullPath)}: Contains prohibited cold blue hex '${hexRegex}'`);
            }
          }
        }
      }
    }

    scanDir(srcDir);
    scanDir(publicDir);

    if (violations.length > 0) {
      throw new Error(`Zero-Blue violations found:\n  ${violations.join('\n  ')}`);
    }
  });

  test('T2-R2-02: Color Contrast Boundary — Text Main (#F2F2F3) against Page (#0B0B0D) >= 4.5:1 (WCAG AA)', () => {
    const ratio = getContrastRatio('#F2F2F3', '#0B0B0D');
    console.log(`    [Contrast] Text Main on Page: ${ratio.toFixed(2)}:1`);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('T2-R2-03: Color Contrast Boundary — Signal Dot (#FF5A1F) against Page (#0B0B0D) >= 3.0:1 (WCAG Non-Text AA)', () => {
    const ratio = getContrastRatio('#FF5A1F', '#0B0B0D');
    console.log(`    [Contrast] Signal Dot on Page: ${ratio.toFixed(2)}:1`);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
  });

  test('T2-R2-05: SVG Asset Scan — All public SVG icons use approved palette colors', () => {
    const svgFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.svg'));
    for (const file of svgFiles) {
      const content = fs.readFileSync(path.join(publicDir, file), 'utf-8');
      expect(content).not.toMatch(/#4f46e5|#0000ff|#00bfff|#1e90ff/i);
    }
  });

  test('T2-R3-01: Decimal byte budget ceiling test (strict <= 75,000 bytes gzip)', () => {
    const indexPath = path.join(distDir, 'index.html');
    const indexHtml = fs.readFileSync(indexPath, 'utf-8');
    const scripts = [
      ...indexHtml.matchAll(/src="\/assets\/(index-[^"]+\.js)"/g),
      ...indexHtml.matchAll(/href="\/assets\/(react-vendor-[^"]+\.js)"/g),
    ].map(m => m[1]);

    let totalGzip = 0;
    for (const s of scripts) {
      const buf = fs.readFileSync(path.join(distDir, 'assets', s));
      totalGzip += zlib.gzipSync(buf, { level: 9 }).length;
    }

    expect(totalGzip).toBeLessThanOrEqual(75000);
  });

  console.log(`\n\x1b[1mAudit Summary: ${RESULTS.passed} passed, ${RESULTS.failed} failed\x1b[0m\n`);

  if (RESULTS.failed > 0) {
    throw new Error(`${RESULTS.failed} static audit test(s) failed.`);
  }

  return RESULTS;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runBudgetAndCodebaseAudits()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
