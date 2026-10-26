/**
 * Cover-derived card accent clamping utility.
 * Measures contrast against each theme's --bg-card and adjacent --bg-page.
 * Clamps lightness in OKLCH (preserving hue & chroma) until >= 3.0:1 (WCAG 1.4.11),
 * or falls back to theme --accent if ΔL > 0.15.
 */

const THEME_SURFACES = {
  dark: { card: '#161922', page: '#0F1117', accent: '#FF5C35' },
  light: { card: '#F3F4F6', page: '#FAFBFD', accent: '#D9381E' },
};

const NEED_CONTRAST = 3.0;
const MAX_DELTA_L = 0.15;

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [r, g, b];
}

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b]
    .map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export function rgbToOklch([r, g, b]) {
  const R = toLin(r), G = toLin(g), B = toLin(b);
  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const C = Math.hypot(a, bb);
  let H = (Math.atan2(bb, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return [L, C, H];
}

export function oklchToRgb(L, C, H) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const B = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const out = [R, G, B].map((v) => fromLin(v));
  const inGamut = out.every((v) => v >= -0.0005 && v <= 1.0005);
  return { rgb: out.map((v) => Math.min(1, Math.max(0, v))), inGamut };
}

export function getLuminance([r, g, b]) {
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

export function getContrast(rgbA, rgbB) {
  const a = getLuminance(rgbA);
  const b = getLuminance(rgbB);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

function fitGamut(L, C, H) {
  let c = C;
  for (let i = 0; i < 40; i++) {
    const { inGamut } = oklchToRgb(L, c, H);
    if (inGamut) break;
    c *= 0.92;
  }
  return oklchToRgb(L, c, H).rgb;
}

/**
 * Clamps a cover color to satisfy 3:1 contrast against both card and page surfaces.
 */
export function clampCoverAccent(hex, theme = 'dark') {
  const surfaces = THEME_SURFACES[theme] || THEME_SURFACES.dark;
  const cardRgb = hexToRgb(surfaces.card);
  const pageRgb = hexToRgb(surfaces.page);
  const fallbackAccent = surfaces.accent;

  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) {
    return fallbackAccent;
  }

  const srcRgb = hexToRgb(hex);
  const [L0, C0, H0] = rgbToOklch(srcRgb);
  const rawCard = getContrast(srcRgb, cardRgb);
  const rawPage = getContrast(srcRgb, pageRgb);

  if (rawCard >= NEED_CONTRAST && rawPage >= NEED_CONTRAST) {
    return hex;
  }

  let best = null;
  for (let step = 1; step <= 60; step++) {
    for (const dir of [-1, 1]) {
      const deltaL = dir * step * 0.012;
      const L = L0 + deltaL;
      if (Math.abs(deltaL) > MAX_DELTA_L || L < 0.08 || L > 0.97) continue;

      const testRgb = fitGamut(L, C0, H0);
      const cCard = getContrast(testRgb, cardRgb);
      const cPage = getContrast(testRgb, pageRgb);

      if (cCard >= NEED_CONTRAST && cPage >= NEED_CONTRAST) {
        if (!best || Math.abs(deltaL) < Math.abs(best.deltaL)) {
          best = { deltaL, hex: rgbToHex(testRgb) };
        }
      }
    }
    if (best) break;
  }

  if (best) return best.hex;
  return fallbackAccent;
}
