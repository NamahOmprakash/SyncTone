/**
 * Ebook, PDF, and Manuscript Client-Side Parser
 *
 * Provides browser-native parsing for EPUB, MOBI, AZW3, KF8, FB2, FBZ, PDF,
 * Markdown, HTML, and plain text manuscripts.
 */

const WORD_NUMBERS =
  'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth';

const HEADING_REGEX = new RegExp(
  '^(?:#{1,3}\\s+(?:\\S.*)|(?:chapter\\s+(?:\\d+|[ivxlcdm]+|' +
    WORD_NUMBERS +
    ')|(?:book|section|part|act)\\s+(?:\\d+|[ivxlcdm]+|' +
    WORD_NUMBERS +
    ')|prologue|epilogue)(?:\\s*[:.\\-–—]\\s*.*|\\s+.*)?)$',
  'i'
);

/**
 * Extracts chapters from plain text / markdown ('Chapter 1', 'CHAPTER II', 'Book 1', 'Section 1', etc.),
 * or chunks >30 paragraphs into 20-paragraph chapters, or returns a single chapter.
 *
 * @param {string} rawText
 * @param {string} [novelTitle]
 * @returns {Array<{chapter_number: number, title: string, raw_text: string}>}
 */
export function extractChaptersFromText(rawText, novelTitle) {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return [
      {
        chapter_number: 1,
        title: `Chapter 1: ${novelTitle || 'Introduction'}`,
        raw_text: '',
      },
    ];
  }

  const cleanText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const normalizedText = cleanText.replace(
    new RegExp(
      '^(?:[ \\t]*)(CHAPTER\\s+(?:\\d+|[ivxlcdm]+|' +
        WORD_NUMBERS +
        ')|PROLOGUE|EPILOGUE)(?:\\s*[:.\\-–—]\\s*|\\s+)([A-Z][a-z].{25,})$',
      'gim'
    ),
    '$1\n\n$2'
  );
  const lines = normalizedText.split('\n');

  const headingMatches = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.length > 120) continue;

    if (HEADING_REGEX.test(line)) {
      // Heading should be preceded by an empty line or be at the top of the file
      const isStart = i < 5;
      const prevBlank = i > 0 && lines[i - 1].trim() === '';
      if (isStart || prevBlank) {
        const title = line.replace(/^#{1,6}\s*/, '').trim();
        headingMatches.push({ lineIndex: i, title });
      }
    }
  }

  // If at least 2 headings are found, split into named chapters
  if (headingMatches.length >= 2) {
    const chapters = [];

    // Optional frontmatter check before first heading
    const firstMatch = headingMatches[0];
    if (firstMatch.lineIndex > 0) {
      const frontmatter = lines.slice(0, firstMatch.lineIndex).join('\n').trim();
      if (frontmatter.length > 250 && frontmatter.includes('\n\n')) {
        chapters.push({
          chapter_number: 1,
          title: 'Chapter 1: Introduction',
          raw_text: frontmatter,
        });
      }
    }

    for (let k = 0; k < headingMatches.length; k++) {
      const cur = headingMatches[k];
      const next = headingMatches[k + 1];
      const startLine = cur.lineIndex;
      const endLine = next ? next.lineIndex : lines.length;
      const chapterContent = lines.slice(startLine, endLine).join('\n').trim();

      if (chapterContent.length > 0) {
        const chNum = chapters.length + 1;
        const isPrefixed = /^(?:chapter|prologue|epilogue|book|section|part|act)\b/i.test(cur.title);
        chapters.push({
          chapter_number: chNum,
          title: isPrefixed ? cur.title : `Chapter ${chNum}: ${cur.title}`,
          raw_text: chapterContent,
        });
      }
    }

    if (chapters.length >= 2) {
      return chapters;
    }
  }

  // Chunking fallback: If > 30 paragraphs, chunk into 20-paragraph chapters
  const paragraphs = cleanText
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (paragraphs.length > 30) {
    const chapters = [];
    const chunkSize = 20;
    for (let i = 0; i < paragraphs.length; i += chunkSize) {
      const chunk = paragraphs.slice(i, i + chunkSize);
      const chNum = chapters.length + 1;
      chapters.push({
        chapter_number: chNum,
        title: `Chapter ${chNum}: ${novelTitle || 'Part ' + chNum}`,
        raw_text: chunk.join('\n\n').trim(),
      });
    }
    return chapters;
  }

  // Single chapter fallback
  return [
    {
      chapter_number: 1,
      title: `Chapter 1: ${novelTitle || 'Introduction'}`,
      raw_text: cleanText.trim(),
    },
  ];
}

/**
 * Uploads a cover Blob or data URL via the provided uploadAssetFn, returning the URL
 * or null (never returning raw base64 longer than 250 chars).
 *
 * @param {Blob|string} blobOrDataUrl
 * @param {Function} uploadAssetFn
 * @param {string} [filename='cover.jpg']
 * @returns {Promise<string|null>}
 */
export async function uploadCoverBlobIfPossible(blobOrDataUrl, uploadAssetFn, filename = 'cover.jpg') {
  if (!blobOrDataUrl) return null;

  if (typeof uploadAssetFn !== 'function') {
    if (
      typeof blobOrDataUrl === 'string' &&
      !blobOrDataUrl.startsWith('data:') &&
      blobOrDataUrl.length <= 250 &&
      (blobOrDataUrl.startsWith('http://') ||
        blobOrDataUrl.startsWith('https://') ||
        blobOrDataUrl.startsWith('/'))
    ) {
      return blobOrDataUrl;
    }
    return null;
  }

  try {
    let res = null;
    const isBlob =
      (typeof Blob !== 'undefined' && blobOrDataUrl instanceof Blob) ||
      (blobOrDataUrl &&
        typeof blobOrDataUrl === 'object' &&
        typeof blobOrDataUrl.arrayBuffer === 'function');

    if (isBlob) {
      if (typeof FormData !== 'undefined') {
        const formData = new FormData();
        formData.append('file', blobOrDataUrl, filename);
        res = await uploadAssetFn(formData);
      }
    } else if (typeof blobOrDataUrl === 'string' && blobOrDataUrl.startsWith('data:')) {
      res = await uploadAssetFn({ data_url: blobOrDataUrl });
    } else if (
      typeof blobOrDataUrl === 'string' &&
      !blobOrDataUrl.startsWith('data:') &&
      blobOrDataUrl.length <= 250
    ) {
      return blobOrDataUrl;
    }

    const url = res?.url || res?.data?.url;
    if (typeof url === 'string' && url.length <= 250 && !url.startsWith('data:')) {
      return url;
    }
    return null;
  } catch (err) {
    console.warn('[uploadCoverBlobIfPossible] Cover upload failed:', err);
    return null;
  }
}

/**
 * Extracts plain text from an HTML / XML Document, preserving paragraph breaks (\n\n).
 *
 * @param {Document} doc
 * @returns {string}
 */
export function extractTextFromHtmlDoc(doc) {
  if (!doc) return '';
  const body = doc.body || doc.documentElement || doc;
  if (!body) return '';

  if (typeof body.cloneNode === 'function') {
    const clone = body.cloneNode(true);

    if (typeof clone.querySelectorAll === 'function') {
      const unwanted = clone.querySelectorAll('head, title, script, style, noscript, svg, nav');
      unwanted.forEach((el) => el.remove && el.remove());

      const brs = clone.querySelectorAll('br');
      brs.forEach((br) => {
        try {
          br.replaceWith('\n');
        } catch (_) {}
      });

      const blockTags = [
        'p',
        'div',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'blockquote',
        'section',
        'article',
        'li',
        'dt',
        'dd',
        'tr',
      ];
      for (const tag of blockTags) {
        const blocks = clone.querySelectorAll(tag);
        blocks.forEach((el) => {
          try {
            if (/^(?:h[1-6])$/i.test(tag) && typeof el.before === 'function') {
              el.before('\n\n');
            }
            if (typeof el.after === 'function') {
              el.after('\n\n');
            } else if (el.parentNode) {
              const textNode = doc.createTextNode ? doc.createTextNode('\n\n') : '\n\n';
              el.parentNode.insertBefore(textNode, el.nextSibling);
            }
          } catch (_) {}
        });
      }
    }

    const text = clone.textContent || '';
    return cleanExtractedText(text);
  }

  if (typeof body.textContent === 'string') {
    return cleanExtractedText(body.textContent);
  }
  return '';
}

const BOILERPLATE_TITLE_REGEX =
  /^(?:notice|cover|title(?:\s+page)?|copyright|dedication|table of contents|contents|page\s+\d+|split_\d+)$/i;

function flattenToc(tocList) {
  if (!Array.isArray(tocList)) return [];
  const flat = [];
  for (const item of tocList) {
    if (!item) continue;
    flat.push(item);
    if (Array.isArray(item.subitems) && item.subitems.length > 0) {
      flat.push(...flattenToc(item.subitems));
    }
  }
  return flat;
}

function cleanExtractedText(raw) {
  if (!raw) return '';
  const stripped = raw
    .replace(/The text on this page is estimated to be only \d+\.?\d*% accurate[^\n]*/gi, '')
    .replace(/This book was produced in EPUB format by the Internet Archive[\s\S]*?(?:reading sequence\.|errors\.|volunteer\.|formats\.)/gi, '')
    .replace(/Notice:\s*The book may not offer the correct reading sequence[\s\S]*?(?:correct order\.|improve the scanning process\.|archive\.org)/gi, '')
    .replace(/The book may not offer the correct reading sequence because of missing or misordered pages[\s\S]*?(?:correct order\.|improve the scanning process\.|archive\.org)/gi, '')
    .replace(/The hidden page numbering which may be available to your ereader[^\n]*/gi, '')
    .replace(/The Internet Archive is working to improve the scanning process[^\n]*/gi, '')
    .replace(/The Internet Archive was founded in 1996[\s\S]*?(?:digital format\.|archive\.org)/gi, '')
    .replace(/This book is available for free download in a number of formats[^\n]*/gi, '')
    .replace(/Access-restricted-item\s+true[^\n]*/gi, '')
    .replace(/Created with hocr-to-epub[^\n]*/gi, '')
    .replace(/hocr-to-epub[^\n]*/gi, '')
    .replace(/(?:Addeddate|Boxid|Camera|Collection_set|External-identifier|Foldoutcount|Identifier|Invoice|Ocr|Ocr_detected_lang|Ocr_module_version|Page_number_confidence|Pages|Scanner)\s+[:=]?\s*[^\n]*/gi, '');
  return stripped
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !/^(?:Page\s+\d+|\d{1,4}|Notice\s*[:\.]?)$/i.test(line))
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractMetadataString(val) {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (Array.isArray(val)) {
    for (const item of val) {
      const str = extractMetadataString(item);
      if (str) return str;
    }
    return '';
  }
  if (typeof val === 'object') {
    if (typeof val.value === 'string' && val.value.trim()) return val.value.trim();
    if (typeof val[''] === 'string' && val[''].trim()) return val[''].trim();
    if (typeof val.en === 'string' && val.en.trim()) return val.en.trim();
    for (const key of Object.keys(val)) {
      const str = extractMetadataString(val[key]);
      if (str) return str;
    }
  }
  return '';
}

/**
 * Parses ebook formats (.epub, .mobi, .azw3, .kf8, .fb2, .fbz) using Foliate-js.
 *
 * @param {File|Blob} file
 * @param {Function} [uploadAssetFn]
 * @returns {Promise<{title: string, synopsis: string, cover_object: string|null, chapters: Array<{chapter_number: number, title: string, raw_text: string}>}>}
 */
export async function parseEbookWithFoliate(file, uploadAssetFn) {
  if (!file) {
    throw new Error('No file provided for ebook parsing');
  }

  const fileName = (file?.name || '').toLowerCase();
  let isZip = false;
  let isMobi = false;

  // Check magic bytes if supported
  if (typeof file.slice === 'function') {
    try {
      const headBuf = await file.slice(0, 4).arrayBuffer();
      const headArr = new Uint8Array(headBuf);
      if (headArr[0] === 0x50 && headArr[1] === 0x4b && headArr[2] === 0x03 && headArr[3] === 0x04) {
        isZip = true;
      }
      if (!isZip && file.size >= 68) {
        const mobiBuf = await file.slice(60, 68).arrayBuffer();
        const mobiMagic = new TextDecoder('latin1').decode(mobiBuf);
        if (mobiMagic === 'BOOKMOBI') {
          isMobi = true;
        }
      }
    } catch (_) {}
  }

  let book = null;

  try {
    if (
      fileName.endsWith('.mobi') ||
      fileName.endsWith('.azw3') ||
      fileName.endsWith('.azw') ||
      fileName.endsWith('.kf8') ||
      isMobi
    ) {
      const { MOBI } = await import('foliate-js/mobi.js');
      const { unzlibSync } = await import('foliate-js/vendor/fflate.js');
      book = await new MOBI({ unzlib: unzlibSync }).open(file);
    } else if (fileName.endsWith('.fb2') && !isZip) {
      const { makeFB2 } = await import('foliate-js/fb2.js');
      book = await makeFB2(file);
    } else {
      // EPUB or FBZ (zipped FB2)
      const { configure, ZipReader, BlobReader, TextWriter, BlobWriter } = await import(
        'foliate-js/vendor/zip.js'
      );
      configure({ useWebWorkers: false });
      const reader = new ZipReader(new BlobReader(file));
      const entries = await reader.getEntries();
      const map = new Map(entries.map((entry) => [entry.filename, entry]));
      const load = (f) => (name, ...args) => (map.has(name) ? f(map.get(name), ...args) : null);
      const loadText = load((entry) => entry.getData(new TextWriter()));
      const loadBlob = load((entry, type) => entry.getData(new BlobWriter(type)));
      const getSize = (name) => map.get(name)?.uncompressedSize ?? 0;
      const loader = { entries, loadText, loadBlob, getSize };

      if (fileName.endsWith('.fbz') || fileName.endsWith('.fb2.zip')) {
        const { makeFB2 } = await import('foliate-js/fb2.js');
        const fb2Entry = entries.find((e) => e.filename.endsWith('.fb2')) || entries[0];
        if (!fb2Entry) {
          throw new Error('No .fb2 content found inside FBZ archive');
        }
        const blob = await loader.loadBlob(fb2Entry.filename);
        book = await makeFB2(blob);
      } else {
        const { EPUB } = await import('foliate-js/epub.js');
        book = await new EPUB(loader).init();
      }
    }

    if (!book) {
      throw new Error('Failed to initialize ebook reader or format is unsupported');
    }

    // Extract title
    let title = extractMetadataString(book.metadata?.title);
    if (!title) {
      title = file?.name ? file.name.replace(/\.[^/.]+$/, '') : 'Untitled Novel';
    }

    // Extract synopsis
    let synopsis = extractMetadataString(book.metadata?.description);
    if (synopsis) {
      synopsis = synopsis.replace(/<[^>]+>/g, '').trim();
    }

    // Extract cover (multi-tier: getCover -> landmarks -> manifest -> early section DOM)
    let cover_object = null;
    try {
      if (typeof book.getCover === 'function') {
        const coverBlob = await book.getCover();
        if (coverBlob) {
          cover_object = await uploadCoverBlobIfPossible(coverBlob, uploadAssetFn, 'cover.jpg');
        }
      }
    } catch (covErr) {
      console.warn('[parseEbookWithFoliate] Cover extraction via getCover failed:', covErr);
    }

    // Secondary cover check: book.landmarks
    if (!cover_object && Array.isArray(book.landmarks)) {
      try {
        const coverLandmark = book.landmarks.find(
          (l) => l && (l.type === 'cover' || (typeof l.rel === 'string' && l.rel.includes('cover')))
        );
        if (coverLandmark?.href && typeof book.loadBlob === 'function') {
          const blob = await book.loadBlob(coverLandmark.href);
          if (blob) {
            cover_object = await uploadCoverBlobIfPossible(blob, uploadAssetFn, 'cover.jpg');
          }
        }
      } catch (landmarkErr) {
        console.warn('[parseEbookWithFoliate] Cover extraction via landmarks failed:', landmarkErr);
      }
    }

    // Tertiary cover check: book.resources?.manifest
    if (!cover_object && book.resources?.manifest) {
      try {
        const manifest = book.resources.manifest;
        const entries = Array.isArray(manifest) ? manifest : Object.values(manifest);
        const coverItem = entries.find(
          (it) =>
            it &&
            ((it.mediaType && it.mediaType.startsWith('image/')) ||
              (it['media-type'] && it['media-type'].startsWith('image/'))) &&
            (it.id?.toLowerCase().includes('cover') ||
              it.href?.toLowerCase().includes('cover') ||
              (typeof it.properties === 'string' && it.properties.includes('cover-image')))
        );
        if (coverItem?.href && typeof book.loadBlob === 'function') {
          const blob = await book.loadBlob(coverItem.href);
          if (blob) {
            cover_object = await uploadCoverBlobIfPossible(blob, uploadAssetFn, 'cover.jpg');
          }
        }
      } catch (manifestErr) {
        console.warn('[parseEbookWithFoliate] Cover extraction via manifest failed:', manifestErr);
      }
    }

    // Iterate sections (parse all sections, without artificial limit)
    const rawSections = Array.isArray(book.sections) ? book.sections : [];
    const collectedSections = [];

    for (let i = 0; i < rawSections.length; i++) {
      const section = rawSections[i];
      let doc = null;
      try {
        if (typeof section.createDocument === 'function') {
          doc = await section.createDocument();
        } else if (typeof book.loadDocument === 'function') {
          doc = await book.loadDocument(section);
        }
      } catch (secErr) {
        console.warn(`[parseEbookWithFoliate] Section ${i} createDocument failed:`, secErr);
        continue;
      }

      if (!doc) continue;

      // Quaternary cover check from early section DOM (e.g. Calibre SVG covers or first-page images)
      if (!cover_object && i < 3 && typeof doc.querySelector === 'function') {
        try {
          const imgEl = doc.querySelector('image[*|href], image[href], img[src]');
          if (imgEl && typeof book.loadBlob === 'function') {
            const imgSrc =
              imgEl.getAttribute('xlink:href') ||
              imgEl.getAttribute('href') ||
              imgEl.getAttribute('src');
            if (imgSrc) {
              const resolvedHref = section.resolveHref ? section.resolveHref(imgSrc) : imgSrc;
              const blob = await book.loadBlob(resolvedHref);
              if (blob) {
                cover_object = await uploadCoverBlobIfPossible(blob, uploadAssetFn, 'cover.jpg');
              }
            }
          }
        } catch (_) {}
      }

      let sectionHeading = '';
      if (typeof section.title === 'string' && section.title.trim()) {
        sectionHeading = section.title.trim();
      }
      if (!sectionHeading && typeof doc.querySelector === 'function') {
        const headingEl = doc.querySelector('h1, h2, h3, title');
        if (headingEl && headingEl.textContent) {
          sectionHeading = headingEl.textContent.trim();
        }
      }

      const text = extractTextFromHtmlDoc(doc);
      collectedSections.push({
        index: i,
        heading: sectionHeading,
        raw_text: text,
      });
    }

    // Attempt TOC-driven aggregation if book.toc is present
    const rawToc = book.toc ? flattenToc(book.toc) : [];
    const resolvedToc = [];
    if (rawToc.length > 0 && typeof book.resolveHref === 'function') {
      for (const item of rawToc) {
        const tTitle = (item.label || item.title || '').trim();
        if (!tTitle || !item.href) continue;
        try {
          const target = await book.resolveHref(item.href);
          const sIdx = target?.index ?? null;
          if (typeof sIdx === 'number' && sIdx >= 0) {
            resolvedToc.push({
              title: tTitle,
              sectionIndex: sIdx,
            });
          }
        } catch (_) {}
      }
    }

    let chapters = [];

    // Filter boilerplate TOC entries (Notice, Cover, Page \d+, etc.)
    const meaningfulToc = resolvedToc
      .filter((entry) => !BOILERPLATE_TITLE_REGEX.test(entry.title))
      .sort((a, b) => a.sectionIndex - b.sectionIndex);

    // Deduplicate same-section TOC items
    const uniqueToc = [];
    for (const entry of meaningfulToc) {
      if (uniqueToc.length === 0 || uniqueToc[uniqueToc.length - 1].sectionIndex !== entry.sectionIndex) {
        uniqueToc.push(entry);
      }
    }

    if (uniqueToc.length >= 2) {
      // Group spine sections between consecutive TOC entries
      for (let k = 0; k < uniqueToc.length; k++) {
        const cur = uniqueToc[k];
        const next = uniqueToc[k + 1];
        const startIdx = cur.sectionIndex;
        const endIdx = next ? next.sectionIndex : collectedSections.length;

        const chunkText = collectedSections
          .filter((s) => s.index >= startIdx && s.index < endIdx)
          .map((s) => s.raw_text)
          .filter((t) => t && t.length > 0)
          .join('\n\n')
          .trim();

        if (chunkText.length > 0) {
          const chNum = chapters.length + 1;
          const isPrefixed = /^(?:chapter|prologue|epilogue|book|section|part|act)\b/i.test(cur.title);
          chapters.push({
            chapter_number: chNum,
            title: isPrefixed ? cur.title : `Chapter ${chNum}: ${cur.title}`,
            raw_text: chunkText,
          });
        }
      }
    }

    // Fallback: Check if spine is fragmented / page-split (e.g. titles are Page 0, Page 1, split_X, Notice,
    // or average section length < 500 words / 2500 chars)
    if (chapters.length < 2 && collectedSections.length > 0) {
      const nonBoilerplateSections = collectedSections.filter(
        (s) => !BOILERPLATE_TITLE_REGEX.test(s.heading) && s.raw_text.length > 0
      );
      const totalChars = nonBoilerplateSections.reduce((acc, s) => acc + s.raw_text.length, 0);
      const avgChars = nonBoilerplateSections.length > 0 ? totalChars / nonBoilerplateSections.length : 0;
      const isPageSplit =
        collectedSections.length > 1 &&
        (avgChars < 2500 ||
          collectedSections.filter((s) => /^(?:page\s+\d+|split_\d+|notice)$/i.test(s.heading)).length >=
            Math.ceil(collectedSections.length / 3));

      if (isPageSplit || uniqueToc.length < 2) {
        const consolidatedText = nonBoilerplateSections.map((s) => s.raw_text).join('\n\n').trim();
        if (consolidatedText.length > 0) {
          const extracted = extractChaptersFromText(consolidatedText, title);
          if (extracted.length > 1) {
            chapters = extracted;
          }
        }
      }
    }

    // Final fallback: Use individual non-boilerplate sections if still not grouped
    if (chapters.length < 2 && collectedSections.length > 0) {
      const valid = collectedSections.filter(
        (s) => s.raw_text.length >= 20 && !BOILERPLATE_TITLE_REGEX.test(s.heading)
      );
      if (valid.length > 1) {
        chapters = valid.map((s, idx) => {
          const chNum = idx + 1;
          const isPrefixed = /^(?:chapter|prologue|epilogue|book|section|part|act)\b/i.test(s.heading);
          return {
            chapter_number: chNum,
            title: s.heading
              ? isPrefixed
                ? s.heading
                : `Chapter ${chNum}: ${s.heading}`
              : `Chapter ${chNum}`,
            raw_text: s.raw_text,
          };
        });
      } else if (valid.length === 1 && valid[0].raw_text.length > 3000) {
        const sub = extractChaptersFromText(valid[0].raw_text, title);
        if (sub.length > 1) chapters = sub;
      }
    }

    if (chapters.length === 0) {
      const fullFallbackText = collectedSections.map((s) => s.raw_text).join('\n\n').trim();
      chapters = [
        {
          chapter_number: 1,
          title: `Chapter 1: ${title || 'Introduction'}`,
          raw_text: fullFallbackText,
        },
      ];
    }

    return {
      title,
      synopsis,
      cover_object,
      chapters,
    };
  } finally {
    if (book && typeof book.destroy === 'function') {
      try {
        await book.destroy();
      } catch (_) {}
    }
  }
}

/**
 * Extracts plain text from a PDF page's getTextContent items, grouping by Y-coordinates
 * into lines and paragraphs.
 *
 * @param {object} content
 * @returns {string}
 */
export function extractTextFromPdfPage(content) {
  if (!content || !Array.isArray(content.items) || content.items.length === 0) {
    return '';
  }

  const items = content.items.filter(
    (it) => it && typeof it.str === 'string' && Array.isArray(it.transform) && it.transform.length >= 6
  );

  if (items.length === 0) return '';

  // Sort items top-to-bottom (Y descending), then left-to-right (X ascending)
  items.sort((a, b) => {
    const yDiff = b.transform[5] - a.transform[5];
    if (Math.abs(yDiff) > 3) {
      return yDiff;
    }
    return a.transform[4] - b.transform[4];
  });

  const lines = [];
  let currentLine = [];
  let currentY = null;

  for (const item of items) {
    const y = item.transform[5];
    if (currentY === null || Math.abs(currentY - y) <= 4) {
      currentLine.push(item);
      if (currentY === null) currentY = y;
    } else {
      if (currentLine.length > 0) {
        lines.push({ y: currentY, items: currentLine });
      }
      currentLine = [item];
      currentY = y;
    }
  }
  if (currentLine.length > 0) {
    lines.push({ y: currentY, items: currentLine });
  }

  const lineTexts = [];
  for (const line of lines) {
    let lineStr = '';
    for (let j = 0; j < line.items.length; j++) {
      const itemStr = line.items[j].str;
      if (!itemStr) continue;
      if (j > 0 && !lineStr.endsWith(' ') && !itemStr.startsWith(' ')) {
        lineStr += ' ' + itemStr;
      } else {
        lineStr += itemStr;
      }
    }
    lineStr = lineStr.trim();
    if (lineStr) {
      lineTexts.push({ text: lineStr, y: line.y });
    }
  }

  if (lineTexts.length === 0) return '';

  const deltas = [];
  for (let i = 1; i < lineTexts.length; i++) {
    const dy = lineTexts[i - 1].y - lineTexts[i].y;
    if (dy > 0 && dy < 60) {
      deltas.push(dy);
    }
  }
  deltas.sort((a, b) => a - b);
  const medianDy = deltas.length > 0 ? deltas[Math.floor(deltas.length / 2)] : 14;

  const paragraphs = [];
  let currentPara = [];

  for (let i = 0; i < lineTexts.length; i++) {
    const cur = lineTexts[i];
    if (i > 0) {
      const dy = lineTexts[i - 1].y - cur.y;
      if (dy > medianDy * 1.5) {
        if (currentPara.length > 0) {
          paragraphs.push(currentPara.join(' '));
          currentPara = [];
        }
      }
    }
    currentPara.push(cur.text);
  }
  if (currentPara.length > 0) {
    paragraphs.push(currentPara.join(' '));
  }

  return paragraphs.join('\n\n').trim();
}

function flattenPdfOutline(items) {
  if (!Array.isArray(items)) return [];
  const flat = [];
  for (const item of items) {
    if (!item) continue;
    flat.push(item);
    if (Array.isArray(item.items) && item.items.length > 0) {
      flat.push(...flattenPdfOutline(item.items));
    }
  }
  return flat;
}

async function resolvePdfDestPage(pdfDoc, item) {
  try {
    let dest = item.dest;
    if (typeof dest === 'string') {
      dest = await pdfDoc.getDestination(dest);
    }
    if (Array.isArray(dest) && dest.length > 0) {
      const pageRef = dest[0];
      if (pageRef && typeof pageRef === 'object') {
        const pageIndex = await pdfDoc.getPageIndex(pageRef);
        return pageIndex + 1;
      } else if (typeof pageRef === 'number') {
        return pageRef + 1;
      }
    }
  } catch (_) {}
  return null;
}

/**
 * Parses PDF documents using PDF.js.
 *
 * @param {File|Blob} file
 * @param {Function} [uploadAssetFn]
 * @returns {Promise<{title: string, synopsis: string, cover_object: string|null, chapters: Array<{chapter_number: number, title: string, raw_text: string}>}>}
 */
export async function parsePdfWithPdfJs(file, uploadAssetFn) {
  if (!file) {
    throw new Error('No file provided for PDF parsing');
  }

  let pdfjs;
  try {
    pdfjs = await import('pdfjs-dist');
  } catch (err) {
    try {
      pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    } catch (err2) {
      throw new Error(`Failed to load pdfjs-dist: ${err?.message || err2?.message}`);
    }
  }

  const pdfApi = pdfjs.getDocument ? pdfjs : pdfjs.default || pdfjs;

  if (typeof window !== 'undefined' && pdfApi.GlobalWorkerOptions) {
    try {
      if (!pdfApi.GlobalWorkerOptions.workerSrc) {
        pdfApi.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();
      }
    } catch (workerErr) {
      console.warn('[parsePdfWithPdfJs] Failed to configure workerSrc:', workerErr);
    }
  }

  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);

  const loadingTask = pdfApi.getDocument({
    data,
    disableWorker: typeof window === 'undefined' || !pdfApi.GlobalWorkerOptions?.workerSrc,
    isEvalSupported: false,
  });

  const pdfDoc = await loadingTask.promise;

  let title = '';
  let synopsis = '';
  try {
    const meta = await pdfDoc.getMetadata();
    if (meta?.info?.Title) {
      title = String(meta.info.Title).trim();
    }
    if (meta?.info?.Subject || meta?.info?.Description) {
      synopsis = String(meta.info.Subject || meta.info.Description).trim();
    }
  } catch (metaErr) {
    console.warn('[parsePdfWithPdfJs] Failed to extract metadata:', metaErr);
  }

  if (!title) {
    title = file.name ? file.name.replace(/\.[^/.]+$/, '') : 'Untitled PDF';
  }

  // Cover extraction: render page 1 to offscreen canvas
  let cover_object = null;
  if (typeof document !== 'undefined') {
    try {
      const page1 = await pdfDoc.getPage(1);
      const viewport = page1.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page1.render({
          canvasContext: ctx,
          viewport,
        }).promise;

        const coverBlob = await new Promise((resolve) => {
          if (typeof canvas.toBlob === 'function') {
            canvas.toBlob(resolve, 'image/jpeg', 0.85);
          } else {
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          }
        });

        if (coverBlob) {
          cover_object = await uploadCoverBlobIfPossible(coverBlob, uploadAssetFn, 'cover.jpg');
        }
      }
    } catch (coverErr) {
      console.warn('[parsePdfWithPdfJs] Failed to render page 1 for cover:', coverErr);
    }
  }

  // Extract page texts
  const pageTexts = [];
  for (let p = 1; p <= pdfDoc.numPages; p++) {
    try {
      const page = await pdfDoc.getPage(p);
      const content = await page.getTextContent();
      const pageText = extractTextFromPdfPage(content);
      pageTexts.push(pageText);
    } catch (pageErr) {
      console.warn(`[parsePdfWithPdfJs] Failed to extract text from page ${p}:`, pageErr);
      pageTexts.push('');
    }
  }

  // Check outline
  let chapters = [];
  try {
    const outline = await pdfDoc.getOutline();
    if (Array.isArray(outline) && outline.length > 0) {
      const flatOutline = flattenPdfOutline(outline);
      const validEntries = [];
      for (const item of flatOutline) {
        if (!item || !item.title) continue;
        const pageNum = await resolvePdfDestPage(pdfDoc, item);
        if (pageNum && pageNum >= 1 && pageNum <= pdfDoc.numPages) {
          validEntries.push({
            title: item.title.trim(),
            pageNum,
          });
        }
      }

      validEntries.sort((a, b) => a.pageNum - b.pageNum);

      const uniqueEntries = [];
      for (const entry of validEntries) {
        if (
          uniqueEntries.length === 0 ||
          uniqueEntries[uniqueEntries.length - 1].pageNum !== entry.pageNum
        ) {
          uniqueEntries.push(entry);
        }
      }

      if (uniqueEntries.length >= 2) {
        if (uniqueEntries[0].pageNum > 1) {
          const introText = pageTexts
            .slice(0, uniqueEntries[0].pageNum - 1)
            .filter(Boolean)
            .join('\n\n')
            .trim();
          if (introText.length > 40) {
            chapters.push({
              chapter_number: 1,
              title: 'Chapter 1: Introduction',
              raw_text: introText,
            });
          }
        }

        for (let i = 0; i < uniqueEntries.length; i++) {
          const cur = uniqueEntries[i];
          const next = uniqueEntries[i + 1];
          const startIdx = cur.pageNum - 1;
          const endIdx = next ? next.pageNum - 1 : pageTexts.length;
          const chapText = pageTexts
            .slice(startIdx, endIdx)
            .filter(Boolean)
            .join('\n\n')
            .trim();

          if (chapText.length > 0) {
            const chNum = chapters.length + 1;
            const isPrefixed = /^(?:chapter|prologue|epilogue|book|section|part|act)\b/i.test(cur.title);
            chapters.push({
              chapter_number: chNum,
              title: isPrefixed ? cur.title : `Chapter ${chNum}: ${cur.title}`,
              raw_text: chapText,
            });
          }
        }
      }
    }
  } catch (outlineErr) {
    console.warn('[parsePdfWithPdfJs] Failed to process PDF outline:', outlineErr);
  }

  // If outline didn't yield >= 2 chapters, use extractChaptersFromText on the full text
  if (chapters.length < 2) {
    const fullText = pageTexts.filter(Boolean).join('\n\n').trim();
    chapters = extractChaptersFromText(fullText, title);
  }

  return {
    title,
    synopsis,
    cover_object,
    chapters,
  };
}

/**
 * Universal client-side novel parser dispatcher based on file extension and magic bytes.
 *
 * @param {File|Blob|string} file
 * @param {object} [options={}]
 * @param {Function} [options.uploadAsset]
 * @returns {Promise<{title: string, synopsis: string, cover_object: string|null, chapters: Array<{chapter_number: number, title: string, raw_text: string}>}>}
 */
export async function parseNovelFileClientSide(file, options = {}) {
  if (!file) {
    throw new Error('No file provided for parsing');
  }

  const uploadAssetFn = typeof options === 'function' ? options : options?.uploadAsset;
  const fileName = (file?.name || '').toLowerCase();
  const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '';

  // 1. Ebook formats (.mobi, .azw3, .kf8, .fb2, .fbz, .epub)
  if (['.mobi', '.azw3', '.azw', '.kf8', '.fb2', '.fbz', '.epub'].includes(ext)) {
    return await parseEbookWithFoliate(file, uploadAssetFn);
  }

  // 2. PDF documents
  if (ext === '.pdf') {
    return await parsePdfWithPdfJs(file, uploadAssetFn);
  }

  // 3. Magic bytes fallback if extension is missing
  if (typeof file.slice === 'function') {
    try {
      const headBuf = await file.slice(0, 5).arrayBuffer();
      const headArr = new Uint8Array(headBuf);
      const headStr = new TextDecoder('latin1').decode(headArr);
      if (headStr.startsWith('%PDF')) {
        return await parsePdfWithPdfJs(file, uploadAssetFn);
      }
      if (headArr[0] === 0x50 && headArr[1] === 0x4b && headArr[2] === 0x03 && headArr[3] === 0x04) {
        return await parseEbookWithFoliate(file, uploadAssetFn);
      }
    } catch (_) {}
  }

  // 4. Plain text / markdown / HTML
  let rawText = '';
  if (typeof file.text === 'function') {
    rawText = await file.text();
  } else if (file instanceof Blob || (typeof Blob !== 'undefined' && file instanceof Blob)) {
    rawText = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || '');
      reader.onerror = reject;
      reader.readAsText(file);
    });
  } else if (typeof file === 'string') {
    rawText = file;
  }

  const baseTitle = file?.name
    ? file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase())
    : 'Untitled Document';

  if (ext === '.html' || ext === '.htm') {
    if (typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(rawText, 'text/html');
        const docTitle = doc.querySelector('title')?.textContent?.trim() || baseTitle;
        const bodyText = extractTextFromHtmlDoc(doc);
        const chapters = extractChaptersFromText(bodyText, docTitle);
        return {
          title: docTitle,
          synopsis: '',
          cover_object: null,
          chapters,
        };
      } catch (htmlErr) {
        console.warn('[parseNovelFileClientSide] HTML parsing failed:', htmlErr);
      }
    }
  }

  const chapters = extractChaptersFromText(rawText, baseTitle);
  return {
    title: baseTitle,
    synopsis: '',
    cover_object: null,
    chapters,
  };
}
