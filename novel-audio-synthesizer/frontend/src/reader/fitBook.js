/**
 * CONTRACT 1 — FROZEN SPECIFICATION
 * fitBook(stage: { w, h }, opts) -> { layout, book, page, contentBox, gutter }
 *
 * Pure function, NO DOM dependencies.
 * Sizing rules:
 * - Single layout = 1 page (aspect 1 : 1.4 = 0.714 : 1)
 * - Spread layout = 2 pages side-by-side using adaptive width up to min(availW, 1180)
 *   and height bounded by min(availH, pageW * 1.4) so desktop spreads stay wide & readable
 * - Compact stage margins: PAD_X = 24, PAD_Y = 12
 * - Gutter: reserved on >= 640px for floating nav chevrons; on < 640px gutter = 0
 * - Real pixel geometry (no transform:scale)
 * - 8% hysteresis against layout flapping
 */

export const PAGE_ASPECT = 1.4; // height / width
export const MIN_READABLE_PAGE_WIDTH = 260; // minimum readable width in px
export const HYSTERESIS_FACTOR = 1.08; // 8% bias to retain existing layout
export const PAD_X = 24;
export const PAD_Y = 12;
export const MAX_SPREAD_WIDTH = 1180;

export function fitBook(stage = { w: 0, h: 0 }, opts = {}) {
  const stageW = Math.max(0, stage?.w || 0);
  const stageH = Math.max(0, stage?.h || 0);

  if (stageW === 0 || stageH === 0) {
    return {
      layout: 'single',
      book: { w: 0, h: 0 },
      page: { w: 0, h: 0 },
      contentBox: { w: 0, h: 0 },
      gutter: 0,
      padding: 0,
    };
  }

  // 1. Compact padding & navigation gutter
  const isDesktop = stageW >= 640;
  const padding = PAD_Y;
  const gutter = isDesktop ? (opts.gutter !== undefined ? opts.gutter : PAD_X) : 0;

  // Available stage area inside padding and gutters
  const horizReserve = isDesktop
    ? (opts.gutter !== undefined ? PAD_Y + opts.gutter : PAD_X)
    : PAD_Y;
  const availW = Math.max(0, stageW - 2 * horizReserve);
  const availH = Math.max(0, stageH - 2 * PAD_Y);

  // 3. Evaluate Single Page Layout (1 page)
  const singleMaxWFromH = availH / PAGE_ASPECT;
  const singlePageW = Math.min(availW, singleMaxWFromH);
  const singlePageH = singlePageW * PAGE_ASPECT;
  const singleArea = singlePageW * singlePageH;

  // 4. Evaluate Two-Page Spread Layout (2 pages side-by-side)
  // Adaptive spread uses up to min(availW, 1180) instead of rigid availH / 1.4 clamp
  const spreadBookW = Math.min(availW, MAX_SPREAD_WIDTH);
  const spreadPageW = spreadBookW / 2;
  const spreadPageH = Math.min(availH, spreadPageW * PAGE_ASPECT);
  const spreadTotalArea = 2 * spreadPageW * spreadPageH;

  const spreadAllowed = isDesktop && spreadPageW >= (opts.minReadableWidth || MIN_READABLE_PAGE_WIDTH);

  // 5. Layout decision with 8% hysteresis
  let layout = 'single';
  const prevLayout = opts.prevLayout;

  if (spreadAllowed) {
    if (prevLayout === 'spread') {
      // Biased towards keeping spread unless single is clearly much larger
      layout = spreadTotalArea * HYSTERESIS_FACTOR >= singleArea ? 'spread' : 'single';
    } else if (prevLayout === 'single') {
      // Biased towards keeping single
      layout = spreadTotalArea >= singleArea * HYSTERESIS_FACTOR ? 'spread' : 'single';
    } else {
      layout = spreadTotalArea >= singleArea ? 'spread' : 'single';
    }
  }

  // 6. Geometry derivation
  const bookW = Math.round(layout === 'spread' ? spreadBookW : singlePageW);
  const bookH = Math.round(layout === 'spread' ? spreadPageH : singlePageH);
  const pageW = Math.round(layout === 'spread' ? spreadPageW : singlePageW);
  const pageH = Math.round(layout === 'spread' ? spreadPageH : singlePageH);

  // 7. Content Box derivation (page padding for margins, header/footer numbers)
  const contentPaddingX = Math.round(Math.min(32, Math.max(16, pageW * 0.07)));
  const contentPaddingY = Math.round(Math.min(44, Math.max(24, pageH * 0.08)));
  const contentBoxW = Math.max(0, pageW - 2 * contentPaddingX);
  const contentBoxH = Math.max(0, pageH - 2 * contentPaddingY);

  return {
    layout,
    book: { w: bookW, h: bookH },
    page: { w: pageW, h: pageH },
    contentBox: { w: contentBoxW, h: contentBoxH },
    gutter,
    padding,
  };
}

export default fitBook;

