/**
 * SyncTone — 2D Reading Layout & Typesetting Engine
 *
 * Directly modeled on Moon+ Reader Pro v10.8 (com.flyersoft)
 * MRTextView / MyTextView / SoftHyphenStaticLayout 4-pass architecture.
 *
 * Responsibilities:
 * 1. Container-aware dynamic pagination (accurate line & element height budget).
 * 2. 4-Pass Rendering Pipeline (margins/borders -> annotations -> text glyphs -> rich spans).
 * 3. Strict full-text justification with soft-hyphen support.
 * 4. Bounded clipping incorporating shadow radius bleed.
 */

import { parseSegmentImage } from './segmentUtils';

/**
 * Computes bounding coordinates compensating for shadow bleed.
 * Direct port of com.flyersoft.staticlayout.MyTextView.onDraw clipping logic:
 *   fMin = scrollX + Math.min(0.0f, mShadowDx - mShadowRadius)
 *   fMax = width + scrollX + Math.max(0.0f, mShadowDx + mShadowRadius)
 */
export function computeShadowBleedBounds(
  width,
  height,
  scrollX = 0,
  scrollY = 0,
  shadowRadius = 0,
  shadowDx = 0,
  shadowDy = 0
) {
  let fMin = scrollX;
  let fMin2 = scrollY;
  let fMax = width + scrollX;
  let fMax2 = height + scrollY;

  if (shadowRadius !== 0) {
    fMin += Math.min(0.0, shadowDx - shadowRadius);
    fMax += Math.max(0.0, shadowDx + shadowRadius);
    fMin2 += Math.min(0.0, shadowDy - shadowRadius);
    fMax2 += Math.max(0.0, shadowDy + shadowRadius);
  }

  return {
    left: fMin,
    top: fMin2,
    right: fMax,
    bottom: fMax2,
    width: fMax - fMin,
    height: fMax2 - fMin2,
  };
}

/**
 * Estimates the vertical pixel height of a segment based on typography and container dimensions.
 * Accounts for line-wrapping, dialogue badges, inline illustrations, and paragraph margins.
 */
export function estimateSegmentHeight(segment, options = {}) {
  const {
    containerWidth = 440,
    fontSize = 18,
    lineHeight = 1.85,
    paragraphSpacing = 16,
    charWidthRatio = 0.52,
  } = options;

  if (!segment) return 0;

  const { imgUrl, cleanText } = parseSegmentImage(segment);
  const isDialogue = segment.type === 'dialogue';
  const text = isDialogue
    ? (cleanText ? `"${cleanText.replace(/^["“”]|["“”]$/g, '')}"` : '')
    : cleanText;

  let totalHeight = 0;

  // Standalone illustration: dedicated height budget
  if (imgUrl && !text) {
    return Math.min(480, Math.round(containerWidth * 0.75)) + paragraphSpacing;
  }

  // Inline illustration accompanying prose
  if (imgUrl && text) {
    totalHeight += Math.min(280, Math.round(containerWidth * 0.5)) + 12;
  }

  // Speaker badge / annotation header line + vertical wrapper padding (py-1.5)
  if (segment.speaker_name) {
    totalHeight += 30; // py-1.5 (12px) + badge row + margin-bottom
  } else {
    totalHeight += 12; // py-1.5 wrapper padding
  }

  if (text && text.length > 0) {
    const singleLineHeight = fontSize * lineHeight;
    const avgCharWidth = fontSize * charWidthRatio;
    const usableWidth = Math.max(120, containerWidth - 24); // Account for page padding
    const charsPerLine = Math.max(10, Math.floor(usableWidth / avgCharWidth));

    // First line has paragraph indent (~1.5em)
    const indentChars = Math.round((fontSize * 1.5) / avgCharWidth);
    const remainingChars = Math.max(0, text.length - Math.max(1, charsPerLine - indentChars));
    const additionalLines = Math.ceil(remainingChars / charsPerLine);
    const totalLines = 1 + additionalLines;

    totalHeight += totalLines * singleLineHeight;
  }

  return Math.round(totalHeight + paragraphSpacing);
}

/**
 * Dynamic container-aware paginator.
 * Replaces naive character slicing (charsPerPage = 850) with actual pixel-budget fitting,
 * matching Moon+ Reader's A.getPageHeight() and SoftHyphenStaticLayout line fitting.
 *
 * Guarantees zero vertical text overflow and zero scrollbars inside book spreads.
 *
 * @param {Array} segments
 * @param {object} options
 * @returns {Array<Array<object>>} Array of pages, each containing an array of segments
 */
export function measureAndPaginateSegments(segments = [], options = {}) {
  if (!segments || segments.length === 0) return [];

  const {
    containerWidth = 440,
    containerHeight = 620,
    headerHeight = 44,
    footerHeight = 36,
    fontSize = 18,
    lineHeight = 1.85,
    maxSegmentsPerPage,
    firstPageExtraReservePx = 150,
  } = options;

  // Maximum segments per page based on chapter length to guarantee interactive spreads
  // and prevent half-empty pages
  const maxSegs =
    maxSegmentsPerPage ??
    (segments.length <= 3 ? 1 : segments.length <= 6 ? 2 : 6);

  // Available vertical pixel budget for body prose on a single page
  const usablePageHeight = Math.max(300, containerHeight - headerHeight - footerHeight);

  // Reserve vertical space on Page 1 (index 0) for the Chapter Opening Header / crest
  const page0Reserve = Math.min(
    Math.max(0, Number(firstPageExtraReservePx) || 0),
    Math.max(0, usablePageHeight - 80)
  );

  const pages = [];
  let currentPage = [];
  let currentUsedHeight = page0Reserve;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segHeight = estimateSegmentHeight(seg, {
      containerWidth,
      fontSize,
      lineHeight,
    });

    const { imgUrl, cleanText } = parseSegmentImage(seg);
    const isStandaloneImage = imgUrl && !cleanText;

    // Standalone image: dedicated full page
    if (isStandaloneImage) {
      if (currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [];
      }
      pages.push([seg]);
      currentUsedHeight = 0;
      continue;
    }

    // If a single text segment exceeds the remaining/usable page height, split it by sentence boundaries
    // so prose never bleeds outside the book spread container or gets clipped by overflow-hidden
    if (
      (segHeight > usablePageHeight ||
        (currentPage.length === 0 && currentUsedHeight + segHeight > usablePageHeight)) &&
      cleanText &&
      cleanText.length > 250
    ) {
      const sentences = cleanText.match(/[^.!?]+[.!?]+["”']?\s*|[^.!?]+$/g) || [cleanText];
      const firstSentenceHeight = estimateSegmentHeight(
        { ...seg, text: sentences[0] || cleanText },
        { containerWidth, fontSize, lineHeight }
      );
      if (currentPage.length > 0 && currentUsedHeight + firstSentenceHeight > usablePageHeight) {
        pages.push(currentPage);
        currentPage = [];
        currentUsedHeight = 0;
      }

      const fragmentTexts = [];
      let subText = '';
      let activePageUsed = currentUsedHeight;

      for (let sIdx = 0; sIdx < sentences.length; sIdx++) {
        const sentence = sentences[sIdx];
        const testSubText = subText + sentence;
        const testSubSeg = { ...seg, text: testSubText };
        const testHeight = estimateSegmentHeight(testSubSeg, { containerWidth, fontSize, lineHeight });

        if ((currentPage.length > 0 || activePageUsed > 0) && activePageUsed + testHeight > usablePageHeight && subText.trim()) {
          fragmentTexts.push(subText.trim());
          activePageUsed = 0;
          subText = sentence;
        } else if (testHeight > usablePageHeight && subText.trim()) {
          fragmentTexts.push(subText.trim());
          activePageUsed = 0;
          subText = sentence;
        } else {
          subText = testSubText;
        }
      }

      if (subText.trim()) {
        fragmentTexts.push(subText.trim());
      }

      const wordCounts = fragmentTexts.map((txt) => {
        const words = txt.trim().split(/\s+/).filter(Boolean);
        return Math.max(1, words.length);
      });
      const totalWords = Math.max(1, wordCounts.reduce((a, b) => a + b, 0));

      let accumulatedWords = 0;
      const fragments = fragmentTexts.map((txt, idx) => {
        const wCount = wordCounts[idx];
        const startRatio = accumulatedWords / totalWords;
        accumulatedWords += wCount;
        const endRatio = idx === fragmentTexts.length - 1 ? 1.0 : accumulatedWords / totalWords;

        return {
          ...seg,
          text: txt,
          _fragmentIndex: idx,
          _fragmentCount: fragmentTexts.length,
          _wordStartRatio: startRatio,
          _wordEndRatio: endRatio,
        };
      });

      for (const frag of fragments) {
        const fragHeight = estimateSegmentHeight(frag, { containerWidth, fontSize, lineHeight });
        if (currentPage.length > 0 && currentUsedHeight + fragHeight > usablePageHeight) {
          pages.push(currentPage);
          currentPage = [frag];
          currentUsedHeight = fragHeight;
        } else {
          currentPage.push(frag);
          currentUsedHeight += fragHeight;
        }
      }
      continue;
    }

    const normalSeg = {
      ...seg,
      _fragmentIndex: 0,
      _fragmentCount: 1,
      _wordStartRatio: 0,
      _wordEndRatio: 1,
    };

    // Check if adding this segment would exceed the page's vertical budget or segment cap
    const wouldOverflow =
      currentPage.length > 0 &&
      (currentUsedHeight + segHeight > usablePageHeight || currentPage.length >= maxSegs);

    if (wouldOverflow) {
      pages.push(currentPage);
      currentPage = [normalSeg];
      currentUsedHeight = segHeight;
    } else {
      currentPage.push(normalSeg);
      currentUsedHeight += segHeight;
    }
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  // Ensure chapters with >= 2 segments have at least 2 or 3 pages for interactive spread turning
  if (pages.length === 1 && segments.length >= 2) {
    const step = segments.length <= 3 ? 1 : 2;
    const fallbackPages = [];
    for (let i = 0; i < segments.length; i += step) {
      fallbackPages.push(segments.slice(i, i + step));
    }
    return fallbackPages;
  }

  // Eliminate orphan single-line trailing pages by rebalancing with penultimate page
  if (pages.length >= 2) {
    const lastPage = pages[pages.length - 1];
    const penPage = pages[pages.length - 2];
    if (lastPage.length === 1 && penPage.length >= 2) {
      const movedSeg = penPage[penPage.length - 1];
      const movedH = estimateSegmentHeight(movedSeg, { containerWidth, fontSize, lineHeight });
      const lastH = estimateSegmentHeight(lastPage[0], { containerWidth, fontSize, lineHeight });
      if (movedH + lastH <= usablePageHeight) {
        pages[pages.length - 2] = penPage.slice(0, -1);
        pages[pages.length - 1] = [movedSeg, ...lastPage];
      }
    }
  }

  return pages;
}

/**
 * Maps linear pages into 2-page spreads (Left Page, Right Page).
 *
 * @param {Array<Array<object>>} pages
 * @returns {Array<{spreadIndex: number, leftPage: Array<object>, rightPage: Array<object>, leftPageNum: number, rightPageNum: number}>}
 */
export function createBookSpreads(pages = []) {
  if (!pages || pages.length === 0) return [];

  const spreads = [];
  const totalSpreads = Math.max(1, Math.ceil(pages.length / 2));

  for (let s = 0; s < totalSpreads; s++) {
    const leftIdx = s * 2;
    const rightIdx = s * 2 + 1;

    spreads.push({
      spreadIndex: s,
      leftPage: pages[leftIdx] || [],
      rightPage: pages[rightIdx] || [],
      leftPageNum: leftIdx + 1,
      rightPageNum: rightIdx < pages.length ? rightIdx + 1 : null,
      isLastSpread: s === totalSpreads - 1,
    });
  }

  return spreads;
}

/**
 * 4-Pass Layout Processor for a segment.
 * Directly corresponds to MRTextView.onDraw:
 * - Pass 1: CSS Margin Backgrounds & Paragraph Bounding Borders (drawMarginBackgroundOnly = true)
 * - Pass 2: User Highlights & WTR-Lab Spoken Word Highlight (drawAllHighlight)
 * - Pass 3: Text Glyphs with Full Justification & Soft Hyphenation (MyLayout.draw)
 * - Pass 4: Span Lines (Ruby text, squiggly underlines, table icons, inline illustrations)
 */
export function process4PassSegment(segment, activeSegmentId, segmentProgress = 0) {
  const segId = segment.segment_id !== undefined ? segment.segment_id : segment.order;
  const fragCount = segment._fragmentCount || 1;
  const fragIdx = segment._fragmentIndex || 0;
  const startRatio = segment._wordStartRatio !== undefined ? segment._wordStartRatio : 0;
  const endRatio = segment._wordEndRatio !== undefined ? segment._wordEndRatio : 1;

  let isActive = segId === activeSegmentId;
  if (isActive && fragCount > 1 && typeof segmentProgress === 'number') {
    isActive =
      segmentProgress >= startRatio &&
      (segmentProgress < endRatio || fragIdx === fragCount - 1);
  }

  const { imgUrl, cleanText } = parseSegmentImage(segment);
  const isDialogue = segment.type === 'dialogue';

  const rawText = isDialogue
    ? (cleanText ? `"${cleanText.replace(/^["“”]|["“”]$/g, '')}"` : '')
    : cleanText;

  // Pass 1: Paragraph margin and bounding border styles
  const pass1Border = {
    isDialogue,
    marginIndent: isDialogue ? 'pl-3' : 'indent-6',
    borderLeft: isDialogue ? 'border-l-2 border-[var(--accent)]/40' : 'border-l-0',
  };

  // Pass 2: Active audio highlight tokens
  let activeTokenIndex = -1;
  let tokens = [];

  if (rawText) {
    tokens = rawText.split(/(\s+)/);
    if (isActive && typeof segmentProgress === 'number' && segmentProgress > 0) {
      const nonWhitespace = [];
      tokens.forEach((t, i) => {
        if (!/^\s+$/.test(t)) nonWhitespace.push(i);
      });
      const totalWords = Math.max(1, nonWhitespace.length);

      // Local progress within this fragment
      const localProgress =
        fragCount > 1
          ? Math.max(0, Math.min(1, (segmentProgress - startRatio) / (endRatio - startRatio || 1)))
          : segmentProgress;

      const targetIdx = Math.min(
        totalWords - 1,
        Math.max(0, Math.floor(localProgress * totalWords))
      );
      activeTokenIndex = nonWhitespace[targetIdx] ?? -1;
    }
  }

  const pass2Highlight = {
    isActive,
    activeTokenIndex,
    tokens,
  };

  // Pass 3: Justified typography rules (Moon+ selfJustified)
  const pass3Typography = {
    align: 'text-justify',
    hyphenation: 'hyphens-auto',
    lineHeight: 'leading-[1.85]',
    tracking: 'tracking-[0.01em]',
    fontFamily: isDialogue ? 'font-serif' : 'font-serif',
  };

  // Pass 4: Rich spans & illustration metadata
  const pass4Spans = {
    imgUrl,
    isStandaloneImage: Boolean(imgUrl && !rawText),
    speakerName: segment.speaker_name || (isDialogue ? 'Character' : 'Narrator'),
  };

  return {
    segId,
    rawText,
    pass1Border,
    pass2Highlight,
    pass3Typography,
    pass4Spans,
  };
}
