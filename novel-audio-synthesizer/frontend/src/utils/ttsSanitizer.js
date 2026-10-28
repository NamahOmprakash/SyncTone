import { cleanHtml } from 'tts-dom-cleaner';

const DEFAULT_REMOVE_PATTERNS = [
  /The text on this page is estimated to be only \d+(\.\d+)?% accurate/i,
  /This book was produced in EPUB format by the Internet Archive/i,
  /The book pages were scanned and converted to EPUB format automatically/i,
];

const BLOCK_TAG_DETECT_REGEX = /<(?:p|div|br|h[1-6]|article|section|blockquote|li|tr|table)\b/i;

/**
 * Safely sanitizes novel text or HTML using `tts-dom-cleaner` while:
 * 1) Preserving embedded `[IMAGE:...]` markers and converting `<img src="...">` to `[IMAGE:...]` blocks.
 * 2) Wrapping plaintext double-newline paragraphs in `<p>` tags when no HTML block tags are present
 *    so that `tts-dom-cleaner`'s `dedupeParagraphs`, `stripAsciiDividers`, and `removePatterns`
 *    operate per-paragraph instead of collapsing into a single DOM text node.
 *
 * @param {string} rawInput
 * @param {object} options
 * @returns {string}
 */
export function sanitizeTextWithTtsDomCleaner(rawInput, options = {}) {
  if (!rawInput || typeof rawInput !== 'string' || !rawInput.trim()) {
    return '';
  }

  // 1. Convert any HTML <img src="..."> tags into <p>[IMAGE:...]</p> blocks before DOM cleaning
  let prepared = rawInput.replace(
    /<img[^>]+src=["']([^"']+)["'][^>]*>/gi,
    (_match, src) => `<p>[IMAGE:${src.trim()}]</p>`
  );

  // 2. Ensure existing [IMAGE:...] markers are isolated as block paragraphs
  prepared = prepared.replace(/(\[IMAGE:[^\]]+\])/g, '\n\n$1\n\n');

  // 3. If input has no HTML block tags, wrap paragraphs in <p>...</p> so cheerio
  //    treats each paragraph as a separate block for deduplication & divider removal
  if (!BLOCK_TAG_DETECT_REGEX.test(prepared)) {
    const paragraphs = prepared
      .split(/\r?\n\s*\r?\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    prepared = paragraphs
      .map((p) => {
        // Keep inline spans/styles intact if present (e.g. <span style="display:none">trap</span>)
        return `<p>${p.replace(/\r?\n/g, '<br/>')}</p>`;
      })
      .join('\n');
  }

  return cleanHtml(prepared, {
    output: 'text',
    removeHidden: true,
    dedupeParagraphs: true,
    stripAsciiDividers: true,
    preserveLineBreaks: true,
    removeSelectors: ['.ad', '.watermark', '.patreon-box', '.hidden', '.sr-only'],
    removePatterns: DEFAULT_REMOVE_PATTERNS,
    ...options,
  });
}

/**
 * Applies `tts-dom-cleaner` across an array of parsed chapters when the user enables
 * the sanitizer toggle in the UI.
 *
 * @param {Array<{chapter_number: number, title: string, raw_text: string}>} chapters
 * @param {object} options
 * @returns {Array<{chapter_number: number, title: string, raw_text: string}>}
 */
export function sanitizeChaptersWithTtsDomCleaner(chapters = [], options = {}) {
  if (!Array.isArray(chapters) || chapters.length === 0) return [];

  return chapters.map((ch, idx) => {
    const cleaned = sanitizeTextWithTtsDomCleaner(ch.raw_text || ch.text || '', options);
    return {
      ...ch,
      chapter_number: ch.chapter_number || idx + 1,
      raw_text: cleaned || ch.raw_text || '',
    };
  });
}

/**
 * Applies `tts-dom-cleaner` on-the-fly to an array of reader segments when the user
 * toggles the "TTS Sanitizer" button in the Reader toolbar.
 *
 * @param {Array<object>} segments
 * @returns {Array<object>}
 */
export function sanitizeSegmentsWithTtsDomCleaner(segments = []) {
  if (!Array.isArray(segments) || segments.length === 0) return [];

  const result = [];
  let prevNormalizedText = null;

  for (const seg of segments) {
    if (!seg) continue;

    // Always preserve standalone illustration segments
    if (seg.type === 'image' || (seg.text && seg.text.trim().startsWith('[IMAGE:'))) {
      result.push(seg);
      continue;
    }

    const rawSegText = seg.text || '';
    const cleanedText = sanitizeTextWithTtsDomCleaner(rawSegText);

    // Drop segments that were purely hidden spam, watermarks, or ASCII dividers (***, ---)
    if (!cleanedText || !cleanedText.trim()) {
      continue;
    }

    // Deduplicate immediately consecutive identical segments
    const normalized = cleanedText.replace(/\s+/g, ' ').trim();
    if (prevNormalizedText !== null && normalized === prevNormalizedText) {
      continue;
    }
    prevNormalizedText = normalized;

    result.push({
      ...seg,
      text: cleanedText,
    });
  }

  return result.length > 0 ? result : segments;
}
