/**
 * SyncTone — Comprehensive Backend Stress, Concurrency & Edge-Case Audit Suite
 */

'use strict';

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');
const WebSocket = require('ws');
const { createApp } = require('./src/app');
const { setupWebSocketServer } = require('./src/websocket');
const { pool, connectMongo, connectPostgres, ensureAuthSchemaTables } = require('./src/db');
const { Chapter } = require('./src/models');
const { config } = require('./src/config');
const { audioStitcher } = require('./src/engine/audioStitcher');
const { ttsEngine } = require('./src/engine/ttsEngine');
const { eventDispatcher } = require('./src/engine/eventDispatcher');
const { parseByteRange } = require('./src/services/storageService');

async function runStressAudit() {
  console.log('================================================================');
  console.log('🔥 SYNCTONE BACKEND STRESS, CONCURRENCY & EDGE-CASE AUDIT');
  console.log('================================================================\n');

  await connectPostgres();
  await connectMongo();

  const app = createApp();
  const server = http.createServer(app);
  const wss = setupWebSocketServer(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseHttp = `http://127.0.0.1:${port}`;
  const baseApi = `${baseHttp}/api`;
  const baseWs = `ws://127.0.0.1:${port}`;

  const cleanup = {
    writerId: null,
    novelId: null,
    chapterId: null,
    audioFiles: [],
    chapterDirs: [],
  };

  try {
    // 1. Static covers serving (/static/covers & /covers) + path traversal guard
    console.log('▶ [1/6] Auditing /static/covers & /covers serving + path traversal...');
    const publicCoversDir = path.resolve(__dirname, '../frontend/public/covers');
    const coverFiles = fs
      .readdirSync(publicCoversDir)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    assert.ok(coverFiles.length > 0, 'Expected cover files in frontend/public/covers');

    for (const file of coverFiles) {
      const [r1, r2] = await Promise.all([
        fetch(`${baseHttp}/static/covers/${encodeURIComponent(file)}`),
        fetch(`${baseHttp}/covers/${encodeURIComponent(file)}`),
      ]);
      assert.strictEqual(r1.status, 200, `/static/covers/${file} returned ${r1.status}`);
      assert.strictEqual(r2.status, 200, `/covers/${file} returned ${r2.status}`);
      await r1.arrayBuffer();
      await r2.arrayBuffer();
    }

    const traversalRes = await fetch(`${baseHttp}/static/covers/..%2Fpackage.json`);
    assert.notStrictEqual(traversalRes.status, 200, 'Path traversal must never serve package.json');
    console.log(`  ✔ All ${coverFiles.length} covers return 200 on /static/covers and /covers; traversal blocked (${traversalRes.status})\n`);

    // 2. Concurrent HTTP read burst (500 requests across health, novels, voices, covers)
    console.log('▶ [2/6] Running 500-request concurrent HTTP burst across read endpoints...');
    const burstUrls = [
      `${baseApi}/health`,
      `${baseApi}/novels`,
      `${baseApi}/voices`,
      `${baseHttp}/static/covers/hp1_cover.jpg`,
      `${baseHttp}/covers/hp1_cover.jpg`,
    ];
    const latencies = [];
    let burstErrors = 0;
    const batchSize = 100;
    for (let wave = 0; wave < 5; wave++) {
      await Promise.all(
        Array.from({ length: batchSize }, async (_, idx) => {
          const url = burstUrls[(wave * batchSize + idx) % burstUrls.length];
          const t0 = performance.now();
          const res = await fetch(url);
          await res.arrayBuffer();
          latencies.push(performance.now() - t0);
          if (res.status !== 200) burstErrors++;
        })
      );
    }
    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    assert.strictEqual(burstErrors, 0, `Expected 0 errors in 500-req burst, got ${burstErrors}`);
    console.log(`  ✔ 500 concurrent requests completed: 0 errors, p95=${p95.toFixed(1)}ms, max=${latencies[latencies.length - 1].toFixed(1)}ms\n`);

    // 3. Malformed & edge-case payloads (verify 400/413/416, ZERO 500s)
    console.log('▶ [3/6] Testing malformed & boundary payloads across routes...');
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const regRes = await axios.post(`${baseApi}/auth/register`, {
      username: `stress_writer_${uniqueSuffix}`,
      email: `stress_${uniqueSuffix}@example.com`,
      password: 'StressPassword123!',
      role: 'writer',
    });
    cleanup.writerId = regRes.data.user.id;
    const cookie = regRes.headers['set-cookie'][0].split(';')[0];

    const malformedJsonRes = await fetch(`${baseApi}/novels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: '{"title": "broken',
    });
    assert.strictEqual(malformedJsonRes.status, 400, `Malformed JSON should return 400, got ${malformedJsonRes.status}`);

    const badLoginRes = await fetch(`${baseApi}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: { $ne: '' }, password: 12345 }),
    });
    assert.strictEqual(badLoginRes.status, 400, `Non-string login fields should return 400, got ${badLoginRes.status}`);

    const badPasskeyVerifyRes = await fetch(`${baseApi}/auth/passkey/login-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: { obj: true }, response: 'bad' }),
    });
    assert.strictEqual(badPasskeyVerifyRes.status, 400, `Bad passkey verify should return 400, got ${badPasskeyVerifyRes.status}`);

    const badParseFileRes = await fetch(`${baseApi}/novels/parse-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_base64: 999999 }),
    });
    assert.strictEqual(badParseFileRes.status, 400, `Non-string file_base64 should return 400, got ${badParseFileRes.status}`);

    const badAssetRes = await fetch(`${baseApi}/novels/upload-asset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ data_url: 'data:text/plain;base64,SGVsbG8=' }),
    });
    assert.strictEqual(badAssetRes.status, 400, `Non-image data_url should return 400, got ${badAssetRes.status}`);

    const badPlaybackRes = await fetch(`${baseApi}/playback/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        user_id: cleanup.writerId,
        novel_id: '22222222-2222-4222-a222-222222222222',
        chapter_id: '33333333-3333-4333-a333-333333333333',
        segment_order: 0,
        position_ms: 999999999999,
      }),
    });
    assert.strictEqual(badPlaybackRes.status, 400, `32-bit overflow position_ms should return 400, got ${badPlaybackRes.status}`);

    const badVoiceAssignRes = await fetch(`${baseApi}/voices/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ character_id: { bad: 1 }, new_voice_id: 'en-GB-ThomasNeural' }),
    });
    assert.strictEqual(badVoiceAssignRes.status, 400, `Non-string character_id should return 400, got ${badVoiceAssignRes.status}`);

    const badProgIdRes = await fetch(`${baseApi}/chapters/bad..id/progress`);
    const badSegIdRes = await fetch(`${baseApi}/chapters/bad$id/segments`);
    const badCharIdRes = await fetch(`${baseApi}/characters/bad$id`);
    assert.strictEqual(badProgIdRes.status, 400);
    assert.strictEqual(badSegIdRes.status, 400);
    assert.strictEqual(badCharIdRes.status, 400);

    // Concurrent cold ensureAuthSchemaTables burst
    await Promise.all(Array.from({ length: 10 }, () => ensureAuthSchemaTables(pool)));
    console.log('  ✔ All malformed/boundary inputs returned clean 400s with zero 500s\n');

    // 4. Concurrent /api/voices/speak deduplication + speed clamping + engine edge cases
    console.log('▶ [4/6] Testing concurrent /api/voices/speak burst & engine boundary guards...');
    const speakBurst = await Promise.all(
      Array.from({ length: 15 }, () =>
        fetch(
          `${baseApi}/voices/speak?text=${encodeURIComponent('Burst test line.')}&engine=machine-tts&speed=-10&voice_id=en-GB-ThomasNeural`
        )
      )
    );
    for (const r of speakBurst) {
      assert.strictEqual(r.status, 200, `Speak burst returned ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      assert.ok(buf.length > 44, 'Speak burst audio buffer must be valid WAV');
    }

    const emptyStitch = audioStitcher.stitch([], 'stress_empty_stitch');
    const emptyOutPath = path.join(config.paths.outputDir, 'stress_empty_stitch.mp3');
    cleanup.audioFiles.push(emptyOutPath);
    assert.ok(fs.existsSync(emptyOutPath) && fs.statSync(emptyOutPath).size > 0, 'Empty stitch must not emit 0-byte mp3');
    assert.strictEqual(emptyStitch.audio_format, 'mp3');
    assert.ok(audioStitcher.createMp3SilenceBuffer(NaN).length >= 144);
    assert.doesNotThrow(() => audioStitcher.createWavHeader(NaN));

    const numTextSynth = await ttsEngine.synthesizeSegment(12345, 'en-GB-RyanNeural', -5, 'machine-tts');
    assert.ok(numTextSynth.audio_buffer.length > 0);

    const nanEvt = eventDispatcher.dispatch('stress_nan_test', { percent_complete: NaN, status: 'processing' });
    assert.strictEqual(nanEvt.percent_complete, 0);
    assert.strictEqual(parseByteRange('bytes=0-10', 0).invalid, true);
    console.log('  ✔ Speak burst (15x), speed clamping, empty stitch & engine guards verified\n');

    // 5. Concurrent parse & synthesis races + novels cache invalidation + range streaming
    console.log('▶ [5/6] Testing concurrent parse/synthesis races, cache invalidation & range streaming...');
    const novelRes = await axios.post(
      `${baseApi}/novels`,
      {
        title: `Stress Audit Novel ${uniqueSuffix}`,
        synopsis: 'Stress test fixture',
        channel: 'community',
        added_by: cleanup.writerId,
      },
      { headers: { Cookie: cookie } }
    );
    cleanup.novelId = novelRes.data.novel.id;

    // Warm novels cache, then ingest chapter & confirm cache invalidation
    await axios.get(`${baseApi}/novels?channel=community`);
    const chRes = await axios.post(
      `${baseApi}/novels/${cleanup.novelId}/chapters`,
      {
        title: 'Stress Chapter 1',
        text: '"Testing concurrency," said Holmes. "Indeed," replied Watson.',
      },
      { headers: { Cookie: cookie } }
    );
    cleanup.chapterId = chRes.data.chapter_id;
    cleanup.chapterDirs.push(path.join(config.paths.chaptersDir, cleanup.chapterId));
    cleanup.audioFiles.push(path.join(config.paths.outputDir, `${cleanup.chapterId}.mp3`));
    cleanup.audioFiles.push(path.join(config.paths.outputDir, `${cleanup.chapterId}.wav`));

    const listAfterIngest = await axios.get(`${baseApi}/novels?channel=community`);
    const cachedNovelEntry = listAfterIngest.data.novels.find((n) => n.id === cleanup.novelId);
    assert.ok(cachedNovelEntry && cachedNovelEntry.chapter_count === 1, 'Novels cache must invalidate on chapter ingestion');

    // Oversized title > 255 rejected cleanly with 400
    const overTitleRes = await fetch(`${baseApi}/novels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ title: 'A'.repeat(300), added_by: cleanup.writerId }),
    });
    assert.strictEqual(overTitleRes.status, 400);

    // 5x concurrent POST /api/parse/:chapter_id
    const parseBursts = await Promise.all(
      Array.from({ length: 5 }, () =>
        axios.post(`${baseApi}/parse/${cleanup.chapterId}`, {}, { headers: { Cookie: cookie } })
      )
    );
    for (const pr of parseBursts) {
      assert.strictEqual(pr.status, 200);
      assert.ok(Array.isArray(pr.data.segments) && pr.data.segments.length > 0);
    }

    // 5x concurrent POST /api/synthesize/:chapter_id (machine-tts)
    const synthBursts = await Promise.all(
      Array.from({ length: 5 }, () =>
        axios.post(
          `${baseApi}/synthesize/${cleanup.chapterId}`,
          { engine: 'machine-tts' },
          { headers: { Cookie: cookie } }
        )
      )
    );
    for (const sr of synthBursts) {
      assert.strictEqual(sr.status, 200);
      assert.ok(sr.data.total_duration_ms > 0);
    }

    // Range streaming & HEAD checks
    const headRes = await fetch(`${baseApi}/stream/${cleanup.chapterId}`, { method: 'HEAD' });
    assert.strictEqual(headRes.status, 200);
    const totalLen = Number(headRes.headers.get('content-length'));
    assert.ok(totalLen > 128, `Expected audio size > 128, got ${totalLen}`);

    const rangeValid = await fetch(`${baseApi}/stream/${cleanup.chapterId}`, {
      headers: { Range: 'bytes=0-127' },
    });
    assert.strictEqual(rangeValid.status, 206);
    assert.strictEqual(rangeValid.headers.get('content-range'), `bytes 0-127/${totalLen}`);
    const rangeBytes = await rangeValid.arrayBuffer();
    assert.strictEqual(rangeBytes.byteLength, 128);

    const suffixRange = await fetch(`${baseApi}/stream/${cleanup.chapterId}`, {
      headers: { Range: 'bytes=-64' },
    });
    assert.strictEqual(suffixRange.status, 206);
    assert.strictEqual((await suffixRange.arrayBuffer()).byteLength, 64);

    for (const badRange of ['bytes=99999999-', 'bytes=50-10', 'bytes=-0', 'bytes=invalid']) {
      const badRangeRes = await fetch(`${baseApi}/stream/${cleanup.chapterId}`, {
        headers: { Range: badRange },
      });
      assert.strictEqual(badRangeRes.status, 416, `Expected 416 for ${badRange}, got ${badRangeRes.status}`);
    }
    console.log('  ✔ Concurrent parse/synth (5x each), cache invalidation & range streaming (200/206/416) passed\n');

    // 6. WebSocket & SSE progress broadcast + disconnect cleanup
    console.log('▶ [6/6] Testing WebSocket heartbeat, broadcast & SSE disconnect cleanup...');
    const ws = new WebSocket(`${baseWs}/api/ws/progress/${cleanup.chapterId}`);
    const wsMessages = [];
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    ws.on('message', (data) => wsMessages.push(data.toString()));
    ws.send('ping');

    const sseController = new AbortController();
    const sseRes = await fetch(`${baseApi}/chapters/${cleanup.chapterId}/progress/sse`, {
      signal: sseController.signal,
    });
    assert.strictEqual(sseRes.status, 200);

    eventDispatcher.dispatch(cleanup.chapterId, {
      status: 'synthesizing',
      percent_complete: 77,
      current_segment: 2,
      total_segments: 3,
    });

    await new Promise((r) => setTimeout(r, 120));
    assert.ok(wsMessages.includes('pong'), 'WS heartbeat pong missing');
    assert.ok(
      wsMessages.some((m) => m.includes('"percent_complete":77')),
      'WS progress broadcast missing'
    );

    sseController.abort();
    ws.close();
    await new Promise((r) => setTimeout(r, 120));
    assert.ok(!eventDispatcher.sseClients.has(cleanup.chapterId), 'SSE client leaked after disconnect');
    assert.ok(!eventDispatcher.wsClients.has(cleanup.chapterId), 'WS client leaked after disconnect');
    console.log('  ✔ WebSocket & SSE broadcast and disconnect cleanup verified (0 leaks)\n');

    console.log('================================================================');
    console.log('🎉 ALL BACKEND STRESS AUDIT CHECKS PASSED (0 ERRORS)!');
    console.log('================================================================');
  } finally {
    if (cleanup.novelId) {
      await Chapter.deleteMany({ novel_id: cleanup.novelId }).catch(() => {});
    }
    if (cleanup.writerId) {
      await pool.query('DELETE FROM users WHERE id = $1', [cleanup.writerId]).catch(() => {});
    }
    for (const filePath of cleanup.audioFiles) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (_) {}
    }
    for (const dirPath of cleanup.chapterDirs) {
      try {
        if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
      } catch (_) {}
    }
    wss.close();
    server.close();
    await pool.end();
    await mongoose.disconnect();
  }
}

runStressAudit().catch((err) => {
  console.error('❌ STRESS AUDIT FAILED:', err);
  process.exit(1);
});
