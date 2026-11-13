import { parseSegmentImage } from '../utils/segmentUtils';

/**
 * Legacy character-based paginator extracted from OpenGLPageReader.jsx.
 * Preserved for Phase 0.5 zero-behavior-change guarantee until Agent B wires Contract 3.
 */
export function paginateSegments(segments = [], charsPerPage = 850) {
  if (!segments || segments.length === 0) return [];

  const pages = [];
  let currentPage = [];
  let currentChars = 0;

  for (const seg of segments) {
    const { imgUrl, cleanText } = parseSegmentImage(seg);

    // Standalone illustration: dedicated page
    if (imgUrl && !cleanText) {
      if (currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [];
        currentChars = 0;
      }
      pages.push([seg]);
      continue;
    }

    let textLen = (cleanText || seg.text || '').length;
    if (imgUrl && cleanText) {
      textLen += 450;
    }

    // If page is not empty and adding this segment exceeds target character count, start new page
    if (currentPage.length > 0 && currentChars + textLen > charsPerPage && currentPage.length >= 2) {
      pages.push(currentPage);
      currentPage = [seg];
      currentChars = textLen;
    } else {
      currentPage.push(seg);
      currentChars += textLen;
    }
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  // If character-based pagination produced only 1 page but chapter has >= 2 segments,
  // split segments into smaller pages of at most 2-3 segments per page (or ~450 chars)
  // so every multi-paragraph chapter has multiple pages and spreads that can turn!
  if (pages.length === 1 && segments.length >= 2) {
    const subPages = [];
    let cur = [];
    let chars = 0;
    const maxChars = Math.min(charsPerPage, 450);
    const maxSegs = segments.length <= 3 ? 1 : 2;

    for (const seg of segments) {
      const { imgUrl, cleanText } = parseSegmentImage(seg);

      // Standalone illustration: dedicated page
      if (imgUrl && !cleanText) {
        if (cur.length > 0) {
          subPages.push(cur);
          cur = [];
          chars = 0;
        }
        subPages.push([seg]);
        continue;
      }

      let textLen = (cleanText || seg.text || '').length;
      if (imgUrl && cleanText) {
        textLen += 450;
      }

      if (cur.length > 0 && (chars + textLen > maxChars || cur.length >= maxSegs)) {
        subPages.push(cur);
        cur = [seg];
        chars = textLen;
      } else {
        cur.push(seg);
        chars += textLen;
      }
    }
    if (cur.length > 0) {
      subPages.push(cur);
    }
    if (subPages.length > 1) {
      return subPages;
    }
    // Fallback for short segments: 1 per page if <= 3 segments, else 2 per page
    const fallbackPages = [];
    const step = segments.length <= 3 ? 1 : 2;
    for (let i = 0; i < segments.length; i += step) {
      fallbackPages.push(segments.slice(i, i + step));
    }
    return fallbackPages;
  }

  if (pages.length >= 2) {
    const lastPage = pages[pages.length - 1];
    const penPage = pages[pages.length - 2];
    if (lastPage.length === 1 && penPage.length >= 3) {
      const movedSeg = penPage[penPage.length - 1];
      pages[pages.length - 2] = penPage.slice(0, -1);
      pages[pages.length - 1] = [movedSeg, ...lastPage];
    }
  }

  return pages;
}

/**
 * CONTRACT 3 — FROZEN SPECIFICATION
 * paginate({ segments, contentBox, typography: { family, size, lineHeight }, measure })
 *   -> pages: [{ parts: [{ segmentId, text, partIndex }] }]
 *
 * Implemented and tested by Agent B.
 */
export function paginate({
  segments = [],
  contentBox = { w: 400, h: 600 },
  typography = { family: 'Newsreader', size: 18, lineHeight: 1.6 },
  measure = null,
} = {}) {
  const w = contentBox?.w || 400;
  const h = contentBox?.h || 600;
  const size = typography?.size || 18;
  const lh = typography?.lineHeight || 1.6;
  const charsPerLine = Math.max(20, Math.floor(w / (size * 0.52)));
  const linesPerPage = Math.max(10, Math.floor(h / (size * lh)));
  const dynamicChars = Math.round(charsPerLine * linesPerPage * 0.85);

  const rawPages = paginateSegments(segments, dynamicChars);
  return rawPages.map((pageSegs, pageIndex) => ({
    pageIndex,
    parts: pageSegs.map((seg, partIndex) => ({
      segmentId: seg.id || seg.segment_id || seg.order,
      text: seg.text || '',
      partIndex,
      rawSegment: seg,
    })),
  }));
}

export default paginateSegments;

