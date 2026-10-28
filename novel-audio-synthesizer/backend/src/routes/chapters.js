const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');
const { Chapter } = require('../models');
const { parseChapter } = require('../engine/textParser');
const { attributionEngine } = require('../engine/attribution');
const { voiceProfiler } = require('../engine/voiceProfiler');
const { ttsEngine } = require('../engine/ttsEngine');
const { audioStitcher } = require('../engine/audioStitcher');
const { eventDispatcher } = require('../engine/eventDispatcher');
const { validateAudioBuffer } = require('../engine/audioValidator');
const { broadcastProgress } = require('../websocket');
const { config } = require('../config');
const { authenticateUser, optionalAuth, requireRole } = require('../middleware/auth');
const { getSwiftAuth } = require('./swift');

const router = Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function persistChapterToDisk(chapterId, title, text) {
  try {
    const chapterDir = path.join(config.paths.chaptersDir, chapterId);
    if (!fs.existsSync(chapterDir)) {
      fs.mkdirSync(chapterDir, { recursive: true });
    }
    fs.writeFileSync(path.join(chapterDir, 'raw.txt'), text, 'utf-8');
    fs.writeFileSync(
      path.join(chapterDir, 'metadata.json'),
      JSON.stringify({ title, chapter_id: chapterId }),
      'utf-8'
    );
  } catch (err) {
    console.warn('[Chapters] Failed to write disk backup:', err.message);
  }
}

async function getOrCreateDefaultNovel() {
  const existing = await pool.query('SELECT id FROM novels ORDER BY created_at ASC LIMIT 1');
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }
  let userRes = await pool.query("SELECT id FROM users WHERE role IN ('writer', 'admin') LIMIT 1");
  if (userRes.rows.length === 0) {
    userRes = await pool.query(`
      INSERT INTO users (username, email, password_hash, role)
      VALUES ('synctone_author', 'author@synctone.internal', crypt('author123', gen_salt('bf')), 'writer')
      ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
      RETURNING id;
    `);
  }
  const authorId = userRes.rows[0].id;
  const novelRes = await pool.query(
    `
    INSERT INTO novels (title, synopsis, channel, added_by)
    VALUES ('Demo Novel', 'Default novel for direct chapter uploads.', 'verified', $1)
    RETURNING id;
  `,
    [authorId]
  );
  return novelRes.rows[0].id;
}

/**
 * Common ingestion helper: performs atomic PostgreSQL transaction and MongoDB document creation.
 */
async function ingestChapter({ novelId, title, text, chapterNumber, requestedBy }) {
  let client;
  let clientReleased = false;
  let createdPgChapter = null;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // 1. Verify novel exists and lock parent novel row with FOR UPDATE when auto-numbering
    // to serialize concurrent insertions and prevent chapter numbering race conditions
    const novelQuery = (!chapterNumber || chapterNumber < 1)
      ? 'SELECT id FROM novels WHERE id = $1 FOR UPDATE'
      : 'SELECT id FROM novels WHERE id = $1';
    const novelCheck = await client.query(novelQuery, [novelId]);
    if (novelCheck.rows.length === 0) {
      throw { status: 404, message: `Novel with id '${novelId}' not found.` };
    }

    // 2. Determine chapter_number if not provided
    let num = chapterNumber;
    if (!num || num < 1) {
      const numRes = await client.query(
        'SELECT COALESCE(MAX(chapter_number), 0) + 1 AS next_num FROM chapters WHERE novel_id = $1',
        [novelId]
      );
      num = parseInt(numRes.rows[0].next_num, 10);
    }

    const chapterTitle = title && typeof title === 'string' && title.trim().length > 0
      ? title.trim()
      : `Chapter ${num}`;

    // 3. Insert relational chapter record into PostgreSQL
    const insertChapterQuery = `
      INSERT INTO chapters (novel_id, chapter_number, title, status, audio_version, total_duration_ms)
      VALUES ($1, $2, $3, 'draft', 1, 0)
      RETURNING id, novel_id, chapter_number, title, status, audio_version, total_duration_ms, created_at, updated_at;
    `;
    const chapterRes = await client.query(insertChapterQuery, [novelId, num, chapterTitle]);
    createdPgChapter = chapterRes.rows[0];

    // 4. Enqueue synthesis job into PostgreSQL within the same transaction
    const insertJobQuery = `
      INSERT INTO synthesis_jobs (requested_by, job_type, status, progress_pct)
      VALUES ($1, 'synthesize_chapter', 'queued', 0.0)
      RETURNING id, requested_by, job_type, status, progress_pct, created_at;
    `;
    const jobRes = await client.query(insertJobQuery, [
      requestedBy || null,
    ]);
    const job = jobRes.rows[0];

    await client.query(
      `
      INSERT INTO chapter_synthesis_job_targets (job_id, chapter_id)
      VALUES ($1, $2);
      `,
      [job.id, createdPgChapter.id]
    );

    job.novel_id = novelId;
    job.chapter_id = createdPgChapter.id;

    // 5. Create document in MongoDB (linked via pg_chapter_id)
    const mongoDoc = new Chapter({
      pg_chapter_id: createdPgChapter.id,
      novel_id: createdPgChapter.novel_id,
      chapter_number: createdPgChapter.chapter_number,
      title: createdPgChapter.title,
      raw_text: text,
      audio_version: 1,
      manifest: {
        total_duration_ms: 0,
        audio_url: '',
        timeline: [],
      },
      segments: [],
    });
    await mongoDoc.save();

    // 6. Commit transaction
    await client.query('COMMIT');
    client.release();
    clientReleased = true;

    persistChapterToDisk(createdPgChapter.id, createdPgChapter.title, text);

    return {
      chapter: createdPgChapter,
      job,
      mongo_id: mongoDoc._id,
    };
  } catch (err) {
    if (client && !clientReleased) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
      clientReleased = true;
    }

    // Compensating cleanup: remove orphan MongoDB document if created
    if (createdPgChapter && createdPgChapter.id) {
      await Chapter.deleteOne({ pg_chapter_id: createdPgChapter.id }).catch(() => {});
    }

    throw err;
  }
}

/**
 * 1. POST /api/novels/:id/chapters
 * Official Polyglot Chapter Ingestion route (saves text to Mongo, enqueues job in Postgres).
 */
router.post('/novels/:id/chapters', optionalAuth, async (req, res) => {
  try {
    const novelId = req.params.id;
    const { text, title, chapter_number, requested_by } = req.body;

    if (!novelId || !UUID_REGEX.test(novelId)) {
      return res.status(400).json({ error: 'Invalid novel UUID in route parameter.' });
    }

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Missing or empty chapter "text" field.' });
    }

    // Verify novel exists in PostgreSQL before authorization checks
    const novelCheck = await pool.query('SELECT id FROM novels WHERE id = $1', [novelId]);
    if (novelCheck.rows.length === 0) {
      return res.status(404).json({ error: `Novel with id '${novelId}' not found.` });
    }

    // Verify caller has authorized writer/admin role
    if (req.user) {
      if (req.user.role === 'reader') {
        return res.status(403).json({ error: "Forbidden: role 'reader' cannot ingest chapters." });
      }
    } else if (requested_by) {
      if (!UUID_REGEX.test(requested_by)) {
        return res.status(400).json({ error: 'Invalid requested_by user UUID.' });
      }
      const userRoleCheck = await pool.query('SELECT role FROM users WHERE id = $1', [requested_by]);
      if (userRoleCheck.rows.length === 0) {
        return res.status(404).json({ error: `User with id '${requested_by}' does not exist.` });
      }
      if (userRoleCheck.rows[0].role === 'reader') {
        return res.status(403).json({ error: "Forbidden: role 'reader' cannot ingest chapters." });
      }
    } else {
      return res.status(401).json({
        error: 'Authentication required. Please log in or provide an authorized writer user ID.',
      });
    }

    // Prevent IDOR: authenticated users always use their own id unless admin
    const effectiveRequestedBy = (req.user && req.user.role !== 'admin')
      ? req.user.id
      : (requested_by || req.user?.id || null);

    const result = await ingestChapter({
      novelId,
      title,
      text,
      chapterNumber: chapter_number ? parseInt(chapter_number, 10) : undefined,
      requestedBy: effectiveRequestedBy,
    });

    return res.status(201).json({
      message: 'Chapter ingested successfully',
      chapter_id: result.chapter.id,
      chapter: result.chapter,
      job: result.job,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Chapter number already exists for this novel.' });
    }
    console.error('[Chapter Ingestion Error]:', err);
    return res.status(500).json({ error: 'Failed to ingest chapter.' });
  }
});

/**
 * 2. POST /api/upload
 * Backwards-compatible upload route: ingests into specified novel or default novel.
 */
router.post('/upload', optionalAuth, async (req, res) => {
  try {
    const { text, title = 'Untitled Chapter', novel_id, requested_by } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Missing or invalid "text" field' });
    }

    if (req.user) {
      if (req.user.role === 'reader') {
        return res.status(403).json({ error: "Forbidden: role 'reader' cannot ingest chapters." });
      }
    } else if (requested_by) {
      if (!UUID_REGEX.test(requested_by)) {
        return res.status(400).json({ error: 'Invalid requested_by user UUID.' });
      }
      const userRoleCheck = await pool.query('SELECT role FROM users WHERE id = $1', [requested_by]);
      if (userRoleCheck.rows.length === 0) {
        return res.status(404).json({ error: `User with id '${requested_by}' does not exist.` });
      }
      if (userRoleCheck.rows[0].role === 'reader') {
        return res.status(403).json({ error: "Forbidden: role 'reader' cannot ingest chapters." });
      }
    } else {
      return res.status(401).json({
        error: 'Authentication required. Please log in or provide an authorized writer user ID.',
      });
    }

    let effectiveNovelId = novel_id;
    if (!effectiveNovelId || !UUID_REGEX.test(effectiveNovelId)) {
      effectiveNovelId = await getOrCreateDefaultNovel();
    }

    // Prevent IDOR: authenticated users always use their own id unless admin
    const effectiveRequestedBy = (req.user && req.user.role !== 'admin')
      ? req.user.id
      : (requested_by || req.user?.id || null);

    const result = await ingestChapter({
      novelId: effectiveNovelId,
      title,
      text,
      requestedBy: effectiveRequestedBy,
    });

    console.log(`[Chapters] Uploaded '${result.chapter.title}' as ${result.chapter.id}`);
    return res.json({
      chapter_id: result.chapter.id,
      chapter: result.chapter,
      job: result.job,
    });
  } catch (err) {
    console.error('[Upload Error]:', err);
    return res.status(500).json({ error: 'Failed to upload chapter.' });
  }
});

/**
 * 3. GET /api/chapters
 * Retrieves chapters from PostgreSQL joined with novels.
 */
router.get('/chapters', async (_req, res) => {
  try {
    const query = `
      SELECT 
        c.id AS chapter_id,
        c.id,
        c.novel_id,
        c.chapter_number,
        c.title,
        c.status,
        c.audio_version,
        c.swift_audio_object,
        c.total_duration_ms,
        c.created_at,
        c.updated_at,
        n.title AS novel_title
      FROM chapters c
      LEFT JOIN novels n ON c.novel_id = n.id
      ORDER BY c.created_at DESC;
    `;
    const result = await pool.query(query);

    const list = result.rows.map((row) => ({
      chapter_id: row.id,
      title: row.title,
      chapter_number: row.chapter_number,
      novel_id: row.novel_id,
      novel_title: row.novel_title,
      status: row.status,
      has_parsed: row.status !== 'draft',
      has_manifest: row.status === 'completed' || row.total_duration_ms > 0,
      total_duration_ms: row.total_duration_ms,
    }));

    return res.json({ chapters: list });
  } catch (err) {
    console.error('[Get Chapters Error]:', err.message);
    return res.status(500).json({ error: 'Failed to fetch chapters list.' });
  }
});

/**
 * 4. POST /api/parse/:chapter_id
 * Reads chapter text from MongoDB, runs parsing & attribution, updates MongoDB & PostgreSQL.
 */
router.post('/parse/:chapter_id', authenticateUser, async (req, res) => {
  const { chapter_id } = req.params;

  if (!chapter_id || !UUID_REGEX.test(chapter_id)) {
    return res.status(400).json({ error: 'Invalid chapter UUID format.' });
  }

  if (req.user && req.user.role === 'reader') {
    return res.status(403).json({ error: "Forbidden: role 'reader' cannot parse chapters." });
  }

  try {
    const chapterDoc = await Chapter.findOne({ pg_chapter_id: chapter_id });
    if (!chapterDoc) {
      return res.status(404).json({ detail: 'Chapter not found in document store.' });
    }

    broadcastProgress(chapter_id, {
      chapter_id,
      current_segment: 0,
      total_segments: 0,
      percent_complete: 10,
      status: 'parsing',
    });

    const parsed = parseChapter(chapterDoc.raw_text, chapterDoc.title, chapter_id);

    broadcastProgress(chapter_id, {
      chapter_id,
      current_segment: 0,
      total_segments: parsed.segments.length,
      percent_complete: 40,
      status: 'attributing',
    });

    const knownChars = Array.from(
      new Set(
        parsed.segments
          .filter((s) => s.speaker_name && s.speaker_id !== 'unresolved' && s.speaker_id !== 'narrator')
          .map((s) => s.speaker_name)
      )
    );

    parsed.segments = await attributionEngine.resolveUnattributed(parsed.segments, knownChars);
    parsed.segments = voiceProfiler.applyVoicesToSegments(parsed.segments);

    // Save parsed segments into MongoDB
    chapterDoc.segments = parsed.segments.map((seg, idx) => ({
      order: idx + 1,
      segment_id: idx + 1,
      type: seg.speaker_id === 'narrator' ? 'narration' : 'dialogue',
      text: seg.text,
      character_id: seg.speaker_id || null,
      speaker_id: seg.speaker_id || null,
      speaker_name: seg.speaker_name || seg.speaker_id || 'Narrator',
      voice_id: seg.assigned_voice_id || 'am_adam',
      assigned_voice_id: seg.assigned_voice_id || 'am_adam',
      start_ms: 0,
      end_ms: 0,
      confidence: typeof seg.attribution_confidence === 'number'
        ? seg.attribution_confidence
        : (typeof seg.confidence === 'number' ? seg.confidence : 1.0),
      source: seg.attribution_source || seg.source || 'narrator_default',
      needs_review: seg.needs_review || false,
    }));
    await chapterDoc.save();

    // Update PostgreSQL status
    await pool.query(
      "UPDATE chapters SET status = 'parsed', updated_at = now() WHERE id = $1",
      [chapter_id]
    );

    const chapterDir = path.join(config.paths.chaptersDir, chapter_id);
    if (!fs.existsSync(chapterDir)) fs.mkdirSync(chapterDir, { recursive: true });
    fs.writeFileSync(path.join(chapterDir, 'parsed.json'), JSON.stringify(parsed, null, 2), 'utf-8');

    broadcastProgress(chapter_id, {
      chapter_id,
      current_segment: parsed.segments.length,
      total_segments: parsed.segments.length,
      percent_complete: 100,
      status: 'complete',
    });

    console.log(`[Chapters] Parsed ${chapter_id} with ${parsed.segments.length} segments`);
    return res.json(parsed);
  } catch (err) {
    console.error('[Parse Chapter Error]:', err.message);
    try {
      await pool.query(
        "UPDATE chapters SET status = 'failed', updated_at = now() WHERE id = $1",
        [chapter_id]
      );
    } catch (_dbErr) {}
    return res.status(500).json({ error: 'Failed to parse chapter.', detail: err.message });
  }
});

/**
 * 5. POST /api/synthesize/:chapter_id
 * Synthesizes segment audio via Edge TTS (Kokoro fallback), stitches PCM/MP3, updates MongoDB manifest & PostgreSQL chapters/jobs.
 */
router.post('/synthesize/:chapter_id', authenticateUser, async (req, res) => {
  const { chapter_id } = req.params;

  if (!chapter_id || !UUID_REGEX.test(chapter_id)) {
    return res.status(400).json({ error: 'Invalid chapter UUID format.' });
  }

  if (req.user && req.user.role === 'reader') {
    return res.status(403).json({ error: "Forbidden: role 'reader' cannot synthesize chapters." });
  }

  try {
    const chapterDoc = await Chapter.findOne({ pg_chapter_id: chapter_id });
    if (!chapterDoc) {
      return res.status(404).json({ detail: 'Chapter not found in document store.' });
    }

    if (!chapterDoc.segments || chapterDoc.segments.length === 0) {
      return res.status(400).json({ detail: 'Chapter not yet parsed. Call /parse first.' });
    }

    // Mark as synthesizing in PostgreSQL
    try {
      await pool.query(
        "UPDATE chapters SET status = 'synthesizing', updated_at = now() WHERE id = $1",
        [chapter_id]
      );
      await pool.query(
        `UPDATE synthesis_jobs SET status = 'processing'
         WHERE id IN (SELECT job_id FROM chapter_synthesis_job_targets WHERE chapter_id = $1)`,
        [chapter_id]
      );
    } catch (_dbErr) {}

    const total = chapterDoc.segments.length;
    const segmentAudios = [];

    const activeAssignments = voiceProfiler.getAllAssignments();

    for (let i = 0; i < total; i++) {
      const seg = chapterDoc.segments[i];
      const effectiveVoiceId = activeAssignments[seg.character_id] || seg.voice_id;

      broadcastProgress(chapter_id, {
        chapter_id,
        current_segment: i + 1,
        total_segments: total,
        percent_complete: Math.round(((i + 1) / total) * 90),
        status: 'synthesizing',
      });

      const result = await ttsEngine.synthesizeSegment(
        seg.text,
        effectiveVoiceId
      );

      const rawBuf = result.audio_buffer || result.pcm_buffer;
      const fmt = result.format || 'mp3';
      const validation = validateAudioBuffer(rawBuf, fmt);
      const isValidBuf = typeof validation === 'object' && validation !== null ? validation.valid : Boolean(validation);
      if (!isValidBuf) {
        throw new Error(`Invalid synthesized audio buffer for segment ${i + 1}`);
      }

      segmentAudios.push({
        segment_id: seg.order,
        order: seg.order,
        text: seg.text,
        voice_id: effectiveVoiceId,
        speaker_name: seg.speaker_name || seg.character_id,
        character_id: seg.character_id,
        audio_buffer: result.audio_buffer || result.pcm_buffer,
        pcm_buffer: result.pcm_buffer || result.audio_buffer,
        duration_ms: result.duration_ms,
        format: result.format || 'mp3',
        engine: result.engine || 'msedge-tts',
      });
    }

    broadcastProgress(chapter_id, {
      chapter_id,
      current_segment: total,
      total_segments: total,
      percent_complete: 95,
      status: 'stitching',
    });

    const manifest = audioStitcher.stitch(segmentAudios, chapter_id);

    // Save manifest in MongoDB
    chapterDoc.manifest = {
      total_duration_ms: manifest.total_duration_ms,
      audio_url: manifest.audio_url || `${chapter_id}.${manifest.audio_format || 'mp3'}`,
      timeline: manifest.timeline.map((t) => ({
        order: t.order || 0,
        segment_id: t.segment_id || t.order || 0,
        start_ms: t.start_ms,
        end_ms: t.end_ms,
        character_id: t.character_id || t.speaker_name,
        voice_id: t.voice_id,
        text: t.text || '',
      })),
    };
    await chapterDoc.save();

    const swiftAudioObject = `${chapter_id}.${manifest.audio_format || 'mp3'}`;
    const audioFilePath = path.join(config.paths.outputDir, swiftAudioObject);

    // Optional non-blocking upload of synthesized audio to OpenStack Swift
    try {
      if (getSwiftAuth && fs.existsSync(audioFilePath)) {
        const { token, storageUrl } = await getSwiftAuth();
        if (token && storageUrl) {
          const audioData = fs.readFileSync(audioFilePath);
          const axios = require('axios');
          await axios.put(
            `${storageUrl}/${config.swift.containerAudio}/${swiftAudioObject}`,
            audioData,
            {
              headers: {
                'X-Auth-Token': token,
                'Content-Type': swiftAudioObject.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav',
              },
              timeout: 5000,
            }
          );
        }
      }
    } catch (swiftErr) {
      console.warn('[Synthesize Swift Upload Warning]: Swift offline or upload failed, continuing locally:', swiftErr.message);
    }

    // Update PostgreSQL chapters table
    await pool.query(
      `
      UPDATE chapters 
      SET status = 'completed', total_duration_ms = $1, swift_audio_object = $2, updated_at = now() 
      WHERE id = $3;
    `,
      [manifest.total_duration_ms, swiftAudioObject, chapter_id]
    );

    // Update PostgreSQL synthesis_jobs queue via target relation
    await pool.query(
      `
      UPDATE synthesis_jobs 
      SET status = 'completed', progress_pct = 1.0, completed_at = now() 
      WHERE id IN (
        SELECT job_id FROM chapter_synthesis_job_targets WHERE chapter_id = $1
      );
    `,
      [chapter_id]
    );

    const chapterDir = path.join(config.paths.chaptersDir, chapter_id);
    if (!fs.existsSync(chapterDir)) fs.mkdirSync(chapterDir, { recursive: true });
    fs.writeFileSync(path.join(chapterDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

    broadcastProgress(chapter_id, {
      chapter_id,
      current_segment: total,
      total_segments: total,
      percent_complete: 100,
      status: 'complete',
    });

    console.log(`[Chapters] Synthesized ${chapter_id} (${manifest.total_duration_ms}ms, format: ${manifest.audio_format})`);
    manifest.audio_stream_url = manifest.audio_url || manifest.audio_stream_url || '';
    return res.json(manifest);
  } catch (err) {
    console.error('[Synthesize Chapter Error]:', err.message);
    try {
      await pool.query(
        "UPDATE chapters SET status = 'failed', updated_at = now() WHERE id = $1",
        [chapter_id]
      );
      await pool.query(
        `UPDATE synthesis_jobs SET status = 'failed', error_message = $1, completed_at = now()
         WHERE id IN (SELECT job_id FROM chapter_synthesis_job_targets WHERE chapter_id = $2)`,
        [err.message || 'Synthesis failed', chapter_id]
      );
    } catch (_dbErr) {}
    broadcastProgress(chapter_id, {
      chapter_id,
      status: 'failed',
      error: err.message,
    });
    return res.status(500).json({ error: 'Failed to synthesize chapter.', detail: err.message });
  }
});

/**
 * 6. GET /api/stream/:chapter_id
 * Audio stream proxy: supports both Edge TTS MP3 and Kokoro WAV fallback.
 */
router.get('/stream/:chapter_id', (req, res) => {
  const { chapter_id } = req.params;

  // Prevent path traversal
  const cleanId = path.basename(chapter_id);
  if (cleanId !== chapter_id || !/^[0-9a-zA-Z_-]+$/.test(chapter_id)) {
    return res.status(400).json({ detail: 'Invalid chapter ID' });
  }

  const audioPathMp3 = path.join(config.paths.outputDir, `${chapter_id}.mp3`);
  const audioPathWav = path.join(config.paths.outputDir, `${chapter_id}.wav`);
  const isMp3 = fs.existsSync(audioPathMp3);
  const audioPath = isMp3 ? audioPathMp3 : audioPathWav;

  if (!fs.existsSync(audioPath)) {
    return res.status(404).json({ detail: 'Audio file not found' });
  }

  const stat = fs.statSync(audioPath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const contentType = isMp3 ? 'audio/mpeg' : 'audio/wav';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`,
      });
      return res.end();
    }

    const chunksize = end - start + 1;

    const file = fs.createReadStream(audioPath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(audioPath).pipe(res);
  }
});

/**
 * 6a-1. GET /api/chapters/:id/progress/sse
 * Server-Sent Events (SSE) real-time synthesis progress stream fallback.
 */
router.get('/chapters/:id/progress/sse', (req, res) => {
  const { id } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  eventDispatcher.addSseClient(id, res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (_) {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    eventDispatcher.removeSseClient(id, res);
  });
});

/**
 * 6a-2. GET /api/chapters/:id/progress
 * Polling fallback for synthesis progress state.
 */
router.get('/chapters/:id/progress', async (req, res) => {
  const { id } = req.params;
  try {
    const cached = eventDispatcher.getLatest(id);
    if (cached) {
      return res.json(cached);
    }

    if (UUID_REGEX.test(id)) {
      const q = `
        SELECT c.status AS chapter_status,
               j.status AS job_status,
               j.progress_pct,
               j.error_message
        FROM chapters c
        LEFT JOIN chapter_synthesis_job_targets t ON t.chapter_id = c.id
        LEFT JOIN synthesis_jobs j ON j.id = t.job_id
        WHERE c.id = $1
        ORDER BY j.created_at DESC NULLS LAST
        LIMIT 1;
      `;
      const { rows } = await pool.query(q, [id]);
      if (rows.length > 0) {
        const row = rows[0];
        const statusMap = {
          draft: 'idle',
          parsed: 'idle',
          synthesizing: 'synthesizing',
          completed: 'complete',
          failed: 'failed',
        };
        const status = statusMap[row.chapter_status] || 'idle';
        const pct =
          status === 'complete'
            ? 100
            : Math.round(Number(row.progress_pct || 0) * 100);
        return res.json({
          chapter_id: id,
          status,
          percent_complete: pct,
          current_segment: null,
          total_segments: null,
          error: row.error_message || null,
          timestamp: Date.now(),
        });
      }
    }

    return res.json({
      chapter_id: id,
      status: 'idle',
      percent_complete: 0,
      current_segment: null,
      total_segments: null,
      error: null,
      timestamp: Date.now(),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch synthesis progress.' });
  }
});

/**
 * 6b. GET /api/chapters/:id
 * Fetches combined PostgreSQL metadata and MongoDB document details.
 */
router.get('/chapters/:id', async (req, res) => {
  const { id } = req.params;
  try {
    let pgData = {};
    if (UUID_REGEX.test(id)) {
      const pgRes = await pool.query('SELECT * FROM chapters WHERE id = $1', [id]);
      if (pgRes.rows.length > 0) {
        pgData = pgRes.rows[0];
      }
    }
    const chapterDoc = await Chapter.findOne({ pg_chapter_id: id });

    if (Object.keys(pgData).length === 0 && !chapterDoc) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    const docData = chapterDoc ? (chapterDoc.toObject ? chapterDoc.toObject() : chapterDoc) : {};

    return res.json({
      ...pgData,
      ...docData,
      id: pgData.id || docData.pg_chapter_id,
      pg_chapter_id: pgData.id || docData.pg_chapter_id,
    });
  } catch (err) {
    console.error('[Get Chapter Error]:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve chapter details.' });
  }
});

/**
 * 6c. GET /api/chapters/:id/segments
 * Fetches parsed dialogue segments from MongoDB Chapter document.
 */
router.get('/chapters/:id/segments', async (req, res) => {
  const { id } = req.params;
  try {
    const chapterDoc = await Chapter.findOne({ pg_chapter_id: id });
    if (!chapterDoc || !chapterDoc.segments || chapterDoc.segments.length === 0) {
      return res.status(404).json({ error: 'Chapter segments not found or not yet parsed.' });
    }
    return res.json({
      chapter_id: id,
      segments: chapterDoc.segments,
    });
  } catch (err) {
    console.error('[Get Chapter Segments Error]:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve chapter segments.' });
  }
});

/**
 * 7. GET /api/manifest/:chapter_id
 * Reads manifest from MongoDB Chapter document.
 */
router.get('/manifest/:chapter_id', async (req, res) => {
  const { chapter_id } = req.params;

  try {
    const chapterDoc = await Chapter.findOne({ pg_chapter_id: chapter_id });
    if (!chapterDoc) {
      return res.status(404).json({ detail: 'Chapter not found' });
    }

    if (!chapterDoc.manifest || !chapterDoc.manifest.timeline || chapterDoc.manifest.timeline.length === 0) {
      return res.status(400).json({ detail: 'Chapter not yet synthesized. Call /synthesize first.' });
    }

    const manifestObj = chapterDoc.manifest.toObject ? chapterDoc.manifest.toObject() : chapterDoc.manifest;
    manifestObj.audio_stream_url = manifestObj.audio_url || manifestObj.audio_stream_url || '';

    return res.json(manifestObj);
  } catch (err) {
    console.error('[Manifest Error]:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve manifest.' });
  }
});

/**
 * 8. GET /api/characters/:chapter_id
 * Returns characters and segment counts from MongoDB segments array.
 */
router.get('/characters/:chapter_id', async (req, res) => {
  const { chapter_id } = req.params;

  try {
    const chapterDoc = await Chapter.findOne({ pg_chapter_id: chapter_id });
    if (!chapterDoc || !chapterDoc.segments || chapterDoc.segments.length === 0) {
      return res.status(404).json({ detail: 'Chapter not found or not yet parsed.' });
    }

    const charCounts = new Map();
    for (const seg of chapterDoc.segments) {
      if (seg.character_id && seg.character_id !== 'narrator') {
        const prev = charCounts.get(seg.character_id) || {
          name: seg.speaker_name || seg.character_id,
          voice: seg.assigned_voice_id || seg.voice_id,
          count: 0,
        };
        prev.count += 1;
        charCounts.set(seg.character_id, prev);
      }
    }

    const characters = [];
    for (const [cid, val] of charCounts.entries()) {
      characters.push({
        character_id: cid,
        character_name: val.name,
        assigned_voice_id: val.voice,
        segment_count: val.count,
      });
    }

    return res.json({ characters });
  } catch (err) {
    console.error('[Chapter Characters Error]:', err.message);
    return res.status(500).json({ error: 'Failed to fetch characters for chapter.' });
  }
});

module.exports = router;
