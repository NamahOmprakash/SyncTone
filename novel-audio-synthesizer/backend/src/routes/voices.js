const { Router } = require('express');
const { voiceProfiler, VOICE_PALETTE } = require('../engine/voiceProfiler');
const { ttsEngine } = require('../engine/ttsEngine');
const { audioStitcher } = require('../engine/audioStitcher');
const { authenticateUser, requireRole } = require('../middleware/auth');

const router = Router();

// Handler for on-demand segment speech preview
async function handleSpeak(req, res) {
  try {
    const rawText = req.query.text !== undefined ? req.query.text : req.body?.text;
    const voice_id = (req.query.voice_id || req.body?.voice_id || 'en-GB-RyanNeural').toString().trim();
    const speed = parseFloat(req.query.speed || req.body?.speed) || 1.0;
    const engine = req.query.engine || req.body?.engine || 'auto';

    const cleanText = String(rawText !== undefined && rawText !== null ? rawText : 'Hello, this is a sample preview.').slice(0, 1500);

    const result = await ttsEngine.synthesizeSegment(cleanText, String(voice_id), speed, String(engine));

    res.set('X-TTS-Engine', result.engine || 'msedge-tts');

    if (result.format === 'pcm') {
      const wavHeader = audioStitcher.createWavHeader(result.audio_buffer.length, 24000, 1, 16);
      const fullWav = Buffer.concat([wavHeader, result.audio_buffer]);
      res.set('Content-Type', 'audio/wav');
      res.set('Content-Length', String(fullWav.length));
      return res.send(fullWav);
    }

    if (result.format === 'mp3') {
      res.set('Content-Type', 'audio/mpeg');
      res.set('Content-Length', String(result.audio_buffer.length));
      return res.send(result.audio_buffer);
    }

    res.set('Content-Type', 'audio/wav');
    return res.send(result.audio_buffer);
  } catch (err) {
    console.error('[Voices Speak Error]:', err.message);
    return res.status(500).json({ error: 'Failed to synthesize speech segment' });
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
router.post('/voices/assign', authenticateUser, requireRole('writer', 'admin'), async (req, res) => {

  const { character_id, new_voice_id, chapter_id } = req.body;
  if (!character_id || !new_voice_id) {
    return res.status(400).json({ detail: 'character_id and new_voice_id are required' });
  }

  const { EDGE_TO_KOKORO_MAP } = require('../engine/voiceProfiler');
  const validVoices = new Set([
    ...Object.values(VOICE_PALETTE),
    ...Object.keys(VOICE_PALETTE),
    'am_adam', 'af_heart', 'af_bella', 'af_nicole', 'af_sarah',
    'am_michael', 'am_george', 'bm_george', 'bf_emma', 'bm_daniel',
    'am_onyx', 'af_sky',
  ]);

  if (!validVoices.has(new_voice_id)) {
    return res.status(400).json({
      detail: `Invalid voice ID. Available: ${Array.from(validVoices).join(', ')}`,
    });
  }

  const effectiveVoiceId = VOICE_PALETTE[new_voice_id] || new_voice_id;
  voiceProfiler.assignVoice(character_id, effectiveVoiceId);

  // If chapter_id is provided, update segments in MongoDB
  if (chapter_id) {
    try {
      const { Chapter } = require('../models');
      await Chapter.updateOne(
        {
          pg_chapter_id: chapter_id,
          $or: [
            { 'segments.character_id': character_id },
            { 'segments.speaker_id': character_id },
          ],
        },
        {
          $set: {
            'segments.$[elem].voice_id': effectiveVoiceId,
            'segments.$[elem].assigned_voice_id': effectiveVoiceId,
          },
        },
        {
          arrayFilters: [
            {
              $or: [
                { 'elem.character_id': character_id },
                { 'elem.speaker_id': character_id },
              ],
            },
          ],
        }
      );
    } catch (err) {
      console.warn('[Voices] Could not update chapter doc in Mongo:', err.message);
    }
  }

  // Update PostgreSQL characters if connected (Prisma ORM + pg pool expression match)
  try {
    const { pool, prisma } = require('../db');
    try {
      if (prisma.character) {
        await prisma.character.updateMany({
          where: { canonical_name: character_id },
          data: { voice_id: effectiveVoiceId, updated_at: new Date() },
        }).catch(() => {});
      }
      await pool.query(
        'UPDATE characters SET voice_id = $1, updated_at = now() WHERE id::text = $2 OR canonical_name = $2 OR LOWER(REPLACE(canonical_name, \' \', \'_\')) = LOWER($2)',
        [effectiveVoiceId, character_id]
      );
    } catch (pgErr) {
      if (pgErr.code === '23503') {
        const kokoroFallback = EDGE_TO_KOKORO_MAP[effectiveVoiceId] || 'am_adam';
        await pool.query(
          'UPDATE characters SET voice_id = $1, updated_at = now() WHERE id::text = $2 OR canonical_name = $2 OR LOWER(REPLACE(canonical_name, \' \', \'_\')) = LOWER($2)',
          [kokoroFallback, character_id]
        );
      } else {
        throw pgErr;
      }
    }
  } catch (_err) {
    // Non-fatal if DB not running or character not in PG
  }

  return res.json({
    message: `Voice for '${character_id}' set to '${effectiveVoiceId}'`,
  });
});

module.exports = router;
