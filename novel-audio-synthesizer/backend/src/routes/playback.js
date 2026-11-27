const { Router } = require('express');
const { pool } = require('../db');
const { authenticateUser } = require('../middleware/auth');

const router = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/playback/progress
router.post('/playback/progress', authenticateUser, async (req, res) => {
  let client;
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const { novel_id, chapter_id, segment_order = 0, position_ms = 0 } = body;
    if (
      req.user.role !== 'admin' &&
      body.user_id !== undefined &&
      body.user_id !== null &&
      body.user_id !== '' &&
      body.user_id !== req.user.id
    ) {
      return res.status(403).json({ error: 'Forbidden: cannot modify another user playback progress.' });
    }
    // Derive user identity exclusively from authenticated session (unless admin targeting another user)
    const user_id = req.user.role === 'admin' && body.user_id ? body.user_id : req.user.id;

    if (!user_id || !novel_id || !chapter_id) {
      return res.status(400).json({ error: 'user_id, novel_id, and chapter_id are required' });
    }

    if (
      typeof user_id !== 'string' ||
      typeof novel_id !== 'string' ||
      typeof chapter_id !== 'string' ||
      !UUID_REGEX.test(user_id) ||
      !UUID_REGEX.test(novel_id) ||
      !UUID_REGEX.test(chapter_id)
    ) {
      return res.status(400).json({ error: 'Invalid UUID format for user_id, novel_id, or chapter_id' });
    }

    const parsedSegmentOrder = Number(segment_order);
    const parsedPositionMs = Number(position_ms);
    const MAX_PG_INT = 2147483647;
    if (
      !Number.isInteger(parsedSegmentOrder) ||
      parsedSegmentOrder < 0 ||
      parsedSegmentOrder > MAX_PG_INT ||
      !Number.isInteger(parsedPositionMs) ||
      parsedPositionMs < 0 ||
      parsedPositionMs > MAX_PG_INT
    ) {
      return res.status(400).json({ error: 'segment_order and position_ms must be non-negative 32-bit integers' });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    // 1. Atomic bookmark upsert in playback_history (4NF)
    const historyRes = await client.query(
      `
      INSERT INTO playback_history (user_id, novel_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, novel_id) DO UPDATE SET
        user_id = EXCLUDED.user_id
      RETURNING id, user_id, novel_id, created_at;
    `,
      [user_id, novel_id]
    );
    const historyRow = historyRes.rows[0];

    // 2. Atomic position upsert in playback_positions (4NF)
    const positionRes = await client.query(
      `
      INSERT INTO playback_positions (history_id, chapter_id, segment_order, position_ms, updated_at)
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (history_id) DO UPDATE SET
        chapter_id = EXCLUDED.chapter_id,
        segment_order = EXCLUDED.segment_order,
        position_ms = EXCLUDED.position_ms,
        updated_at = now()
      RETURNING chapter_id, segment_order, position_ms, updated_at;
    `,
      [historyRow.id, chapter_id, parsedSegmentOrder, parsedPositionMs]
    );
    const posRow = positionRes.rows[0];

    await client.query('COMMIT');

    return res.json({
      progress: {
        id: historyRow.id,
        user_id: historyRow.user_id,
        novel_id: historyRow.novel_id,
        chapter_id: posRow.chapter_id,
        segment_order: posRow.segment_order,
        position_ms: posRow.position_ms,
        updated_at: posRow.updated_at,
      },
    });
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }
    if (err.code === '23503' || err.code === '23514' || err.code === 'P0001') {
      return res.status(400).json({ error: err.message || 'Invalid playback reference' });
    }
    console.error('[Playback] Error updating progress:', err.message);
    return res.status(500).json({ error: 'Failed to update playback progress' });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// GET /api/playback/progress
router.get('/playback/progress', authenticateUser, async (req, res) => {
  try {
    const novel_id = req.query.novel_id;
    if (
      req.user.role !== 'admin' &&
      req.query.user_id !== undefined &&
      req.query.user_id !== null &&
      req.query.user_id !== '' &&
      req.query.user_id !== req.user.id
    ) {
      return res.status(403).json({ error: 'Forbidden: cannot read another user playback progress.' });
    }
    const user_id = req.user.role === 'admin' && req.query.user_id ? req.query.user_id : req.user.id;

    if (!user_id || !novel_id) {
      return res.status(400).json({ error: 'user_id and novel_id query parameters are required' });
    }

    if (!UUID_REGEX.test(user_id) || !UUID_REGEX.test(novel_id)) {
      return res.status(400).json({ error: 'Invalid UUID format for user_id or novel_id' });
    }

    const result = await pool.query(
      'SELECT * FROM v_playback_history WHERE user_id = $1 AND novel_id = $2',
      [user_id, novel_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No playback history found' });
    }

    return res.json({ progress: result.rows[0] });
  } catch (err) {
    console.error('[Playback] Error retrieving progress:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve playback progress' });
  }
});

module.exports = router;
