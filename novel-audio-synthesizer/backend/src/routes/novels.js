const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const child_process = require('child_process');
const multer = require('multer');
const { pool } = require('../db');
const { Chapter } = require('../models');
const { parseChapter } = require('../engine/textParser');
const { voiceProfiler } = require('../engine/voiceProfiler');
const { parseUploadedManuscript } = require('../engine/parsers');
const { optionalAuth } = require('../middleware/auth');
const statusRouter = require('./status');
const chaptersRouter = require('./chapters');

const router = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_CHANNELS = ['verified', 'community'];

// Stream multipart file uploads directly to temporary files on disk
const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, os.tmpdir()),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.epub';
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}${ext}`;
    cb(null, `book_upload_${unique}`);
  },
});

let activeParseJobs = 0;
const MAX_CONCURRENT_PARSE_JOBS = 3;

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit to protect against memory exhaustion
});

/**
 * GET /api/novels
 * Retrieves novels with narrator character & voice information and chapter count.
 * Query params: ?channel=verified|community
 */
router.get('/novels', async (req, res) => {
  try {
    const { channel } = req.query;
    const channelFilter = channel && ALLOWED_CHANNELS.includes(channel) ? channel : null;

    const query = `
      SELECT
        n.id,
        n.title,
        n.synopsis,
        n.channel,
        n.status,
        n.global_tone,
        n.portfolio_source,
        n.cover_object,
        n.added_by,
        u.username AS author_username,
        n.created_at,
        n.updated_at,
        c.id AS narrator_character_id,
        c.canonical_name AS narrator_name,
        c.voice_id AS narrator_voice_id,
        v.label AS narrator_voice_label,
        COUNT(DISTINCT ch.id)::int AS chapter_count
      FROM novels n
      LEFT JOIN users u ON n.added_by = u.id
      LEFT JOIN characters c ON c.novel_id = n.id AND c.is_narrator = true
      LEFT JOIN voices v ON c.voice_id = v.id
      LEFT JOIN chapters ch ON ch.novel_id = n.id
      WHERE ($1::varchar IS NULL OR n.channel = $1)
      GROUP BY n.id, u.username, c.id, c.canonical_name, c.voice_id, v.label
      ORDER BY n.created_at DESC;
    `;

    const result = await pool.query(query, [channelFilter]);
    return res.json({ novels: result.rows });
  } catch (err) {
    console.error('[Novels List Error]:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve novels.' });
  }
});

/**
 * POST /api/novels/parse-file
 * Parses an uploaded book file (EPUB, PDF, TXT, MD, HTML) into title, synopsis, and chapters.
 * Supports both multipart/form-data ("file") and JSON ({ file_name, file_base64 }).
 * No authentication required to preview/parse within the upload modal.
 */
router.post('/novels/parse-file', upload.single('file'), async (req, res) => {
  let tmpPath = null;
  let shouldUnlink = false;
  if (activeParseJobs >= MAX_CONCURRENT_PARSE_JOBS) {
    return res.status(429).json({
      error: 'The server is currently parsing other uploaded books. Please wait a moment and retry.',
    });
  }
  activeParseJobs++;
  try {
    let originalName = 'book.epub';
    if (req.file) {
      tmpPath = req.file.path;
      originalName = req.file.originalname || 'book.epub';
      shouldUnlink = true;
    } else if (req.body && req.body.file_base64) {
      const ext = path.extname(req.body.file_name || 'book.txt').toLowerCase() || '.txt';
      const tmpName = `book_upload_${Date.now()}_${Math.random().toString(36).slice(2, 9)}${ext}`;
      tmpPath = path.join(os.tmpdir(), tmpName);
      const base64Data = req.body.file_base64.includes(',')
        ? req.body.file_base64.split(',')[1]
        : req.body.file_base64;
      fs.writeFileSync(tmpPath, Buffer.from(base64Data, 'base64'));
      originalName = req.body.file_name || tmpName;
      shouldUnlink = true;
    } else {
      return res.status(400).json({ error: 'No file provided. Send multipart form with "file" or JSON with "file_base64".' });
    }

    const savedParserConfig = typeof statusRouter.loadParserConfig === 'function' ? statusRouter.loadParserConfig() : {};
    let inlineParserConfig = null;
    if (req.body?.parser_config) {
      try {
        inlineParserConfig =
          typeof req.body.parser_config === 'string'
            ? JSON.parse(req.body.parser_config)
            : req.body.parser_config;
      } catch (_) {}
    }
    const effectiveParserConfig = {
      ...savedParserConfig,
      ...(inlineParserConfig && typeof inlineParserConfig === 'object' ? inlineParserConfig : {}),
    };
    const parserEngine = (req.body?.parser_engine || req.query?.parser_engine || effectiveParserConfig.activeEngine || 'heuristic')
      .toString()
      .toLowerCase()
      .trim();

    const scriptPath = path.resolve(__dirname, '../scripts/parseUploadedBook.py');
    const venvPython = path.resolve(__dirname, '../../../kokoro-tts-backend/.venv/bin/python');
    const pythonBin = fs.existsSync(venvPython) ? venvPython : 'python3';

    const runLocalExtractor = async (targetPath) => {
      const pyOutput = child_process.execFileSync(pythonBin, [scriptPath, targetPath, originalName], {
        maxBuffer: 50 * 1024 * 1024,
        timeout: 60000,
        encoding: 'utf-8',
      });
      return JSON.parse(pyOutput);
    };

    const parsed = await parseUploadedManuscript(tmpPath, {
      parserEngine,
      parserConfig: effectiveParserConfig,
      config: effectiveParserConfig,
      runLocalExtractor,
    });
    if (parsed.error && (!parsed.chapters || parsed.chapters.length === 0)) {
      return res.status(500).json({ error: parsed.error });
    }

    const defaultTitle = originalName
      ? path.basename(originalName, path.extname(originalName)).replace(/[_-]+/g, ' ').trim()
      : 'Imported Novel';
    const finalTitle =
      parsed.title && !parsed.title.toLowerCase().startsWith('book_upload') && !parsed.title.toLowerCase().startsWith('book upload')
        ? parsed.title
        : defaultTitle;

    return res.json({
      title: finalTitle,
      synopsis: parsed.synopsis || '',
      global_tone: parsed.global_tone || null,
      cover_object: parsed.cover_object || parsed.cover_url || null,
      parser_engine: parsed.parser_engine || parserEngine,
      parser_fallback_reason: parsed.parser_fallback_reason || null,
      characters: parsed.characters || [],
      chapters: parsed.chapters || [],
    });
  } catch (err) {
    console.error('[Parse File Error]:', err.message);
    return res.status(500).json({ error: `Failed to parse uploaded book file: ${err.message}` });
  } finally {
    activeParseJobs = Math.max(0, activeParseJobs - 1);
    if (shouldUnlink && tmpPath && fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch (_) {}
    }
  }
});

/**
 * POST /api/novels/upload-asset
 * Saves an extracted cover image or rendered PDF page canvas to /static/covers/
 * and returns a short relative URL (< 255 chars) safe for PostgreSQL novels.cover_object.
 */
router.post('/novels/upload-asset', upload.single('file'), async (req, res) => {
  try {
    const coversDirs = [
      path.resolve(__dirname, '../../output/covers'),
      path.resolve(__dirname, '../../../output/covers'),
    ];
    for (const dir of coversDirs) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let ext = '.jpg';
    let buffer = null;
    if (req.file) {
      ext = path.extname(req.file.originalname || '') || '.jpg';
      buffer = fs.readFileSync(req.file.path);
      try {
        fs.unlinkSync(req.file.path);
      } catch (_) {}
    } else if (req.body && req.body.data_url) {
      const m = String(req.body.data_url).match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (m) {
        ext = m[1] === 'png' ? '.png' : m[1] === 'webp' ? '.webp' : '.jpg';
        buffer = Buffer.from(m[2], 'base64');
      }
    }

    if (!buffer) {
      return res.status(400).json({ error: 'Valid image file or data_url is required.' });
    }

    const fileName = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    for (const dir of coversDirs) {
      try {
        fs.writeFileSync(path.join(dir, fileName), buffer);
      } catch (_) {}
    }

    return res.json({ url: `/static/covers/${fileName}` });
  } catch (err) {
    console.error('[Upload Asset Error]:', err.message);
    return res.status(500).json({ error: 'Failed to save asset.' });
  }
});

/**
 * POST /api/novels
 * Inserts a new novel using specified fields: title, synopsis, channel, added_by
 * If `chapters` array is provided, automatically ingests up to 50 chapters into PostgreSQL & MongoDB!
 */
router.post('/novels', optionalAuth, async (req, res) => {
  try {
    const {
      title,
      synopsis = '',
      channel = 'verified',
      added_by: requestedAddedBy,
      global_tone = null,
      cover_object = null,
      chapters: rawChapters = [],
      characters: rawCharacters = [],
    } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required.' });
    }

    // Prevent IDOR: an authenticated user (unless admin) can only create novels for their own id
    const added_by = (req.user && req.user.role !== 'admin')
      ? req.user.id
      : (requestedAddedBy || req.user?.id);
    if (!added_by || !UUID_REGEX.test(added_by)) {
      return res.status(400).json({
        error: 'A valid added_by user UUID is required (or provide an authenticated session).',
      });
    }

    const normalizedChannel = channel ? channel.toLowerCase().trim() : 'verified';
    if (!ALLOWED_CHANNELS.includes(normalizedChannel)) {
      return res.status(400).json({
        error: `Invalid channel. Allowed values: ${ALLOWED_CHANNELS.join(', ')}.`,
      });
    }

    // Verify added_by user exists in PostgreSQL (via Prisma ORM layered over PG, with pg pool fallback)
    const { prisma } = require('../db');
    let targetUser = null;
    if (prisma.user) {
      targetUser = await prisma.user.findUnique({
        where: { id: added_by },
        select: { id: true, role: true },
      }).catch(() => null);
    }
    if (!targetUser) {
      const userCheck = await pool.query('SELECT id, role FROM users WHERE id = $1', [added_by]);
      targetUser = userCheck.rows[0] || null;
    }
    if (!targetUser) {
      return res.status(400).json({ error: `User with id '${added_by}' does not exist.` });
    }

    // Role check: neither authenticated readers nor target reader users may create novels
    const effectiveRole = req.user?.role || targetUser.role;
    if (effectiveRole === 'reader') {
      return res.status(403).json({
        error: "Forbidden: role 'reader' cannot create novels. Only writers and admins may create novels.",
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify added_by user exists in PostgreSQL
      const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [added_by]);
      if (userCheck.rows.length === 0) {
        throw { status: 400, message: `User with id '${added_by}' does not exist.` };
      }

      const query = `
        INSERT INTO novels (title, synopsis, channel, added_by, global_tone, cover_object)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
      `;

      const result = await client.query(query, [
        title.trim(),
        synopsis ? synopsis.trim() : '',
        normalizedChannel,
        added_by,
        global_tone,
        cover_object,
      ]);

      const createdNovel = result.rows[0];

      // Enqueue profile_novel job into synthesis_jobs and novel_profile_job_targets within the same transaction
      const jobRes = await client.query(
        `
        INSERT INTO synthesis_jobs (requested_by, job_type, status, progress_pct)
        VALUES ($1, 'profile_novel', 'queued', 0.0)
        RETURNING id, status, job_type;
      `,
        [added_by]
      );

      const createdJob = jobRes.rows[0];

      await client.query(
        `
        INSERT INTO novel_profile_job_targets (job_id, novel_id)
        VALUES ($1, $2);
      `,
        [createdJob.id, createdNovel.id]
      );

      // Auto-Chapter Ingestion: If chapters array provided, insert chapters into PG & MongoDB
      const createdChapters = [];
      const preAssignedVoiceMap = new Map();
      const preAssignedGenderMap = new Map();
      const detectedCast = new Map();
      const toSlug = (str) =>
        String(str || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '');
      const toValidVoiceStr = (val) => {
        if (!val) return null;
        if (typeof val === 'object') {
          const inner = val.voiceId || val.voice_id || null;
          return typeof inner === 'string' && inner.trim() ? inner.trim() : null;
        }
        const s = String(val).trim();
        return s || null;
      };
      const normalizeGender = (val) => {
        const g = String(val || '').toLowerCase().trim();
        return g === 'male' || g === 'female' ? g : 'unknown';
      };

      detectedCast.set('narrator', {
        name: 'Narrator',
        voiceId: 'en-GB-RyanNeural',
        gender: 'male',
        isNarrator: true,
        sampleQuote: 'Primary narrative voice.',
      });

      const incomingCharacters = Array.isArray(rawCharacters) ? rawCharacters : [];
      for (const c of incomingCharacters) {
        if (!c || typeof c !== 'object') continue;
        const charName = String(c.name || c.speaker_name || c.character_id || '').trim();
        const cid = String(c.character_id || '').trim();
        const lowerName = charName.toLowerCase();
        const lowerCid = cid.toLowerCase();
        const slug = toSlug(charName || cid);
        const isNarr = c.is_narrator === true || lowerCid === 'narrator' || lowerName === 'narrator';
        const voiceId = toValidVoiceStr(c.voice_id);
        const gender = normalizeGender(c.gender);

        for (const k of [lowerName, lowerCid, slug]) {
          if (!k) continue;
          if (voiceId) preAssignedVoiceMap.set(k, voiceId);
          if (gender !== 'unknown') preAssignedGenderMap.set(k, gender);
        }

        if (isNarr) {
          const narrEntry = detectedCast.get('narrator');
          if (voiceId) narrEntry.voiceId = voiceId;
          if (gender !== 'unknown') narrEntry.gender = gender;
          if (c.sample_quote) narrEntry.sampleQuote = String(c.sample_quote).slice(0, 220);
        } else if (charName && !['unknown', 'unresolved', 'speaker_a', 'speaker_b', 'dialogue_speaker', 'dialogue_turn_even', 'dialogue_turn_odd', 'image'].includes(slug)) {
          detectedCast.set(lowerName, {
            name: charName,
            voiceId: voiceId || 'en-GB-ThomasNeural',
            gender,
            isNarrator: false,
            sampleQuote: String(c.sample_quote || '').slice(0, 220),
          });
        }
      }

      if (Array.isArray(rawChapters) && rawChapters.length > 0) {
        const chaptersToIngest = rawChapters.slice(0, 500);
        const savedParserConfig = typeof statusRouter.loadParserConfig === 'function' ? statusRouter.loadParserConfig() : {};
        const reqParserEngine = req.body?.parser_engine || savedParserConfig.activeEngine || 'heuristic';
        const reqParserConfig = req.body?.parser_config || savedParserConfig;

        for (let idx = 0; idx < chaptersToIngest.length; idx++) {
          const ch = chaptersToIngest[idx];
          const chNum = parseInt(ch.chapter_number, 10) || (idx + 1);
          const chTitle = ch.title && typeof ch.title === 'string' && ch.title.trim()
            ? ch.title.trim()
            : `Chapter ${chNum}`;
          const rawText = ch.raw_text || ch.text || ch.content || '';

          // Parse chapter text into attributed segments (or preserve pre-attributed/pre-segmented ch.segments)
          const preAttributedSegments =
            Array.isArray(ch.segments) && ch.segments.length > 0 ? ch.segments : null;
          let mappedSegments;
          let totalDurationMs;
          let timeline;

          if (preAttributedSegments) {
            const origSegments = preAttributedSegments.map((s) => ({ ...s }));
            const voicedSegments = voiceProfiler.applyVoicesToSegments(preAttributedSegments);
            let currentMs = 0;
            mappedSegments = voicedSegments.map((s, segIdx) => {
              const orig = origSegments[segIdx] || {};
              const isImage = s.type === 'image' || (s.text && s.text.startsWith('[IMAGE:'));
              const words = (s.text || '').trim().split(/\s+/).filter(Boolean).length;
              const durationMs = isImage ? 1000 : Math.max(800, Math.round((words / 2.8) * 1000));
              const start_ms = currentMs;
              const end_ms = start_ms + durationMs;
              currentMs = end_ms + 250;

              const speakerId = isImage
                ? 'image'
                : (orig.speaker_id || orig.character_id || s.speaker_id || s.character_id || (s.type === 'narration' ? 'narrator' : 'unknown'));
              const isNarr = !isImage && (s.type === 'narration' || String(speakerId).toLowerCase() === 'narrator');
              const speakerName = isImage
                ? 'Illustration'
                : (orig.speaker_name || s.speaker_name || (isNarr ? 'Narrator' : 'Unknown'));
              const lowerName = String(speakerName).toLowerCase();
              const lowerId = String(speakerId).toLowerCase();
              const slug = toSlug(speakerName);

              const preVoice = isImage
                ? 'image'
                : isNarr
                  ? preAssignedVoiceMap.get('narrator')
                  : (preAssignedVoiceMap.get(lowerName) || preAssignedVoiceMap.get(lowerId) || preAssignedVoiceMap.get(slug));
              const origVoice = toValidVoiceStr(orig.voice_id || orig.assigned_voice_id);
              const profiledVoice = toValidVoiceStr(s.assigned_voice_id || s.voice_id);
              const voiceId = isImage
                ? 'image'
                : (preVoice || origVoice || profiledVoice || (isNarr ? 'en-GB-RyanNeural' : 'en-GB-ThomasNeural'));

              const gender =
                preAssignedGenderMap.get(lowerName) ||
                preAssignedGenderMap.get(lowerId) ||
                preAssignedGenderMap.get(slug) ||
                normalizeGender(orig.speaker_gender || s.speaker_gender);

              return {
                order: segIdx + 1,
                segment_id: segIdx + 1,
                type: isImage ? 'image' : (isNarr ? 'narration' : 'dialogue'),
                text: s.text,
                image_url: s.image_url || (isImage && s.text ? (s.text.match(/\[IMAGE:([^\]]+)\]/) || [])[1] : null),
                character_id: speakerId,
                speaker_id: speakerId,
                speaker_name: speakerName,
                speaker_gender: gender,
                voice_id: voiceId,
                assigned_voice_id: voiceId,
                start_ms,
                end_ms,
                confidence: s.attribution_confidence !== undefined ? s.attribution_confidence : (s.confidence !== undefined ? s.confidence : 1.0),
                source: chaptersRouter.sanitizeSegmentSource(s.attribution_source || s.source, isImage, isNarr, speakerId),
              };
            });
            totalDurationMs = mappedSegments.length > 0 ? mappedSegments[mappedSegments.length - 1].end_ms : 0;
            timeline = mappedSegments.map((s) => ({
              order: s.order,
              segment_id: s.segment_id,
              start_ms: s.start_ms,
              end_ms: s.end_ms,
              character_id: s.character_id,
              voice_id: s.voice_id,
              text: s.text,
              type: s.type,
              image_url: s.image_url || null,
            }));
          } else {
            const built = await chaptersRouter.buildParsedSegmentsAndManifestAsync(
              rawText,
              chTitle,
              String(chNum),
              {
                parserEngine: reqParserEngine,
                parserConfig: reqParserConfig,
                existingVoiceMap: preAssignedVoiceMap.size > 0 ? preAssignedVoiceMap : null,
              }
            );
            mappedSegments = built.mappedSegments;
            totalDurationMs = built.totalDurationMs;
            timeline = built.timeline;
          }

          for (const seg of mappedSegments) {
            if (
              seg.type !== 'image' &&
              seg.speaker_id !== 'narrator' &&
              seg.speaker_id !== 'unresolved' &&
              seg.speaker_id !== 'unknown' &&
              seg.speaker_id !== 'unknown_speaker' &&
              seg.speaker_id !== 'dialogue_turn_even' &&
              seg.speaker_id !== 'dialogue_turn_odd' &&
              seg.speaker_id !== 'speaker_a' &&
              seg.speaker_id !== 'speaker_b' &&
              seg.speaker_name &&
              seg.speaker_name !== 'Unknown'
            ) {
              const castKey = String(seg.speaker_name).toLowerCase();
              const preVoice =
                preAssignedVoiceMap.get(castKey) ||
                preAssignedVoiceMap.get(String(seg.speaker_id || '').toLowerCase()) ||
                preAssignedVoiceMap.get(toSlug(seg.speaker_name));
              const preGender =
                preAssignedGenderMap.get(castKey) ||
                preAssignedGenderMap.get(String(seg.speaker_id || '').toLowerCase()) ||
                preAssignedGenderMap.get(toSlug(seg.speaker_name));
              if (!detectedCast.has(castKey)) {
                detectedCast.set(castKey, {
                  name: seg.speaker_name,
                  voiceId: preVoice || seg.voice_id,
                  gender: preGender || normalizeGender(seg.speaker_gender),
                  isNarrator: false,
                  sampleQuote: (seg.text || '').slice(0, 220),
                });
              } else {
                const existingEntry = detectedCast.get(castKey);
                if (!existingEntry.sampleQuote && seg.text) {
                  existingEntry.sampleQuote = String(seg.text).slice(0, 220);
                }
              }
            }
          }

          // Insert into PostgreSQL chapters with status = 'completed'
          const chRes = await client.query(
            `
            INSERT INTO chapters (novel_id, chapter_number, title, status, audio_version, total_duration_ms)
            VALUES ($1, $2, $3, 'completed', 1, $4)
            RETURNING *;
            `,
            [createdNovel.id, chNum, chTitle, totalDurationMs]
          );
          const pgChapter = chRes.rows[0];

          // Insert into MongoDB Chapter model
          try {
            const mongoDoc = new Chapter({
              pg_chapter_id: pgChapter.id,
              novel_id: createdNovel.id,
              chapter_number: chNum,
              title: chTitle,
              raw_text: rawText,
              audio_version: 1,
              manifest: {
                total_duration_ms: totalDurationMs,
                audio_url: `/api/stream/${pgChapter.id}`,
                timeline,
              },
              segments: mappedSegments,
            });
            await mongoDoc.save();
          } catch (mErr) {
            console.warn(`[Novels] Could not save chapter ${chNum} to MongoDB:`, mErr.message);
          }

          createdChapters.push(pgChapter);
        }
      }

      // Populate PostgreSQL characters portfolio whenever chapters or pre-assigned characters were provided
      if ((Array.isArray(rawChapters) && rawChapters.length > 0) || incomingCharacters.length > 0) {
        await client.query('SAVEPOINT sp_novel_characters');
        try {
          for (const charEntry of detectedCast.values()) {
            const voiceGender =
              charEntry.gender === 'male' || charEntry.gender === 'female' ? charEntry.gender : 'other';
            const charGender =
              charEntry.gender === 'male' || charEntry.gender === 'female' ? charEntry.gender : 'unknown';
            await client.query(
              `INSERT INTO voices (id, label, gender, age_band, language, reserved_narrator)
               VALUES ($1, $2, $3, 'adult', 'en-us', $4)
               ON CONFLICT (id) DO NOTHING`,
              [charEntry.voiceId, charEntry.voiceId, voiceGender, Boolean(charEntry.isNarrator)]
            );
            await client.query(
              `
              INSERT INTO characters (novel_id, canonical_name, gender, age_band, temperament, sample_quote, voice_id, speed_multiplier, is_narrator, source)
              VALUES ($1, $2, $3, 'adult', 'calm', $4, $5, 1.0, $6, 'manual')
              ON CONFLICT (novel_id, canonical_name) DO UPDATE SET
                voice_id = EXCLUDED.voice_id,
                gender = CASE WHEN EXCLUDED.gender <> 'unknown' THEN EXCLUDED.gender ELSE characters.gender END,
                updated_at = now();
              `,
              [createdNovel.id, charEntry.name, charGender, charEntry.sampleQuote || '', charEntry.voiceId, charEntry.isNarrator]
            );
          }
          await client.query('RELEASE SAVEPOINT sp_novel_characters');
        } catch (charErr) {
          await client.query('ROLLBACK TO SAVEPOINT sp_novel_characters').catch(() => {});
          console.warn('[Novels] Character portfolio population warning:', charErr.message);
        }
      }

      await client.query('COMMIT');

      return res.status(201).json({
        message: 'Novel created successfully',
        novel: createdNovel,
        chapters: createdChapters,
        job: {
          ...createdJob,
          novel_id: createdNovel.id,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('[Create Novel Error]:', err.message);
    return res.status(500).json({ error: 'Failed to create novel.' });
  }
});

/**
 * GET /api/novels/:id
 * Retrieves novel details, characters roster, and chapter directory.
 */
router.get('/novels/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'Invalid novel UUID format.' });
    }

    // 1. Novel details with narrator info
    const novelQuery = `
      SELECT
        n.*,
        u.username AS author_username,
        c.id AS narrator_character_id,
        c.canonical_name AS narrator_name,
        c.voice_id AS narrator_voice_id,
        v.label AS narrator_voice_label
      FROM novels n
      LEFT JOIN users u ON n.added_by = u.id
      LEFT JOIN characters c ON c.novel_id = n.id AND c.is_narrator = true
      LEFT JOIN voices v ON c.voice_id = v.id
      WHERE n.id = $1;
    `;
    const novelRes = await pool.query(novelQuery, [id]);
    if (novelRes.rows.length === 0) {
      return res.status(404).json({ error: 'Novel not found.' });
    }

    // 2. Character portfolio
    const charactersQuery = `
      SELECT
        c.id, c.novel_id, c.canonical_name, c.gender, c.age_band,
        c.temperament, c.sample_quote, c.voice_id, c.speed_multiplier,
        c.is_narrator, c.needs_review, c.source, c.created_at, c.updated_at,
        v.label AS voice_label
      FROM characters c
      LEFT JOIN voices v ON c.voice_id = v.id
      WHERE c.novel_id = $1
      ORDER BY c.is_narrator DESC, c.canonical_name ASC;
    `;
    let charsRes = await pool.query(charactersQuery, [id]);

    // 3. Chapter directory
    const chaptersQuery = `
      SELECT
        id, novel_id, chapter_number, title, status, audio_version,
        swift_audio_object, total_duration_ms, created_at, updated_at
      FROM chapters
      WHERE novel_id = $1
      ORDER BY chapter_number ASC;
    `;
    const chaptersRes = await pool.query(chaptersQuery, [id]);

    // Self-heal chapters with broken attribution (>50% dialogue unresolved or all dialogue sharing narrator voice)
    // and ensure discovered characters are synced to PostgreSQL
    let novelRow = novelRes.rows[0];
    if (chaptersRes.rows.length > 0) {
      try {
        const mongoChapters = await Chapter.find({ novel_id: id }).sort({ chapter_number: 1 }).limit(100);
        let healedAny = false;
        for (const mDoc of mongoChapters) {
          if (chaptersRouter.needsSelfHealingReparse(mDoc)) {
            await chaptersRouter.healChapterDocument(mDoc, id, pool);
            healedAny = true;
          }
        }

        if (healedAny || charsRes.rows.length === 0) {
          for (const mDoc of mongoChapters) {
            if (Array.isArray(mDoc.segments) && mDoc.segments.length > 0) {
              await chaptersRouter.upsertDiscoveredCharactersPg(pool, id, mDoc.segments);
            }
          }
          charsRes = await pool.query(charactersQuery, [id]);
          const refreshedNovel = await pool.query(novelQuery, [id]);
          if (refreshedNovel.rows.length > 0) {
            novelRow = refreshedNovel.rows[0];
          }
        }
      } catch (healErr) {
        console.warn('[Novels] Self-healing check warning:', healErr.message);
      }
    }

    return res.json({
      novel: novelRow,
      characters: charsRes.rows,
      chapters: chaptersRes.rows,
    });
  } catch (err) {
    console.error('[Novel Details Error]:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve novel details.' });
  }
});

/**
 * PATCH /api/novels/:id
 * Updates specific novel metadata fields: cover_object, title, synopsis, global_tone, channel.
 */
router.patch('/novels/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'Invalid novel UUID format.' });
    }

    const { cover_object, title, synopsis, global_tone, channel } = req.body || {};

    const fields = [];
    const values = [];
    let idx = 1;

    if (cover_object !== undefined) {
      fields.push(`cover_object = $${idx++}`);
      values.push(cover_object);
    }
    if (title !== undefined && typeof title === 'string' && title.trim()) {
      fields.push(`title = $${idx++}`);
      values.push(title.trim());
    }
    if (synopsis !== undefined) {
      fields.push(`synopsis = $${idx++}`);
      values.push(synopsis);
    }
    if (global_tone !== undefined) {
      fields.push(`global_tone = $${idx++}`);
      values.push(global_tone);
    }
    if (channel !== undefined) {
      const normalizedChannel = channel ? channel.toLowerCase().trim() : 'verified';
      if (!ALLOWED_CHANNELS.includes(normalizedChannel)) {
        return res.status(400).json({
          error: `Invalid channel. Allowed values: ${ALLOWED_CHANNELS.join(', ')}.`,
        });
      }
      fields.push(`channel = $${idx++}`);
      values.push(normalizedChannel);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields provided for update.' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE novels
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING id, title, synopsis, global_tone, channel, cover_object, added_by, created_at, updated_at;
    `;

    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Novel not found.' });
    }

    return res.json({
      message: 'Novel updated successfully',
      novel: result.rows[0],
    });
  } catch (err) {
    console.error('[Update Novel Error]:', err.message);
    return res.status(500).json({ error: `Failed to update novel: ${err.message}` });
  }
});

/**
 * DELETE /api/novels and DELETE /api/novels/:id
 * Permanent deletion of novels is prohibited. SyncTone preserves all literary works.
 */
router.delete(['/novels', '/novels/:id'], optionalAuth, async (req, res) => {
  return res.status(403).json({
    error: 'Permanent deletion of novels is prohibited. SyncTone preserves all literary works.',
    code: 'PERMANENT_DELETION_DISABLED',
  });
});

module.exports = router;
