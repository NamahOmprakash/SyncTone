/**
 * Synthesis Queue Reuse, Concurrency Protection & Stale-Lock Recovery Regression Suite (Task 3)
 */

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const { createApp } = require('./src/app');
const { pool, connectPostgres, connectMongo } = require('./src/db');
const { Chapter } = require('./src/models');
const { config } = require('./src/config');

async function runTests() {
  await connectPostgres();
  await connectMongo();

  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const ts = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  let writerId = null;
  let novelId = null;
  const createdChapterIds = [];

  try {
    console.log('\n▶ [Task 3] Testing /synthesize Job Reuse, Concurrency Guard & Stale Recovery...');

    const userRes = await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, crypt('TestPass2026!', gen_salt('bf')), 'writer')
       RETURNING id, email`,
      [`synth_pipe_${ts}`, `synth_pipe_${ts}@example.com`]
    );
    writerId = userRes.rows[0].id;

    const loginRes = await axios.post(`${baseUrl}/auth/login`, {
      email: userRes.rows[0].email,
      password: 'TestPass2026!',
    });
    const cookie = loginRes.headers['set-cookie'].find((c) => c.includes('token=')).split(';')[0];

    novelId = uuidv4();
    await pool.query(
      `INSERT INTO novels (id, title, synopsis, channel, added_by, status)
       VALUES ($1, $2, 'Queue pipeline test novel', 'community', $3, 'draft')`,
      [novelId, `Pipeline Novel ${ts}`, writerId]
    );

    // 1. Ingest chapter -> inserts 1 queued synthesize_chapter job
    const ingestRes = await axios.post(
      `${baseUrl}/novels/${novelId}/chapters`,
      {
        title: 'Chapter 1: Queue Reuse',
        text: 'London lay quiet under the mist. "Proceed carefully," said Holmes.',
      },
      { headers: { Cookie: cookie } }
    );
    assert.strictEqual(ingestRes.status, 201);
    const chapterId = ingestRes.data.chapter_id;
    const ingestedJobId = ingestRes.data.job.id;
    createdChapterIds.push(chapterId);

    // 2. Call POST /api/synthesize/:id and verify it REUSES ingestedJobId (no duplicate jobs!)
    const synthRes = await axios.post(
      `${baseUrl}/synthesize/${chapterId}`,
      { engine: 'machine-tts' },
      { headers: { Cookie: cookie } }
    );
    assert.strictEqual(synthRes.status, 200, `Expected 200 from /synthesize, got ${synthRes.status}`);
    assert.ok(synthRes.data.total_duration_ms > 0);

    const jobsAfterSynth = await pool.query(
      `SELECT j.id, j.status, j.progress_pct, j.worker_id, j.locked_at, j.completed_at
       FROM synthesis_jobs j
       JOIN chapter_synthesis_job_targets t ON t.job_id = j.id
       WHERE t.chapter_id = $1`,
      [chapterId]
    );
    assert.strictEqual(
      jobsAfterSynth.rows.length,
      1,
      `Expected /synthesize to reuse the single ingestChapter job, found ${jobsAfterSynth.rows.length} jobs`
    );
    const jobRow = jobsAfterSynth.rows[0];
    assert.strictEqual(jobRow.id, ingestedJobId, 'Must reuse exact ingested job ID');
    assert.strictEqual(jobRow.status, 'completed');
    assert.strictEqual(Number(jobRow.progress_pct), 100, `progress_pct must be 100, got ${jobRow.progress_pct}`);
    assert.strictEqual(jobRow.locked_at, null, 'locked_at must be cleared upon completion');
    assert.strictEqual(jobRow.worker_id, null, 'worker_id must be cleared upon completion');

    // Verify persisted audio file exists & streams via /api/stream/:id
    const streamRes = await fetch(`${baseUrl}/stream/${chapterId}`);
    assert.strictEqual(streamRes.status, 200);
    const audioBytes = Buffer.from(await streamRes.arrayBuffer());
    assert.ok(audioBytes.length > 512, `Expected real audio > 512 bytes, got ${audioBytes.length}`);

    // 3. Concurrency protection: active external worker lock -> /synthesize returns 409 and does NOT duplicate work
    const activeJobId = uuidv4();
    const txClient = await pool.connect();
    try {
      await txClient.query('BEGIN');
      await txClient.query(
        `INSERT INTO synthesis_jobs (id, requested_by, job_type, status, progress_pct, attempts, worker_id, locked_at)
         VALUES ($1, $2, 'synthesize_chapter', 'processing', 25.0, 1, 'synctone-worker-1', now())`,
        [activeJobId, writerId]
      );
      await txClient.query(
        `INSERT INTO chapter_synthesis_job_targets (job_id, chapter_id) VALUES ($1, $2)`,
        [activeJobId, chapterId]
      );
      await txClient.query('COMMIT');
    } finally {
      txClient.release();
    }

    const concurrentRes = await axios.post(
      `${baseUrl}/synthesize/${chapterId}`,
      { engine: 'machine-tts' },
      { headers: { Cookie: cookie }, validateStatus: () => true }
    );
    assert.strictEqual(
      concurrentRes.status,
      409,
      `Active external worker lock must prevent duplicate synthesis with 409, got ${concurrentRes.status}`
    );

    // 4. Stale lock recovery: expired lock (>300s) is reclaimed & completed cleanly
    await pool.query(
      `UPDATE synthesis_jobs SET locked_at = now() - interval '600 seconds' WHERE id = $1`,
      [activeJobId]
    );
    const reclaimedRes = await axios.post(
      `${baseUrl}/synthesize/${chapterId}`,
      { engine: 'machine-tts' },
      { headers: { Cookie: cookie }, validateStatus: () => true }
    );
    assert.strictEqual(
      reclaimedRes.status,
      200,
      `Stale lock must be reclaimed cleanly, got ${reclaimedRes.status}`
    );
    const afterReclaim = await pool.query('SELECT status, locked_at, worker_id FROM synthesis_jobs WHERE id = $1', [
      activeJobId,
    ]);
    assert.strictEqual(afterReclaim.rows[0].status, 'completed');
    assert.strictEqual(afterReclaim.rows[0].locked_at, null);

    // 5. Async queue mode (?async=true): enqueues/reuses queued job cleanly with 202 for Python worker
    const asyncRes = await axios.post(
      `${baseUrl}/synthesize/${chapterId}?async=true`,
      {},
      { headers: { Cookie: cookie }, validateStatus: () => true }
    );
    assert.strictEqual(asyncRes.status, 202, `Expected 202 Accepted for async mode, got ${asyncRes.status}`);
    assert.strictEqual(asyncRes.data.job.status, 'queued');
    // Calling async=true again while already queued MUST reuse the same queued job (no duplicate!)
    const asyncDupRes = await axios.post(
      `${baseUrl}/synthesize/${chapterId}?async=true`,
      {},
      { headers: { Cookie: cookie }, validateStatus: () => true }
    );
    assert.strictEqual(asyncDupRes.status, 202);
    assert.strictEqual(asyncDupRes.data.job.id, asyncRes.data.job.id, 'Repeated async requests must reuse same queued job');

    console.log('  ✔ Task 3 queue reuse, concurrency guard, and stale-lock recovery checks passed!');
  } finally {
    if (novelId) {
      await Chapter.deleteMany({ novel_id: novelId }).catch(() => {});
      await pool.query('DELETE FROM novels WHERE id = $1', [novelId]).catch(() => {});
    }
    if (writerId) {
      await pool.query('DELETE FROM users WHERE id = $1', [writerId]).catch(() => {});
    }
    for (const cid of createdChapterIds) {
      for (const ext of ['mp3', 'wav', 'opus']) {
        fs.rmSync(path.join(config.paths.outputDir, `${cid}.${ext}`), { force: true });
      }
      fs.rmSync(path.join(config.paths.chaptersDir, cid), { recursive: true, force: true });
    }
    server.close();
    await pool.end();
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error('❌ SYNTHESIS PIPELINE TEST FAILED:', err);
  process.exit(1);
});
