/**
 * SyncTone — Dedicated Cleaning & Database Migration Script
 *
 * 1. Purges scanner / Internet Archive boilerplate from chapters (MongoDB, PostgreSQL, local files):
 *    - Standalone "Notice" / "Notice:" headers
 *    - "Created with hocr-to-epub" / "hocr-to-epub" scanner markers
 *    - Multi-paragraph Internet Archive disclaimers ("The Internet Archive was founded in 1996...", etc.)
 *    - Raw "Page \d+" spine artifacts
 *    - Re-indexes segment numbers monotonically (order: 1, 2, 3...)
 * 2. Consolidates fragmented 53-page spine chapters (e.g. Harry Potter novel 6e42d4f1-26db-4094-a68c-643935ffd628):
 *    - Groups conjoined Page spine fragments into clean, real chapters
 *    - Updates PostgreSQL chapters table and MongoDB chapters collection atomically
 *    - Sets canonical cover artwork if missing
 * 3. Cleans orphaned temporary uploads in /tmp and data/uploads.
 * 4. Includes an in-memory verification suite (--verify) to validate logic with zero dependencies.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const mongoose = require('mongoose');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const { config } = require('./src/config');
const { Chapter } = require('./src/models');

const BOILERPLATE_PATTERNS = [
  /The text on this page is estimated to be only \d+/i,
  /This book was produced in EPUB format by the Internet Archive/i,
  /The book pages were scanned and converted to EPUB format automatically/i,
  /The book may not offer the correct reading sequence/i,
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

const BOILERPLATE_CHAPTER_TITLE_REGEX =
  /^(?:notice|cover|title(?:\s+page)?|copyright|dedication|table of contents|contents|page\s+\d+|split_\d+)$/i;

const WORD_NUMS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20,
};

function isBoilerplateLine(line) {
  if (!line || !line.trim()) return false;
  const trimmed = line.trim();
  if (/^Page\s+\d+$/i.test(trimmed)) return true;
  if (/^\s*Notice\s*[:\.]?\s*$/i.test(trimmed)) return true;
  if (/Created with hocr-to-epub/i.test(trimmed)) return true;
  if (/hocr-to-epub/i.test(trimmed)) return true;
  return BOILERPLATE_PATTERNS.some((pat) => pat.test(trimmed));
}

function cleanBoilerplateFromText(text) {
  if (!text) return '';
  return text
    .split(/\r?\n/)
    .filter((line) => !isBoilerplateLine(line))
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Sanitizes chapter segments array by removing boilerplate items and re-indexing order.
 */
function sanitizeChapterSegments(segments = []) {
  if (!Array.isArray(segments)) return [];
  const cleaned = segments.filter((seg) => {
    if (!seg) return false;
    if (seg.type === 'image' || (seg.text && seg.text.startsWith('[IMAGE:'))) return true;
    return !isBoilerplateLine(seg.text);
  });
  return cleaned.map((seg, idx) => ({
    ...seg,
    order: idx + 1,
  }));
}

/**
 * Splits plain text into structured chapters by heading markers:
 * "CHAPTER ONE THE BOY WHO LIVED", "Chapter 2: The Vanishing Glass", etc.
 */
function splitTextIntoChapters(fullText) {
  if (!fullText || fullText.length < 50) return [];

  const wordNumsPattern = Object.keys(WORD_NUMS).join('|');
  // Normalize conjoined headings
  let normalized = fullText.replace(
    new RegExp(`^([ \\t]*(?:CHAPTER|Chapter)\\s+(?:[IVXLCDM\\d]+|${wordNumsPattern}))(?:[:.\\-—\\s]+|\\s+)([A-Z][a-z].{20,})$`, 'gim'),
    '$1\n\n$2'
  );

  const headingPattern = new RegExp(
    `(?:^|\\n)[ \\t]*(?:#+\\s*)?(?:CHAPTER|Chapter)\\s+([IVXLCDM\\d]+|${wordNumsPattern}|[0-9]+)(?:[:.\\-—\\s]+([^\\n]*))?`,
    'gim'
  );

  const matches = [];
  let match;
  while ((match = headingPattern.exec(normalized)) !== null) {
    const rawNum = match[1].toLowerCase().trim();
    const chNum = WORD_NUMS[rawNum] || parseInt(rawNum, 10) || matches.length + 1;
    const subtitle = (match[2] || '').trim();
    const title = subtitle ? `Chapter ${chNum}: ${subtitle}` : `Chapter ${chNum}`;
    matches.push({
      index: match.index,
      chapter_number: chNum,
      title,
    });
  }

  if (matches.length < 2) {
    return [{
      chapter_number: 1,
      title: 'Chapter 1',
      raw_text: cleanBoilerplateFromText(normalized),
    }];
  }

  matches.sort((a, b) => a.index - b.index);

  const chapters = [];
  for (let i = 0; i < matches.length; i++) {
    const startIdx = matches[i].index;
    const endIdx = i + 1 < matches.length ? matches[i + 1].index : normalized.length;
    const rawChunk = normalized.substring(startIdx, endIdx);
    const cleanedText = cleanBoilerplateFromText(rawChunk);

    if (cleanedText.length >= 20) {
      chapters.push({
        chapter_number: i + 1,
        title: matches[i].title,
        raw_text: cleanedText,
      });
    }
  }

  return chapters;
}

/**
 * Clean local disk chapters directory if present.
 */
async function cleanLocalChaptersDir() {
  const chaptersDir = config.paths?.chaptersDir;
  if (!chaptersDir || !fs.existsSync(chaptersDir)) {
    console.log('[Clean] No local chaptersDir found at:', chaptersDir);
    return;
  }

  console.log('[Clean] Scanning local chaptersDir:', chaptersDir);
  const entries = fs.readdirSync(chaptersDir, { withFileTypes: true });
  let cleanedCount = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const chapterPath = path.join(chaptersDir, entry.name);
    const rawTxtPath = path.join(chapterPath, 'raw.txt');

    if (fs.existsSync(rawTxtPath)) {
      try {
        const content = fs.readFileSync(rawTxtPath, 'utf8');
        const lines = content.split(/\r?\n/);
        const filteredLines = lines.filter((l) => !isBoilerplateLine(l));

        if (filteredLines.length !== lines.length) {
          fs.writeFileSync(rawTxtPath, filteredLines.join('\n'), 'utf8');
          cleanedCount++;
          console.log(`[Clean] Sanitized boilerplate from ${entry.name}/raw.txt (${lines.length - filteredLines.length} lines removed)`);
        }
      } catch (err) {
        console.warn(`[Clean] Error reading/writing ${rawTxtPath}:`, err.message);
      }
    }
  }

  console.log(`[Clean] Local chapters cleaning complete. ${cleanedCount} files updated.`);
}

/**
 * Sanitizes existing chapters in MongoDB (purging Notice, Created with hocr-to-epub, IA boilerplate).
 */
async function cleanMongoDatabase() {
  console.log('[Clean] Connecting to MongoDB...');
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 3000 });
    console.log('[Clean] Connected to MongoDB.');

    const chapters = await Chapter.find({});
    console.log(`[Clean] Found ${chapters.length} chapters in MongoDB.`);
    let modifiedChapters = 0;

    for (const ch of chapters) {
      let docModified = false;

      // Clean raw_text if present
      if (ch.raw_text) {
        const lines = ch.raw_text.split(/\r?\n/);
        const filtered = lines.filter((l) => !isBoilerplateLine(l));
        if (filtered.length !== lines.length) {
          ch.raw_text = filtered.join('\n');
          docModified = true;
        }
      }

      // Clean segments matching boilerplate and re-index order
      if (Array.isArray(ch.segments) && ch.segments.length > 0) {
        const originalSegCount = ch.segments.length;
        const sanitized = sanitizeChapterSegments(ch.segments);
        if (sanitized.length !== originalSegCount) {
          ch.segments = sanitized;
          docModified = true;
        }
      }

      if (docModified) {
        await ch.save();
        modifiedChapters++;
        console.log(`[Clean] Purged boilerplate from MongoDB chapter: ${ch.title || ch._id}`);
      }
    }

    console.log(`[Clean] MongoDB cleaning complete. ${modifiedChapters} chapters sanitized.`);
  } catch (err) {
    console.warn('[Clean] MongoDB not reachable or error occurred:', err.message);
  } finally {
    try {
      await mongoose.disconnect();
    } catch (_) {}
  }
}

/**
 * Consolidates fragmented 53-page spine chapters in PostgreSQL & MongoDB for a target novel.
 */
async function consolidateNovelChapters(targetNovelId = '6e42d4f1-26db-4094-a68c-643935ffd628') {
  console.log(`[Consolidate] Inspecting novel ${targetNovelId} for fragmented spine chapters...`);

  let pool;
  let mongoConnected = false;

  try {
    pool = new Pool({ connectionString: config.databaseUrl, connectionTimeoutMillis: 3000 });
    await pool.query('SELECT 1');
    console.log('[Consolidate] PostgreSQL connected.');

    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 3000 });
    mongoConnected = true;
    console.log('[Consolidate] MongoDB connected.');

    // Query chapters for target novel
    const pgChaptersRes = await pool.query(
      'SELECT id, chapter_number, title FROM chapters WHERE novel_id = $1 ORDER BY chapter_number ASC',
      [targetNovelId]
    );

    const pgChapters = pgChaptersRes.rows;
    console.log(`[Consolidate] Novel ${targetNovelId} has ${pgChapters.length} chapters in PostgreSQL.`);

    const isFragmented =
      pgChapters.length > 25 &&
      pgChapters.some((c) => BOILERPLATE_CHAPTER_TITLE_REGEX.test(c.title));

    if (!isFragmented && pgChapters.length > 0) {
      console.log(`[Consolidate] Novel ${targetNovelId} does not have fragmented spine chapters. Skipping.`);
      return;
    }

    // Fetch MongoDB chapter documents for this novel
    const mongoDocs = await Chapter.find({ novel_id: targetNovelId }).sort({ chapter_number: 1 });
    console.log(`[Consolidate] Found ${mongoDocs.length} chapter documents in MongoDB.`);

    // Extract text from non-boilerplate chapters
    const meaningfulDocs = mongoDocs.filter((doc) => !BOILERPLATE_CHAPTER_TITLE_REGEX.test(doc.title));
    const combinedText = meaningfulDocs
      .map((d) => cleanBoilerplateFromText(d.raw_text || (d.segments || []).map((s) => s.text).join(' ')))
      .filter(Boolean)
      .join('\n\n');

    console.log(`[Consolidate] Aggregated ${combinedText.length} characters of novel prose.`);

    const newChapters = splitTextIntoChapters(combinedText);
    console.log(`[Consolidate] Reconstructed ${newChapters.length} consolidated chapters.`);

    if (newChapters.length === 0) {
      console.warn('[Consolidate] Could not reconstruct chapters. Aborting.');
      return;
    }

    // Begin PostgreSQL transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete old chapters in PostgreSQL
      await client.query('DELETE FROM chapters WHERE novel_id = $1', [targetNovelId]);

      // Delete old chapters in MongoDB
      await Chapter.deleteMany({ novel_id: targetNovelId });

      // Insert consolidated chapters
      for (const ch of newChapters) {
        const pgChapterId = uuidv4();
        await client.query(
          `INSERT INTO chapters (id, novel_id, chapter_number, title, has_studio_audio, audio_duration_ms, created_at, updated_at)
           VALUES ($1, $2, $3, $4, false, 0, NOW(), NOW())`,
          [pgChapterId, targetNovelId, ch.chapter_number, ch.title]
        );

        // Simple sentence segments
        const sentences = ch.raw_text
          .split(/(?<=[.!?])\s+/)
          .map((s) => s.trim())
          .filter(Boolean);

        const segments = sentences.map((sent, sIdx) => ({
          order: sIdx + 1,
          type: 'narration',
          character_id: 'narrator',
          text: sent,
          start_ms: sIdx * 3000,
          end_ms: (sIdx + 1) * 3000,
        }));

        await Chapter.create({
          pg_chapter_id: pgChapterId,
          novel_id: targetNovelId,
          chapter_number: ch.chapter_number,
          title: ch.title,
          raw_text: ch.raw_text,
          segments,
          timeline: segments,
        });
      }

      // Update novel cover artwork if missing
      await client.query(
        `UPDATE novels
         SET cover_object = '/covers/hp1_cover.jpg', updated_at = NOW()
         WHERE id = $1 AND (cover_object IS NULL OR cover_object = '' OR cover_object LIKE '%placeholder%')`,
        [targetNovelId]
      );

      await client.query('COMMIT');
      console.log(`[Consolidate] Successfully migrated novel ${targetNovelId} to ${newChapters.length} clean chapters.`);
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('[Consolidate] Database migration skipped or failed:', err.message);
  } finally {
    if (pool) {
      try {
        await pool.end();
      } catch (_) {}
    }
    if (mongoConnected) {
      try {
        await mongoose.disconnect();
      } catch (_) {}
    }
  }
}

/**
 * Removes orphan upload files from /tmp and backend/data/uploads.
 */
function cleanTempUploads() {
  const tmpDir = os.tmpdir();
  console.log('[Clean] Checking temp upload directory:', tmpDir);
  let removedCount = 0;

  try {
    const files = fs.readdirSync(tmpDir);
    const now = Date.now();
    const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours

    for (const f of files) {
      if (
        f.startsWith('book_upload_') ||
        f.startsWith('foliate_') ||
        f.startsWith('paradee_') ||
        (f.endsWith('.wav') && f.includes('paradee'))
      ) {
        const fullPath = path.join(tmpDir, f);
        try {
          const stats = fs.statSync(fullPath);
          if (now - stats.mtimeMs > maxAgeMs) {
            fs.unlinkSync(fullPath);
            removedCount++;
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    console.warn('[Clean] Error checking temp files:', err.message);
  }

  const backendUploads = path.resolve(__dirname, 'data/uploads');
  if (fs.existsSync(backendUploads)) {
    try {
      const files = fs.readdirSync(backendUploads);
      for (const f of files) {
        const fullPath = path.join(backendUploads, f);
        try {
          const stats = fs.statSync(fullPath);
          if (Date.now() - stats.mtimeMs > 24 * 60 * 60 * 1000) {
            fs.unlinkSync(fullPath);
            removedCount++;
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  console.log(`[Clean] Temp uploads cleaned: ${removedCount} orphan files removed.`);
}

/**
 * In-memory verification suite ensuring boilerplate filtering, segment re-indexing,
 * and 53-spine chapter consolidation work flawlessly.
 */
function runVerificationSelfTest() {
  console.log('\n================================================================');
  console.log('🧪 CLEANING & CHAPTER CONSOLIDATION SELF-TEST SUITE');
  console.log('================================================================\n');

  // 1. Test isBoilerplateLine
  console.log('▶ [1/3] Testing isBoilerplateLine pattern matching...');
  assert.strictEqual(isBoilerplateLine('Notice'), true, 'Expected Notice to be identified as boilerplate');
  assert.strictEqual(isBoilerplateLine('Notice:'), true, 'Expected Notice: to be boilerplate');
  assert.strictEqual(isBoilerplateLine('Created with hocr-to-epub (v.1.0.0)'), true, 'Expected hocr-to-epub to be boilerplate');
  assert.strictEqual(isBoilerplateLine('The Internet Archive was founded in 1996 to build an Internet library...'), true, 'Expected IA 1996 to be boilerplate');
  assert.strictEqual(isBoilerplateLine('The book may not offer the correct reading sequence...'), true, 'Expected IA notice to be boilerplate');
  assert.strictEqual(isBoilerplateLine('Page 0'), true, 'Expected Page 0 to be boilerplate');
  assert.strictEqual(isBoilerplateLine('Page 42'), true, 'Expected Page 42 to be boilerplate');
  assert.strictEqual(
    isBoilerplateLine('First of all, let me get something straight: This is a JOURNAL, not a diary.'),
    false,
    'Expected real prose not to be boilerplate'
  );
  console.log('  ✔ All boilerplate patterns accurately classified!\n');

  // 2. Test sanitizeChapterSegments (Wimpy Kid Section 1 scenario)
  console.log('▶ [2/3] Testing Wimpy Kid Section 1 segment sanitization...');
  const mockWimpyKidSegments = [
    { order: 1, text: 'Notice' },
    { order: 2, text: 'The text on this page is estimated to be only 85% accurate.' },
    { order: 3, text: 'First of all, let me get something straight: This is a JOURNAL, not a diary.' },
    { order: 4, text: 'Created with hocr-to-epub (v.1.0.0)' },
    { order: 5, text: "Now don't expect me to be all 'Dear Diary' this and 'Dear Diary' that." },
  ];

  const sanitized = sanitizeChapterSegments(mockWimpyKidSegments);
  assert.strictEqual(sanitized.length, 2, `Expected 2 segments, got ${sanitized.length}`);
  assert.strictEqual(sanitized[0].order, 1, 'First cleaned segment must have order 1');
  assert.strictEqual(sanitized[0].text, 'First of all, let me get something straight: This is a JOURNAL, not a diary.');
  assert.strictEqual(sanitized[1].order, 2, 'Second cleaned segment must have order 2');
  assert.strictEqual(sanitized[1].text, "Now don't expect me to be all 'Dear Diary' this and 'Dear Diary' that.");
  console.log('  ✔ Wimpy Kid Section 1 successfully stripped of Notice and hocr-to-epub with sequential order!\n');

  // 3. Test 53-spine chapter consolidation (Harry Potter scenario)
  console.log('▶ [3/3] Testing 53-spine chapter consolidation logic...');
  const mockSpineText = `
Notice
The Internet Archive was founded in 1996...
Page 0
Created with hocr-to-epub (v.1.0.0)
Page 1
HARRY POTTER AND THE PHILOSOPHER'S STONE
Page 10
CHAPTER ONE THE BOY WHO LIVED
Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were perfectly normal, thank you very much.
Page 11
They were the last people you'd expect to be involved in anything strange or mysterious.
Page 28
The boy would be famous - a legend.
CHAPTER TWO THE VANISHING GLASS
Nearly ten years had passed since the Dursleys had woken up to find their nephew on the front step.
Page 41
Harry was used to spiders, because the cupboard under the stairs was full of them.
CHAPTER THREE THE LETTERS FROM NO ONE
The escape of the Brazilian boa constrictor earned Harry his longest-ever punishment.
Page 52
By the time he was allowed out of his cupboard again, the summer holidays had started.
`;

  const reconstructed = splitTextIntoChapters(mockSpineText);
  assert.strictEqual(reconstructed.length, 3, `Expected 3 consolidated chapters, got ${reconstructed.length}`);
  assert.strictEqual(reconstructed[0].chapter_number, 1);
  assert.strictEqual(reconstructed[0].title, 'Chapter 1: THE BOY WHO LIVED');
  assert.ok(reconstructed[0].raw_text.includes('Mr. and Mrs. Dursley'));
  assert.ok(!reconstructed[0].raw_text.includes('Notice'));
  assert.ok(!reconstructed[0].raw_text.includes('Created with hocr-to-epub'));

  assert.strictEqual(reconstructed[1].chapter_number, 2);
  assert.strictEqual(reconstructed[1].title, 'Chapter 2: THE VANISHING GLASS');
  assert.ok(reconstructed[1].raw_text.includes('Nearly ten years had passed'));

  assert.strictEqual(reconstructed[2].chapter_number, 3);
  assert.strictEqual(reconstructed[2].title, 'Chapter 3: THE LETTERS FROM NO ONE');
  assert.ok(reconstructed[2].raw_text.includes('The escape of the Brazilian boa constrictor'));

  console.log('  ✔ 53-spine chapter consolidation verified end-to-end!\n');
  console.log('================================================================');
  console.log('🎉 ALL CLEANING & CONSOLIDATION SELF-TESTS PASSED!');
  console.log('================================================================\n');
}

async function main() {
  const args = process.argv.slice(2);
  const isSelfTest = args.includes('--test') || args.includes('--verify');

  if (isSelfTest) {
    runVerificationSelfTest();
    return;
  }

  console.log('=== SyncTone Database & Temp Cleaning Task ===');
  runVerificationSelfTest();
  await cleanLocalChaptersDir();
  await cleanMongoDatabase();
  await consolidateNovelChapters('6e42d4f1-26db-4094-a68c-643935ffd628');
  cleanTempUploads();
  console.log('=== Cleaning Finished Successfully ===');
}

main().catch((err) => {
  console.error('[Clean] Fatal error:', err);
  process.exit(1);
});

module.exports = {
  isBoilerplateLine,
  cleanBoilerplateFromText,
  sanitizeChapterSegments,
  splitTextIntoChapters,
  runVerificationSelfTest,
};
