const { Router } = require('express');
const { voiceProfiler, VOICE_PALETTE } = require('../engine/voiceProfiler');
const { ttsEngine, VALID_KOKORO_VOICES } = require('../engine/ttsEngine');
const { audioStitcher } = require('../engine/audioStitcher');
const { optionalAuth } = require('../middleware/auth');

const router = Router();

// In-memory cache for on-demand speech segments (speeds up replay and eliminates redundant Edge TTS calls)
const speakCache = new Map();
const MAX_CACHE_ENTRIES = 250;

// In-memory cache for chapter-level cast plans (paradee-mixed mode)
const castPlanCache = new Map();
const MAX_CAST_PLAN_CACHE_ENTRIES = 50;

/**
 * Invalidate cached cast plans and on-demand speech clips when character voices or chapters change.
 */
function clearVoiceCaches({ chapterId, novelId, characterId, speakerName, canonicalName, clearAll = false } = {}) {
  if (clearAll || (!chapterId && !novelId && !characterId && !speakerName && !canonicalName)) {
    castPlanCache.clear();
    speakCache.clear();
    return;
  }

  for (const k of castPlanCache.keys()) {
    if (clearAll || (chapterId && k.includes(String(chapterId))) || (novelId && k.includes(String(novelId)))) {
      castPlanCache.delete(k);
    }
  }

  const tokens = new Set();
  for (const val of [characterId, speakerName, canonicalName]) {
    const raw = String(val || '').trim().toLowerCase();
    if (!raw) continue;
    tokens.add(raw);
    tokens.add(raw.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''));
  }

  if (tokens.size === 0 || (chapterId && !characterId)) {
    speakCache.clear();
    return;
  }

  for (const cacheKey of speakCache.keys()) {
    const lowerKey = cacheKey.toLowerCase();
    for (const tok of tokens) {
      if (tok && lowerKey.includes(`:${tok}:`)) {
        speakCache.delete(cacheKey);
        break;
      }
    }
  }
}

/**
 * Builds or looks up a cached chapter-level cast plan for paradee-mixed mode
 */
async function getOrBuildCastPlan(novelId, chapterId) {
  const planKey = `${novelId || ''}:${chapterId || ''}`;
  if (planKey !== ':' && castPlanCache.has(planKey)) {
    return castPlanCache.get(planKey);
  }

  if (!novelId && !chapterId) {
    return null;
  }

  try {
    const { Chapter } = require('../models');
    let chapterDoc = null;
    if (chapterId) {
      chapterDoc = await Chapter.findOne({
        $or: [{ pg_chapter_id: chapterId }, { _id: chapterId }],
      }).catch(() => null);
    } else if (novelId) {
      chapterDoc = await Chapter.findOne({ novel_id: novelId }).catch(() => null);
    }

    if (!chapterDoc || !chapterDoc.segments || chapterDoc.segments.length === 0) {
      return null;
    }

    const effectiveNovelId = novelId || chapterDoc.novel_id;
    let novelCharacters = [];
    if (effectiveNovelId) {
      try {
        const { pool } = require('../db');
        const charRes = await pool.query(
          'SELECT id, novel_id, canonical_name AS name, canonical_name, gender, voice_id, is_narrator FROM characters WHERE novel_id = $1',
          [effectiveNovelId]
        );
        if (charRes?.rows?.length > 0) {
          novelCharacters = charRes.rows;
        }
      } catch (_) {}
    }

    const { buildMixedCastPlan } = require('../engine/mixedVoiceRouter');
    const castPlan = buildMixedCastPlan(chapterDoc.segments, novelCharacters);

    if (planKey !== ':') {
      if (castPlanCache.size >= MAX_CAST_PLAN_CACHE_ENTRIES) {
        const oldestKey = castPlanCache.keys().next().value;
        castPlanCache.delete(oldestKey);
      }
      castPlanCache.set(planKey, castPlan);
    }

    return castPlan;
  } catch (err) {
    console.warn('[Voices] Could not build or lookup cast plan:', err.message);
    return null;
  }
}

/**
 * Sends audio buffer with support for HTTP Range requests (crucial for Chrome audio streaming)
 */
function sendAudioBuffer(req, res, buffer, mimeType, engine, voice) {
  if (res.writableEnded || res.destroyed) {
    return;
  }

  res.set({
    'X-TTS-Engine': engine,
    'X-TTS-Voice': String(voice || ''),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=86400',
  });

  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : buffer.length - 1;

    if (isNaN(start) || start >= buffer.length || end < start) {
      res.status(416).set('Content-Range', `bytes */${buffer.length}`);
      return res.end();
    }

    const chunk = buffer.slice(start, end + 1);
    res.status(206).set({
      'Content-Range': `bytes ${start}-${end}/${buffer.length}`,
      'Content-Length': String(chunk.length),
      'Content-Type': mimeType,
    });
    return res.send(chunk);
  }

  res.status(200).set({
    'Content-Type': mimeType,
    'Content-Length': String(buffer.length),
  });
  return res.send(buffer);
}

// Handler for on-demand segment speech preview
async function handleSpeak(req, res) {
  let clientDisconnected = false;
  res.on('close', () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
    }
  });

  try {
    const rawText = req.query.text !== undefined ? req.query.text : req.body?.text;
    const voice_id = (req.query.voice_id || req.body?.voice_id || 'en-GB-RyanNeural').toString().trim();
    const speed = parseFloat(req.query.speed || req.body?.speed) || 1.0;
    const engine = (req.query.engine || req.body?.engine || 'auto').toString().trim();
    const characterId = (req.query.character_id || req.body?.character_id || '').toString().trim();
    const speakerName = (req.query.speaker_name || req.body?.speaker_name || '').toString().trim();
    const castSlot = req.query.cast_slot ?? req.body?.cast_slot ?? null;
    const isNarrator = req.query.is_narrator === 'true' || req.body?.is_narrator === true || characterId.toLowerCase() === 'narrator';
    const gender = (req.query.gender || req.body?.gender || '').toString().trim();
    const novel_id = (req.query.novel_id || req.body?.novel_id || '').toString().trim();
    const chapter_id = (req.query.chapter_id || req.body?.chapter_id || '').toString().trim();

    // Strip image markers and normalize text
    let cleanText = String(rawText !== undefined && rawText !== null ? rawText : 'Hello, this is a sample preview.');
    cleanText = cleanText.replace(/\[IMAGE:[^\]]+\]/gi, '').trim().slice(0, 1500);

    if (!cleanText) {
      cleanText = ' ';
    }

    const cacheKey = `${engine}:${voice_id}:${characterId}:${speakerName}:${isNarrator}:${castSlot ?? ''}:${speed}:${cleanText}`;
    if (speakCache.has(cacheKey)) {
      if (clientDisconnected || res.writableEnded || res.destroyed) {
        return;
      }
      const cached = speakCache.get(cacheKey);
      return sendAudioBuffer(req, res, cached.buffer, cached.mimeType, cached.engine, cached.voice);
    }

    // Build or lookup chapter cast plan for paradee-mixed if novel_id or chapter_id provided
    let castPlan = null;
    if (String(engine).toLowerCase() === 'paradee-mixed' && (chapter_id || novel_id)) {
      castPlan = await getOrBuildCastPlan(novel_id, chapter_id);
    }

    if (clientDisconnected || res.writableEnded || res.destroyed) {
      return;
    }

    const explicitVoice = req.query.explicit_voice === 'true' || req.body?.explicit_voice === true;
    const result = await ttsEngine.synthesizeSegment(cleanText, String(voice_id), speed, String(engine), {
      characterId,
      speakerName,
      castSlot,
      isNarrator,
      gender,
      castPlan,
      explicitVoice,
      novelId: novel_id,
      chapterId: chapter_id,
    });

    if (clientDisconnected || res.writableEnded || res.destroyed) {
      return;
    }

    let finalBuffer = result.audio_buffer;
    let mimeType = result.format === 'mp3' ? 'audio/mpeg' : 'audio/wav';

    if (result.format === 'pcm') {
      const wavHeader = audioStitcher.createWavHeader(result.audio_buffer.length, 24000, 1, 16);
      finalBuffer = Buffer.concat([wavHeader, result.audio_buffer]);
      mimeType = 'audio/wav';
    }

    const resolvedVoice = result.resolved_voice_id || result.voice_id || voice_id;

    if (speakCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = speakCache.keys().next().value;
      speakCache.delete(oldestKey);
    }
    speakCache.set(cacheKey, {
      buffer: finalBuffer,
      mimeType,
      engine: result.engine || 'msedge-tts',
      voice: resolvedVoice,
    });

    return sendAudioBuffer(req, res, finalBuffer, mimeType, result.engine || 'msedge-tts', resolvedVoice);
  } catch (err) {
    if (clientDisconnected || res.writableEnded || res.destroyed) {
      return;
    }
    console.error('[Voices Speak Error]:', err.message);
    const status = err.status || (err.message && err.message.includes('unavailable') ? 503 : 500);
    return res.status(status).json({ error: 'Failed to synthesize speech segment', detail: err.message });
  }
}

// GET & POST /api/voices/speak (On-demand preview synthesis)
router.get('/voices/speak', handleSpeak);
router.post('/voices/speak', handleSpeak);

// GET /api/voices
router.get('/voices', (_req, res) => {
  return res.json({
    available_voices: voiceProfiler.getAvailableVoices(),
    current_assignments: voiceProfiler.getAllAssignments(),
  });
});

// POST /api/voices/assign
router.post('/voices/assign', optionalAuth, async (req, res) => {

  const { character_id, new_voice_id: rawNewVoiceId, voice_id: rawVoiceId, chapter_id, novel_id } = req.body;
  const new_voice_id = rawNewVoiceId || rawVoiceId;
  if (!character_id || !new_voice_id) {
    return res.status(400).json({ detail: 'character_id and new_voice_id are required' });
  }

  const { EDGE_TO_KOKORO_MAP } = require('../engine/voiceProfiler');
  const validVoices = new Set([
    ...Object.values(VOICE_PALETTE),
    ...Object.keys(VOICE_PALETTE),
    ...VALID_KOKORO_VOICES,
    'bm_fable', 'bf_isabella', 'am_puck',
    'mac_daniel', 'mac_serena', 'mac_reed', 'mac_rocko',
    'mac_shelley', 'mac_grandpa', 'mac_flo', 'mac_moira',
    'mac_rishi', 'mac_karen', 'mac_tessa', 'mac_samantha',
    'mac_fred', 'mac_eddy', 'mac_sandy',
  ]);
  const isEdgeNeuralVoice = /^en-[A-Z]{2}-[A-Za-z0-9]+(?:Multilingual)?Neural$/.test(String(new_voice_id));

  if (!validVoices.has(new_voice_id) && !isEdgeNeuralVoice) {
    return res.status(400).json({
      detail: `Invalid voice ID. Available: ${Array.from(validVoices).join(', ')}`,
    });
  }

  const effectiveVoiceId = VOICE_PALETTE[new_voice_id] || new_voice_id;
  voiceProfiler.assignVoice(character_id, effectiveVoiceId);

  // Resolve character aliases (UUID <-> canonical_name <-> slug) for thorough MongoDB & cache invalidation
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(character_id));
  let canonicalName = null;
  let pgCharUuid = isUuid ? String(character_id) : null;
  let targetNovelId = novel_id || null;

  try {
    const { pool } = require('../db');
    if (!targetNovelId && chapter_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(chapter_id))) {
      const chRow = await pool.query('SELECT novel_id FROM chapters WHERE id = $1', [chapter_id]);
      if (chRow.rows.length > 0) {
        targetNovelId = chRow.rows[0].novel_id;
      }
    }
    const pgCharMatchSql =
      "(LOWER(canonical_name) = LOWER($2) OR TRIM(BOTH '_' FROM REGEXP_REPLACE(LOWER(canonical_name), '[^a-z0-9]+', '_', 'g')) = LOWER($2))";

    if (isUuid) {
      const charRow = await pool.query('SELECT id, canonical_name, novel_id FROM characters WHERE id = $1::uuid', [character_id]);
      if (charRow.rows.length > 0) {
        canonicalName = charRow.rows[0].canonical_name;
        if (!targetNovelId) targetNovelId = charRow.rows[0].novel_id;
      }
    } else if (targetNovelId) {
      const charRow = await pool.query(
        `SELECT id, canonical_name FROM characters WHERE novel_id = $1 AND ${pgCharMatchSql} LIMIT 1`,
        [targetNovelId, character_id]
      );
      if (charRow.rows.length > 0) {
        pgCharUuid = charRow.rows[0].id;
        canonicalName = charRow.rows[0].canonical_name;
      }
    }
  } catch (_) {
    // Non-fatal if PG is offline
  }

  if (canonicalName) {
    const slug = canonicalName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (slug && slug !== character_id) {
      voiceProfiler.assignVoice(slug, effectiveVoiceId);
    }
    voiceProfiler.assignVoice(canonicalName, effectiveVoiceId);
  }

  // Invalidate cached cast plans & preview speech cache for affected character/chapter/novel
  clearVoiceCaches({
    chapterId: chapter_id,
    novelId: targetNovelId || novel_id,
    characterId: character_id,
    canonicalName,
  });

  // Update segments AND manifest.timeline in MongoDB
  const mongoScopeFilter = chapter_id
    ? { pg_chapter_id: chapter_id }
    : targetNovelId
      ? { $or: [{ novel_id: targetNovelId }, { pg_novel_id: targetNovelId }] }
      : null;

  if (mongoScopeFilter) {
    try {
      const { Chapter } = require('../models');
      const matchIdSet = new Set([String(character_id)]);
      if (pgCharUuid) matchIdSet.add(pgCharUuid);
      if (canonicalName) {
        matchIdSet.add(canonicalName);
        const slug = canonicalName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        if (slug) matchIdSet.add(slug);
      }
      const matchIds = Array.from(matchIdSet);

      await Chapter.updateMany(
        mongoScopeFilter,
        {
          $set: {
            'segments.$[segElem].voice_id': effectiveVoiceId,
            'segments.$[segElem].assigned_voice_id': effectiveVoiceId,
          },
        },
        {
          arrayFilters: [
            {
              $or: [
                { 'segElem.character_id': { $in: matchIds } },
                { 'segElem.speaker_id': { $in: matchIds } },
                { 'segElem.speaker_name': { $in: matchIds } },
              ],
            },
          ],
        }
      );

      await Chapter.updateMany(
        {
          ...mongoScopeFilter,
          'manifest.timeline': { $exists: true, $ne: [] },
        },
        {
          $set: {
            'manifest.timeline.$[tlElem].voice_id': effectiveVoiceId,
          },
        },
        {
          arrayFilters: [
            {
              'tlElem.character_id': { $in: matchIds },
            },
          ],
        }
      );
    } catch (err) {
      console.warn('[Voices] Could not update chapter doc in Mongo:', err.message);
    }
  }

  // Update PostgreSQL characters if connected (scoped by UUID or novel_id to prevent cross-novel corruption)
  try {
    const { pool } = require('../db');

    const pgSlugMatchSql =
      "(LOWER(canonical_name) = LOWER($2) OR TRIM(BOTH '_' FROM REGEXP_REPLACE(LOWER(canonical_name), '[^a-z0-9]+', '_', 'g')) = LOWER($2))";

    const runPgUpdate = async (voiceToSet) => {
      if (isUuid) {
        await pool.query(
          'UPDATE characters SET voice_id = $1, updated_at = now() WHERE id = $2::uuid',
          [voiceToSet, character_id]
        );
      } else if (targetNovelId) {
        await pool.query(
          `UPDATE characters SET voice_id = $1, updated_at = now() WHERE novel_id = $3 AND ${pgSlugMatchSql}`,
          [voiceToSet, character_id, targetNovelId]
        );
      } else {
        await pool.query(
          `UPDATE characters SET voice_id = $1, updated_at = now() WHERE ${pgSlugMatchSql}`,
          [voiceToSet, character_id]
        );
      }
    };

    try {
      await runPgUpdate(effectiveVoiceId);
    } catch (pgErr) {
      if (pgErr.code === '23503') {
        try {
          await pool.query(
            `INSERT INTO voices (id, label, gender, age_band, language, reserved_narrator)
             VALUES ($1, $2, 'other', 'adult', 'en-us', false)
             ON CONFLICT (id) DO NOTHING`,
            [effectiveVoiceId, effectiveVoiceId]
          );
          await runPgUpdate(effectiveVoiceId);
        } catch (_retryErr) {
          const kokoroFallback = EDGE_TO_KOKORO_MAP[effectiveVoiceId] || 'am_adam';
          await runPgUpdate(kokoroFallback);
        }
      } else {
        throw pgErr;
      }
    }
  } catch (_err) {
    // Non-fatal if DB not running or character not in PG
  }

  return res.json({
    ok: true,
    character_id,
    voice_id: effectiveVoiceId,
    message: `Voice for '${character_id}' set to '${effectiveVoiceId}'`,
  });
});

router.clearVoiceCaches = clearVoiceCaches;

module.exports = router;
