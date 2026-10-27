const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const child_process = require('child_process');
const { pool } = require('../db');
const { Chapter } = require('../models');
const { parseChapter } = require('../engine/textParser');
const { optionalAuth } = require('../middleware/auth');

const router = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_CHANNELS = ['verified', 'community'];

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
 * No authentication required to preview/parse within the upload modal.
 */
router.post('/novels/parse-file', async (req, res) => {
  let tmpPath = null;
  try {
    const { file_name, file_base64 } = req.body;
    if (!file_base64) {
      return res.status(400).json({ error: 'file_base64 is required.' });
    }

    const ext = path.extname(file_name || 'book.txt').toLowerCase() || '.txt';
    const tmpName = `book_upload_${Date.now()}_${Math.random().toString(36).slice(2, 9)}${ext}`;
    tmpPath = path.join(os.tmpdir(), tmpName);

    // Support data URL prefix if sent from frontend FileReader: data:...;base64,XYZ
    const base64Data = file_base64.includes(',') ? file_base64.split(',')[1] : file_base64;
    const fileBuffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(tmpPath, fileBuffer);

    const scriptPath = path.resolve(__dirname, '../scripts/parseUploadedBook.py');
    const pyOutput = child_process.execFileSync('python3', [scriptPath, tmpPath], {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
      encoding: 'utf-8',
    });

    const parsed = JSON.parse(pyOutput);
    const defaultTitle = file_name
      ? path.basename(file_name, ext).replace(/[_-]+/g, ' ').trim()
      : 'Imported Novel';
    const finalTitle =
      parsed.title && !parsed.title.toLowerCase().startsWith('book_upload') && !parsed.title.toLowerCase().startsWith('book upload')
        ? parsed.title
        : defaultTitle;

    return res.json({
      title: finalTitle,
      synopsis: parsed.synopsis || '',
      cover_object: parsed.cover_object || null,
      chapters: parsed.chapters || [],
    });
  } catch (err) {
    console.error('[Parse File Error]:', err.message);
    return res.status(500).json({ error: `Failed to parse uploaded book file: ${err.message}` });
  } finally {
    if (tmpPath && fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch (_) {}
    }
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

      // Auto-Chapter Ingestion: If chapters array provided, insert up to 50 chapters into PG & MongoDB
      const createdChapters = [];
      if (Array.isArray(rawChapters) && rawChapters.length > 0) {
        const chaptersToIngest = rawChapters.slice(0, 50);

        for (let idx = 0; idx < chaptersToIngest.length; idx++) {
          const ch = chaptersToIngest[idx];
          const chNum = parseInt(ch.chapter_number, 10) || (idx + 1);
          const chTitle = ch.title && typeof ch.title === 'string' && ch.title.trim()
            ? ch.title.trim()
            : `Chapter ${chNum}`;
          const rawText = ch.raw_text || ch.text || '';

          // Parse chapter text into attributed segments
          const parsedData = parseChapter(rawText, chTitle, String(chNum));

          let currentMs = 0;
          const mappedSegments = (parsedData.segments || []).map((s, segIdx) => {
            const isImage = s.type === 'image' || (s.text && s.text.startsWith('[IMAGE:'));
            const words = (s.text || '').trim().split(/\s+/).length;
            const durationMs = isImage ? 1000 : Math.max(800, Math.round((words / 2.8) * 1000));
            const start_ms = currentMs;
            const end_ms = start_ms + durationMs;
            currentMs = end_ms + 250;

            const voiceId = s.assigned_voice_id || (s.type === 'narration' ? 'en-GB-RyanNeural' : 'en-GB-ThomasNeural');

            return {
              order: segIdx + 1,
              segment_id: segIdx + 1,
              type: isImage ? 'image' : s.type,
              text: s.text,
              image_url: s.image_url || (isImage && s.text ? (s.text.match(/\[IMAGE:([^\]]+)\]/) || [])[1] : null),
              character_id: isImage ? 'image' : (s.speaker_id || (s.type === 'narration' ? 'narrator' : 'unknown')),
              speaker_id: isImage ? 'image' : (s.speaker_id || (s.type === 'narration' ? 'narrator' : 'unknown')),
              speaker_name: isImage ? 'Illustration' : (s.speaker_name || (s.type === 'narration' ? 'Narrator' : 'Unknown')),
              voice_id: voiceId,
              assigned_voice_id: voiceId,
              start_ms,
              end_ms,
              confidence: s.attribution_confidence !== undefined ? s.attribution_confidence : 1.0,
              source: s.attribution_source || 'narrator_default',
            };
          });

          const totalDurationMs = mappedSegments.length > 0 ? mappedSegments[mappedSegments.length - 1].end_ms : 0;
          const timeline = mappedSegments.map((s) => ({
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
    const charsRes = await pool.query(charactersQuery, [id]);

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

    return res.json({
      novel: novelRes.rows[0],
      characters: charsRes.rows,
      chapters: chaptersRes.rows,
    });
  } catch (err) {
    console.error('[Novel Details Error]:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve novel details.' });
  }
});

module.exports = router;
