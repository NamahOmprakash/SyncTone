const DEFAULT_REMOVE_PATTERNS = [
  /The text on this page is estimated to be only \d+(\.\d+)?% accurate/i,
  /This book was produced in EPUB format by the Internet Archive/i,
  /The book pages were scanned and converted to EPUB format automatically/i,
  /Notice:\s*The book may not offer the correct reading sequence/i,
  /The book may not offer the correct reading sequence because of missing or misordered pages/i,
  /The hidden page numbering which may be available to your ereader/i,
  /The Internet Archive is working to improve the scanning process/i,
  /The Internet Archive was founded in 1996/i,
  /This book is available for free download in a number of formats/i,
  /Access-restricted-item\s+true/i,
  /Addeddate\s+\d{4}-\d{2}-\d{2}/i,
  /Boxid\s+IA\d+/i,
  /Scanner\s+Internet Archive/i,
  /^\s*Notice\s*[:\.]?\s*$/i,
  /Created with hocr-to-epub/i,
  /hocr-to-epub/i,
];

const BLOCK_TAG_DETECT_REGEX = /<(?:p|div|br|h[1-6]|article|section|blockquote|li|tr|table)\b/i;

const DEFAULT_JUNK_TAGS = ['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'canvas'];

const BLOCK_TAGS = new Set([
  'html', 'body', 'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'li', 'blockquote', 'pre', 'article', 'section', 'header', 'footer',
  'nav', 'aside', 'main', 'figure', 'figcaption', 'table', 'tr', 'td',
  'th', 'dt', 'dd', 'dl', 'ol', 'ul', 'address'
]);

const ASCII_DIVIDER_REGEX = /^\s*(?:[*_\-=~]\s*){3,}$/;

function isAsciiDivider(text) {
  return ASCII_DIVIDER_REGEX.test(text);
}

function isStyleHidden(styleStr) {
  if (!styleStr || typeof styleStr !== 'string') return false;
  const decls = styleStr.split(';');
  for (const decl of decls) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    let val = decl.slice(colonIdx + 1).trim().toLowerCase();
    if (!prop || !val) continue;
    val = val.replace(/!important/g, '').trim();
    if (prop === 'display' && val === 'none') return true;
    if (prop === 'visibility' && val === 'hidden') return true;
    if (prop === 'opacity') {
      const num = Number(val);
      if (val !== '' && !isNaN(num) && num === 0) return true;
    }
    if (prop === 'font-size') {
      const numPart = val.replace(/(?:px|rem|em|pt|%|vh|vw)$/, '').trim();
      const num = Number(numPart);
      if (numPart !== '' && !isNaN(num) && num === 0) return true;
    }
  }
  return false;
}

function normalizeBlockWhitespace(text) {
  const lines = text.split('\n');
  const normalizedLines = [];
  for (const line of lines) {
    const cleaned = line.trim().replace(/[^\S\r\n]+/g, ' ');
    if (cleaned.length > 0) {
      normalizedLines.push(cleaned);
    } else if (normalizedLines.length > 0 && normalizedLines[normalizedLines.length - 1] !== '') {
      normalizedLines.push('');
    }
  }
  while (normalizedLines.length > 0 && normalizedLines[normalizedLines.length - 1] === '') {
    normalizedLines.pop();
  }
  return normalizedLines.join('\n').trim();
}

function containsBlockDescendant(node) {
  if (!node || node.nodeType !== 1) return false;
  for (const child of node.childNodes) {
    if (child.nodeType === 1) {
      const tagName = child.tagName?.toLowerCase();
      if ((tagName && BLOCK_TAGS.has(tagName)) || containsBlockDescendant(child)) {
        return true;
      }
    }
  }
  return false;
}

function extractInlineText(node) {
  if (node.nodeType === 3) {
    return node.nodeValue || '';
  }
  if (node.nodeType === 1) {
    const tagName = node.tagName?.toLowerCase();
    if (tagName === 'br') return '\n';
    let text = '';
    for (const child of node.childNodes) {
      text += extractInlineText(child);
    }
    return text;
  }
  return '';
}

function traverseBlocks(node, blocks) {
  let inlineBuffer = '';
  const flushInline = () => {
    const trimmed = inlineBuffer.trim();
    if (trimmed.length > 0) {
      blocks.push(trimmed);
    }
    inlineBuffer = '';
  };

  for (const child of node.childNodes) {
    if (child.nodeType === 8) continue;
    if (child.nodeType === 3) {
      inlineBuffer += child.nodeValue || '';
      continue;
    }
    if (child.nodeType === 1) {
      const tagName = child.tagName?.toLowerCase();
      if (tagName === 'br') {
        inlineBuffer += '\n';
        continue;
      }
      const isBlock = (tagName && BLOCK_TAGS.has(tagName)) || containsBlockDescendant(child);
      if (isBlock) {
        flushInline();
        traverseBlocks(child, blocks);
      } else {
        inlineBuffer += extractInlineText(child);
      }
    }
  }
  flushInline();
}

function dedupeParagraphsList(paragraphs) {
  const result = [];
  let lastNormalized = '';
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    const normalized = trimmed.replace(/\s+/g, ' ');
    if (normalized === lastNormalized) continue;
    result.push(trimmed);
    lastNormalized = normalized;
  }
  return result;
}

/**
 * Cleans scanned book OCR noise, junk divider punctuation, and broken scanner artifacts.
 * Directly fixes OCR noise like `* ^`, `> * 1 s : i Lx`, `EN /`, `hadn’ t` -> `hadn’t`.
 */
export function cleanOcrArtifacts(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    // 1. Remove isolated punctuation noise patterns (e.g. * ^, `>, |, ^, =)
    .replace(/(?:^|\s)[`>|~^=*\\]+(?:\s+[`>|~^=*\\]+)*(?=\s|$)/g, ' ')
    // 2. Remove OCR junk symbol clusters like `> * 1 s : i Lx`, `EN /`, `ww ZW =`, `a e 00 pe SE E PN`
    .replace(/(?:^|\s)(?:[`*^>|~=:\/\\]|\b[a-zA-Z0-9]\b|\b[A-Z]{2,}\b|\b\d+\b)(?:\s+[`*^>|~=:\/\\]|\s+\b[a-zA-Z0-9]\b|\s+\b[A-Z]{2,}\b|\s+\b\d+\b){2,}(?=\s|$)/g, ' ')
    // 3. Fix broken apostrophes and split contractions like "hadn’ t" -> "hadn’t"
    .replace(/\b([a-zA-Z]+)[’\x27]\s+([a-zA-Z]+)\b/g, '$1’$2')
    // 4. Remove floating lone punctuation like isolated backticks, carats, asterisks
    .replace(/\s+[`^*|~=]\s+/g, ' ')
    // 5. Clean up extra spaces
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Browser-native cleanHtml using DOMParser — replaces cheerio and tts-dom-cleaner
 * with 0 external dependencies while preserving 100% test compatibility.
 */
function cleanHtml(html, options = {}) {
  if (!html || typeof html !== 'string' || !html.trim()) return '';

  const {
    removeHidden = true,
    removeSelectors = [],
    removeTags = [],
    removePatterns = DEFAULT_REMOVE_PATTERNS,
    stripAsciiDividers = true,
    dedupeParagraphs = true,
    preserveLineBreaks = true,
  } = options;

  if (typeof DOMParser === 'undefined') {
    return html;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // 1. Remove junk tags
  doc.querySelectorAll(DEFAULT_JUNK_TAGS.join(', ')).forEach((el) => el.remove());

  // 2. Remove tags
  if (removeTags.length > 0) {
    const selector = removeTags.map((t) => t.trim().toLowerCase()).filter(Boolean).join(', ');
    if (selector) doc.querySelectorAll(selector).forEach((el) => el.remove());
  }

  // 3. Remove custom selectors
  if (removeSelectors.length > 0) {
    const selector = removeSelectors.map((s) => s.trim()).filter(Boolean).join(', ');
    if (selector) {
      try {
        doc.querySelectorAll(selector).forEach((el) => el.remove());
      } catch {
        // Ignore invalid selectors safely
      }
    }
  }

  // 4. Remove hidden elements
  if (removeHidden) {
    doc.querySelectorAll('[hidden]').forEach((el) => el.remove());
    doc.querySelectorAll('[aria-hidden]').forEach((el) => {
      if (el.getAttribute('aria-hidden')?.trim().toLowerCase() === 'true') {
        el.remove();
      }
    });
    doc.querySelectorAll('[style]').forEach((el) => {
      const style = el.getAttribute('style');
      if (style && isStyleHidden(style)) {
        el.remove();
      }
    });
  }

  // 5. Extract text blocks
  const rawBlocks = [];
  const targetNode = doc.body || doc.documentElement;
  if (targetNode) {
    traverseBlocks(targetNode, rawBlocks);
  }

  // 6. Process text blocks
  let processedBlocks = [];
  for (const raw of rawBlocks) {
    const normalized = normalizeBlockWhitespace(raw);
    if (!normalized) continue;
    if (stripAsciiDividers && isAsciiDivider(normalized)) continue;
    if (removePatterns.length > 0 && removePatterns.some((pattern) => pattern.test(normalized))) continue;
    processedBlocks.push(normalized);
  }

  if (dedupeParagraphs) {
    processedBlocks = dedupeParagraphsList(processedBlocks);
  }

  return preserveLineBreaks ? processedBlocks.join('\n\n') : processedBlocks.join(' ');
}

/**
 * Safely sanitizes novel text or HTML using browser-native DOMParser while:
 * 1) Preserving embedded `[IMAGE:...]` markers and converting `<img src="...">` to `[IMAGE:...]` blocks.
 * 2) Wrapping plaintext double-newline paragraphs in `<p>` tags when no HTML block tags are present
 *    so that dedupeParagraphs, stripAsciiDividers, and removePatterns
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

  // 3. If input has no HTML block tags, wrap paragraphs in <p>...</p>
  if (!BLOCK_TAG_DETECT_REGEX.test(prepared)) {
    const paragraphs = prepared
      .split(/\r?\n\s*\r?\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    prepared = paragraphs
      .map((p) => {
        return `<p>${p.replace(/\r?\n/g, '<br/>')}</p>`;
      })
      .join('\n');
  }

  const cleaned = cleanHtml(prepared, {
    output: 'text',
    removeHidden: true,
    dedupeParagraphs: true,
    stripAsciiDividers: true,
    preserveLineBreaks: true,
    removeSelectors: ['.ad', '.watermark', '.patreon-box', '.hidden', '.sr-only'],
    removePatterns: DEFAULT_REMOVE_PATTERNS,
    ...options,
  });

  return cleanOcrArtifacts(cleaned);
}

/**
 * Applies sanitizer across an array of parsed chapters.
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
 * Applies sanitizer on-the-fly to an array of reader segments.
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

    if (seg.type === 'image' || (seg.text && seg.text.trim().startsWith('[IMAGE:'))) {
      result.push(seg);
      continue;
    }

    const rawSegText = seg.text || '';
    const cleanedText = sanitizeTextWithTtsDomCleaner(rawSegText);

    if (!cleanedText || !cleanedText.trim()) {
      continue;
    }

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

if (typeof window !== 'undefined') {
  window.__sanitizeTextWithTtsDomCleaner = sanitizeTextWithTtsDomCleaner;
}

