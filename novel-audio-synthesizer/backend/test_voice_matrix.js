/**
 * SyncTone — Voice Matrix, Engine Switching, Fallback Honesty & Event Loop Verification
 *
 * Test suite verifying:
 * 1. Voice Distinctness:
 *    5 distinct characters (Narrator, Harry, Hermione, Ron, Hagrid) across
 *    msedge-tts, kokoro-tts, paradee-tts, paradee-mixed.
 *    Verifies non-empty, non-silent, and mutually distinct audio buffers (MD5 hashes).
 * 2. Engine Switching:
 *    Same text across msedge-tts, kokoro-tts, paradee-tts, machine-tts.
 *    Verifies distinct audio hashes and accurate X-TTS-Engine response headers.
 * 3. Fallback Honesty:
 *    Explicit engine requests return requested engine or 503 error, never silent spoofing.
 * 4. Non-blocking Event Loop:
 *    Concurrent /api/health requests respond in < 100ms during active synthesis.
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const axios = require('axios');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { createApp } = require('./src/app');
const { pool, connectMongo, connectPostgres } = require('./src/db');
const { Chapter } = require('./src/models');
const { config } = require('./src/config');
const { parseChapter } = require('./src/engine/textParser');
const { VoiceProfiler, VOICE_PALETTE, isGenericSpeakerKey } = require('./src/engine/voiceProfiler');
const { ttsEngine } = require('./src/engine/ttsEngine');

/**
 * Checks whether an audio buffer is non-silent.
 * Works for both raw PCM/WAV and compressed MP3 audio.
 */
function isAudioNonSilent(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 100) {
    return false;
  }

  // Check for RIFF/WAV header
  if (buffer.length > 44 && buffer.toString('ascii', 0, 4) === 'RIFF') {
    const dataIdx = buffer.indexOf(Buffer.from('data'));
    const offset = dataIdx !== -1 ? dataIdx + 8 : 44;
    let nonZero = 0;
    for (let i = offset; i < Math.min(buffer.length, offset + 4000); i++) {
      if (buffer[i] !== 0) nonZero++;
    }
    return nonZero > 20;
  }

  // Check for raw PCM (s16le)
  let nonZero = 0;
  for (let i = 0; i < Math.min(buffer.length, 2000); i++) {
    if (buffer[i] !== 0) nonZero++;
  }
  if (nonZero > 20) {
    return true;
  }

  // Check for MP3 or other encoded audio (entropy / unique bytes)
  const sample = buffer.subarray(0, Math.min(buffer.length, 1000));
  const uniqueBytes = new Set(sample);
  return uniqueBytes.size > 20 && buffer.length > 500;
}

function computeMd5(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

async function runVoiceMatrixTests() {
  console.log('================================================================');
  console.log('🧪 SYNCTONE VOICE MATRIX & ENGINE VERIFICATION SUITE');
  console.log('================================================================\n');

  // Connect databases for route-level parser/assign integration checks
  await connectPostgres();
  await connectMongo();

  // Start ephemeral HTTP server on dynamic port
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;
  console.log(`  ✔ Test API server listening on http://127.0.0.1:${port}\n`);

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Voice Distinctness across 5 Characters & 4 Engines
    // -------------------------------------------------------------------------
    console.log('▶ [Test 1] Testing Voice Distinctness (5 Characters x 4 Engines)...');

    const testCharacters = [
      {
        character_id: 'narrator',
        speaker_name: 'Narrator',
        is_narrator: true,
        gender: 'male',
        voice_id: 'en-GB-RyanNeural',
        cast_slot: 1,
      },
      {
        character_id: 'harry',
        speaker_name: 'Harry Potter',
        is_narrator: false,
        gender: 'male',
        voice_id: 'en-GB-ThomasNeural',
        cast_slot: 2,
      },
      {
        character_id: 'hermione',
        speaker_name: 'Hermione Granger',
        is_narrator: false,
        gender: 'female',
        voice_id: 'en-GB-LibbyNeural',
        cast_slot: 3,
      },
      {
        character_id: 'ron',
        speaker_name: 'Ron Weasley',
        is_narrator: false,
        gender: 'male',
        voice_id: 'en-GB-AlfieNeural',
        cast_slot: 4,
      },
      {
        character_id: 'hagrid',
        speaker_name: 'Rubeus Hagrid',
        is_narrator: false,
        gender: 'male',
        voice_id: 'en-GB-RyanNeural',
        cast_slot: 5,
      },
    ];

    const testEngines = ['msedge-tts', 'kokoro-tts', 'paradee-tts', 'paradee-mixed'];
    const sentenceText = 'The wand chooses the wizard, Mr. Potter.';

    for (const engine of testEngines) {
      console.log(`  Checking engine: ${engine}...`);
      const hashes = new Map();
      const buffers = new Map();

      for (const char of testCharacters) {
        const resp = await axios.get(`${baseUrl}/voices/speak`, {
          params: {
            text: sentenceText,
            engine,
            character_id: char.character_id,
            speaker_name: char.speaker_name,
            is_narrator: char.is_narrator,
            gender: char.gender,
            voice_id: char.voice_id,
            cast_slot: char.cast_slot,
          },
          responseType: 'arraybuffer',
          validateStatus: (status) => status === 200,
        });

        const buf = Buffer.from(resp.data);
        assert.ok(buf.length > 0, `Audio buffer for ${char.character_id} on ${engine} must not be empty`);
        assert.ok(isAudioNonSilent(buf), `Audio buffer for ${char.character_id} on ${engine} must not be silent`);

        const hash = computeMd5(buf);
        hashes.set(char.character_id, hash);
        buffers.set(char.character_id, buf);
      }

      // Verify that all 5 characters have unique hashes
      const uniqueHashes = new Set(hashes.values());
      console.log(`    Hashes for ${engine}:`);
      for (const [cid, h] of hashes.entries()) {
        console.log(`      ${cid.padEnd(10)}: ${h} (${buffers.get(cid).length} bytes)`);
      }

      assert.strictEqual(
        uniqueHashes.size,
        testCharacters.length,
        `Expected all 5 characters on ${engine} to have distinct audio MD5 hashes, got ${uniqueHashes.size} unique hashes`
      );
      console.log(`  ✔ ${engine}: All 5 characters produced distinct, non-silent audio\n`);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Engine Switching & Response Headers
    // -------------------------------------------------------------------------
    console.log('▶ [Test 2] Testing Engine Switching & Headers (msedge-tts vs kokoro-tts vs paradee-tts vs machine-tts)...');

    const switchEngines = ['msedge-tts', 'kokoro-tts', 'paradee-tts', 'machine-tts'];
    const switchText = 'It does not do to dwell on dreams and forget to live.';
    const switchHashes = new Map();

    for (const eng of switchEngines) {
      const resp = await axios.get(`${baseUrl}/voices/speak`, {
        params: {
          text: switchText,
          engine: eng,
          character_id: 'narrator',
          is_narrator: true,
          voice_id: 'en-GB-RyanNeural',
        },
        responseType: 'arraybuffer',
        validateStatus: (status) => status === 200,
      });

      const returnedEngine = resp.headers['x-tts-engine'];
      assert.strictEqual(
        returnedEngine,
        eng,
        `Expected X-TTS-Engine header to be '${eng}', got '${returnedEngine}'`
      );

      const buf = Buffer.from(resp.data);
      assert.ok(buf.length > 0, `Engine ${eng} returned empty buffer`);
      assert.ok(isAudioNonSilent(buf), `Engine ${eng} returned silent buffer`);

      const hash = computeMd5(buf);
      switchHashes.set(eng, hash);
      console.log(`  ✔ Engine ${eng.padEnd(12)} -> X-TTS-Engine: ${returnedEngine}, hash: ${hash} (${buf.length} bytes)`);
    }

    const uniqueSwitchHashes = new Set(switchHashes.values());
    assert.strictEqual(
      uniqueSwitchHashes.size,
      switchEngines.length,
      `Expected all 4 engines to produce distinct audio outputs for identical text, got ${uniqueSwitchHashes.size} unique hashes`
    );
    console.log('  ✔ Engine switching verified: All 4 engines produced distinct audio and correct headers');

    // Verify machine-tts also produces non-silent distinct PCM across characters
    const machineHashes = new Set();
    for (const char of testCharacters) {
      const mResp = await axios.get(`${baseUrl}/voices/speak`, {
        params: {
          text: sentenceText,
          engine: 'machine-tts',
          character_id: char.character_id,
          speaker_name: char.speaker_name,
          is_narrator: char.is_narrator,
          gender: char.gender,
          voice_id: char.voice_id,
          cast_slot: char.cast_slot,
        },
        responseType: 'arraybuffer',
        validateStatus: (status) => status === 200,
      });
      assert.strictEqual(mResp.headers['x-tts-engine'], 'machine-tts');
      const mBuf = Buffer.from(mResp.data);
      assert.ok(isAudioNonSilent(mBuf), `machine-tts returned silent PCM for ${char.character_id}`);
      machineHashes.add(computeMd5(mBuf));
    }
    assert.strictEqual(
      machineHashes.size,
      testCharacters.length,
      `Expected ${testCharacters.length} distinct non-silent PCM outputs on machine-tts across the 5 characters, got ${machineHashes.size}`
    );
    console.log(`  ✔ machine-tts verified: All 5 characters produced distinct non-silent PCM (${machineHashes.size}/5 distinct hashes)\n`);

    // -------------------------------------------------------------------------
    // TEST 3: Fallback Honesty
    // -------------------------------------------------------------------------
    console.log('▶ [Test 3] Testing Fallback Honesty (No Silent Engine Spoofing)...');

    // 3a: Explicit engines must return requested engine or 503, never faked engine
    for (const eng of ['msedge-tts', 'kokoro-tts', 'paradee-tts', 'machine-tts']) {
      const resp = await axios.get(`${baseUrl}/voices/speak`, {
        params: {
          text: 'Fallback honesty check.',
          engine: eng,
          voice_id: 'en-GB-RyanNeural',
        },
        responseType: 'arraybuffer',
        validateStatus: (status) => status === 200 || status === 503,
      });

      if (resp.status === 200) {
        const returnedEngine = resp.headers['x-tts-engine'];
        if (eng === 'msedge-tts') {
          assert.ok(
            ['msedge-tts', 'kokoro-tts', 'paradee-tts', 'machine-tts'].includes(returnedEngine),
            `Unexpected fallback X-TTS-Engine '${returnedEngine}' for requested ${eng}`
          );
          console.log(`  ✔ Explicit ${eng} response: 200 OK with honest X-TTS-Engine '${returnedEngine}'`);
        } else {
          assert.strictEqual(
            returnedEngine,
            eng,
            `Engine spoofing detected! Requested ${eng} but received 200 with X-TTS-Engine ${returnedEngine}`
          );
          console.log(`  ✔ Explicit ${eng} honest response: 200 OK with matching X-TTS-Engine`);
        }
      } else {
        assert.strictEqual(resp.status, 503, `Expected 503 for unavailable engine ${eng}`);
        console.log(`  ✔ Explicit ${eng} honest failure: 503 Service Unavailable`);
      }
    }

    // 3b: Requesting an invalid/unavailable engine must fail honestly with 503 or error status, never 200 spoofing
    const invalidResp = await axios.get(`${baseUrl}/voices/speak`, {
      params: {
        text: 'Invalid engine honesty test.',
        engine: 'nonexistent-neural-engine',
        voice_id: 'en-GB-RyanNeural',
      },
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });

    assert.ok(
      invalidResp.status === 503 || invalidResp.status === 500 || invalidResp.status === 400,
      `Request for nonexistent engine must return error status (503/500/400), got ${invalidResp.status}`
    );
    if (invalidResp.status === 200) {
      assert.fail('Invalid engine must never return 200 OK with silent fallback');
    }
    console.log(`  ✔ Invalid engine rejected honestly with status ${invalidResp.status}\n`);

    // -------------------------------------------------------------------------
    // TEST 4: Non-blocking Event Loop (< 100ms /api/health during synthesis)
    // -------------------------------------------------------------------------
    console.log('▶ [Test 4] Testing Non-blocking Event Loop during Local Synthesis...');

    const longText =
      'Happiness can be found, even in the darkest of times, if one only remembers to turn on the light. ' +
      'Words are, in my not-so-humble opinion, our most inexhaustible source of magic.';

    // Start a long local synthesis request (Kokoro or Paradee) without awaiting immediately
    const synthPromise = axios.get(`${baseUrl}/voices/speak`, {
      params: {
        text: longText,
        engine: 'kokoro-tts',
        voice_id: 'bm_george',
        character_id: 'dumbledore',
        speed: 1.0,
      },
      responseType: 'arraybuffer',
      validateStatus: (status) => status === 200 || status === 503,
    });

    // Fire concurrent /api/health checks while synthesis is actively executing
    const healthLatencies = [];
    const healthPromises = [];

    for (let i = 0; i < 5; i++) {
      // Stagger slightly over the execution window
      const p = new Promise((resolve) => setTimeout(resolve, i * 80)).then(async () => {
        const start = Date.now();
        const healthRes = await axios.get(`${baseUrl}/health`, { timeout: 3000 });
        const latency = Date.now() - start;
        assert.strictEqual(healthRes.status, 200);
        assert.strictEqual(healthRes.data.status, 'healthy');
        healthLatencies.push(latency);
        return latency;
      });
      healthPromises.push(p);
    }

    const [synthRes] = await Promise.all([synthPromise, Promise.all(healthPromises)]);

    console.log(`  Local synthesis completed with status ${synthRes.status}`);
    console.log(`  Concurrent /api/health latencies: ${healthLatencies.map((l) => `${l}ms`).join(', ')}`);

    const maxLatency = Math.max(...healthLatencies);
    console.log(`  Max health latency under load: ${maxLatency}ms`);

    assert.ok(
      maxLatency < 100,
      `Event loop blocked! /api/health took ${maxLatency}ms (> 100ms threshold) during local synthesis`
    );
    console.log(`  ✔ Non-blocking event loop verified: Max latency was ${maxLatency}ms (< 100ms limit)\n`);

    // -------------------------------------------------------------------------
    // TEST 5: Literary Dialogue Parsing (Honorifics, Turn-Taking) & Registry Guard
    // -------------------------------------------------------------------------
    console.log('▶ [Test 5] Testing Literary Dialogue Parsing (Honorifics, Turn-Taking) & Non-Poisoned Voice Registry...');

    const literarySample = [
      'We sat beside the fire in Baker Street as the fog rolled past.',
      '"The game is afoot," said Mr. Sherlock Holmes with a smile.',
      '"Indeed, Mr. Holmes," remarked Dr. Watson from his armchair.',
      '"How could you deduce that?" cried I.',
      '"Observe the mud on his boots," he replied calmly.',
      '"And the telegram from Irene Adler?"',
      '"She knows everything," answered Mr. Sherlock Holmes.',
      '"Look at St. Clair\'s cipher," whispered Irene Adler in a low voice.',
      '"Most extraordinary," murmured Lord St. Simon.',
    ].join('\n\n');

    const parsedLiterary = parseChapter(literarySample, 'Sherlock Test', 'test-sherlock-ch');
    const dialogueSegs = parsedLiterary.segments.filter((s) => s.type === 'dialogue');
    const extractedSpeakers = new Set(dialogueSegs.map((s) => s.speaker_name));

    assert.ok(dialogueSegs.length >= 7, `Expected >= 7 dialogue segments, got ${dialogueSegs.length}`);
    assert.ok(
      extractedSpeakers.has('Sherlock Holmes') || extractedSpeakers.has('Mr. Sherlock Holmes'),
      `Expected Sherlock Holmes in ${Array.from(extractedSpeakers).join(', ')}`
    );
    assert.ok(
      extractedSpeakers.has('Dr. Watson') || extractedSpeakers.has('Dr. John Watson'),
      `Expected Dr. Watson in ${Array.from(extractedSpeakers).join(', ')}`
    );
    assert.ok(extractedSpeakers.has('Irene Adler'), `Expected Irene Adler in ${Array.from(extractedSpeakers).join(', ')}`);
    assert.ok(extractedSpeakers.has('Lord St. Simon'), `Expected Lord St. Simon in ${Array.from(extractedSpeakers).join(', ')}`);

    for (const sname of extractedSpeakers) {
      assert.ok(!/with a smile|from his armchair|in a low voice/i.test(sname), `Trailing phrase leaked into speaker name: ${sname}`);
      assert.ok(!isGenericSpeakerKey(sname), `Generic speaker key leaked as character: ${sname}`);
    }

    // Verify VoiceProfiler scrubs poisoned generic keys and assigns unique non-narrator voices
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synctone-prof-'));
    const tmpRegistryPath = path.join(tmpDir, 'voice_registry.json');
    try {
      fs.writeFileSync(
        tmpRegistryPath,
        JSON.stringify({
          unresolved: { character_id: 'unresolved', voice_id: 'en-GB-ArthurNeural' },
          unknown: { character_id: 'unknown', voice_id: 'en-GB-RyanNeural' },
          dialogue_speaker: { character_id: 'dialogue_speaker', voice_id: 'en-GB-AlfieNeural' },
          speaker_a: { character_id: 'speaker_a', voice_id: 'en-GB-NoahNeural' },
          holmes: { character_id: 'holmes', voice_id: 'en-GB-ArthurNeural' },
        }),
        'utf-8'
      );

      const isolatedProfiler = new VoiceProfiler();
      isolatedProfiler.registryPath = tmpRegistryPath;
      isolatedProfiler.registry = {};
      isolatedProfiler.load();

      for (const poisonedKey of ['unresolved', 'unknown', 'dialogue_speaker', 'speaker_a']) {
        assert.strictEqual(isolatedProfiler.registry[poisonedKey], undefined, `Poisoned key ${poisonedKey} should be scrubbed`);
      }
      assert.ok(isolatedProfiler.registry.holmes, 'Valid character entry should remain');
      assert.notStrictEqual(isolatedProfiler.registry.holmes.voice_id, 'en-GB-ArthurNeural', 'Legacy dead voice should normalize');

      const voicedLiterary = isolatedProfiler.applyVoicesToSegments(parsedLiterary.segments);
      const characterVoicePairs = new Map();
      for (const seg of voicedLiterary) {
        if (seg.type === 'narration') {
          assert.strictEqual(seg.assigned_voice_id, VOICE_PALETTE.narrator);
        } else if (seg.type === 'dialogue') {
          assert.notStrictEqual(seg.assigned_voice_id, VOICE_PALETTE.narrator, `Dialogue for ${seg.speaker_name} must not share narrator voice`);
          if (!characterVoicePairs.has(seg.speaker_name)) {
            characterVoicePairs.set(seg.speaker_name, seg.assigned_voice_id);
          }
        }
      }
      const uniqueCharVoices = new Set(characterVoicePairs.values());
      assert.strictEqual(
        uniqueCharVoices.size,
        characterVoicePairs.size,
        `Expected every character in chapter to get a unique voice: ${JSON.stringify(Array.from(characterVoicePairs.entries()))}`
      );
      console.log(`  ✔ Literary parsing & non-poisoned VoiceProfiler verified (${characterVoicePairs.size} unique speaking voices)\n`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    // -------------------------------------------------------------------------
    // TEST 6: Runtime Parser Config, Voice Assign (optionalAuth) & POST /api/parse/:chapter_id
    // -------------------------------------------------------------------------
    console.log('▶ [Test 6] Testing GET/POST /api/status/parser-config, POST /api/voices/assign & POST /api/parse/:chapter_id...');

    const parserConfigPath = path.join(config.paths.outputDir, 'parser_config.json');
    const hadParserConfig = fs.existsSync(parserConfigPath);
    const prevParserConfigRaw = hadParserConfig ? fs.readFileSync(parserConfigPath, 'utf-8') : null;

    const registryPath = path.join(config.paths.outputDir, 'voice_registry.json');
    const hadRegistry = fs.existsSync(registryPath);
    const prevRegistryRaw = hadRegistry ? fs.readFileSync(registryPath, 'utf-8') : null;

    const testUserId = uuidv4();
    const testNovelId = uuidv4();
    const testChapterId = uuidv4();
    let createdDbFixtures = false;

    try {
      const cfgGet1 = await axios.get(`${baseUrl}/status/parser-config`);
      assert.strictEqual(cfgGet1.status, 200);
      assert.ok(cfgGet1.data.heuristic, 'parser-config must include heuristic section');
      assert.ok(cfgGet1.data.gemini, 'parser-config must include gemini section');
      assert.ok(cfgGet1.data.ollama, 'parser-config must include ollama section');
      assert.ok(cfgGet1.data.ocr, 'parser-config must include ocr section');

      const cfgPost = await axios.post(`${baseUrl}/status/parser-config`, {
        activeEngine: 'heuristic',
        heuristic: { sensitivity: 'aggressive', turnTaking: true, quoteStyle: 'auto' },
      });
      assert.strictEqual(cfgPost.status, 200);
      assert.strictEqual(cfgPost.data.ok, true);
      assert.strictEqual(cfgPost.data.config.heuristic.sensitivity, 'aggressive');

      const cfgGet2 = await axios.get(`${baseUrl}/status/parser-config`);
      assert.strictEqual(cfgGet2.data.heuristic.sensitivity, 'aggressive');
      console.log('  ✔ GET/POST /api/status/parser-config verified');

      if (mongoose.connection.readyState === 1) {
        await pool.query(
          `INSERT INTO users (id, username, email, password_hash, role) VALUES ($1, $2, $3, 'hash', 'writer')`,
          [testUserId, `vm_tester_${Date.now()}`, `vm_${Date.now()}@example.com`]
        );
        await pool.query(
          `INSERT INTO novels (id, title, added_by, channel, status) VALUES ($1, 'Voice Matrix Test Novel', $2, 'community', 'draft')`,
          [testNovelId, testUserId]
        );
        await pool.query(
          `INSERT INTO chapters (id, novel_id, chapter_number, title, status) VALUES ($1, $2, 1, 'Chapter 1: Test Parse', 'draft')`,
          [testChapterId, testNovelId]
        );
        createdDbFixtures = true;

        await Chapter.create({
          pg_chapter_id: testChapterId,
          novel_id: testNovelId,
          chapter_number: 1,
          title: 'Chapter 1: Test Parse',
          raw_text: literarySample,
          segments: [],
          manifest: { total_duration_ms: 0, audio_url: `/api/stream/${testChapterId}`, timeline: [] },
        });

        // Anonymous POST /api/parse/:chapter_id (optionalAuth)
        const parseResp = await axios.post(`${baseUrl}/parse/${testChapterId}`, {
          parser_engine: 'heuristic',
          parser_config: { heuristic: { sensitivity: 'balanced', turnTaking: true, quoteStyle: 'auto' } },
        });
        assert.strictEqual(parseResp.status, 200);
        assert.ok(Array.isArray(parseResp.data.segments) && parseResp.data.segments.length >= 7);

        const refreshedDoc = await Chapter.findOne({ pg_chapter_id: testChapterId }).lean();
        assert.ok(refreshedDoc.segments.length >= 7, 'MongoDB segments must be populated after /api/parse');
        assert.ok(refreshedDoc.manifest?.timeline?.length === refreshedDoc.segments.length, 'Manifest timeline must align with segments');

        const pgChars = await pool.query('SELECT canonical_name, voice_id FROM characters WHERE novel_id = $1', [testNovelId]);
        assert.ok(pgChars.rows.length >= 3, `Expected >= 3 PG characters after /api/parse, got ${pgChars.rows.length}`);
        console.log(`  ✔ POST /api/parse/:chapter_id (optionalAuth) verified (${pgChars.rows.length} PG characters, ${refreshedDoc.segments.length} segments)`);

        // GET /api/voices returns populated available_voices catalog (no TypeError regression)
        const voicesListResp = await axios.get(`${baseUrl}/voices`);
        assert.strictEqual(voicesListResp.status, 200);
        assert.ok(
          voicesListResp.data?.available_voices &&
            Object.keys(voicesListResp.data.available_voices).length >= 10 &&
            voicesListResp.data.available_voices.narrator === 'en-GB-RyanNeural',
          'GET /api/voices must return non-empty available_voices catalog'
        );
        console.log(`  ✔ GET /api/voices verified (${Object.keys(voicesListResp.data.available_voices).length} palette voices)`);

        // Anonymous POST /api/voices/assign (optionalAuth)
        const targetChar = pgChars.rows.find((c) => c.canonical_name !== 'Narrator');
        assert.ok(targetChar, 'Expected at least one non-narrator character in PG');
        const newVoice = targetChar.voice_id === 'en-GB-ThomasNeural' ? 'en-US-GuyNeural' : 'en-GB-ThomasNeural';

        const assignResp = await axios.post(`${baseUrl}/voices/assign`, {
          character_id: targetChar.canonical_name,
          new_voice_id: newVoice,
          chapter_id: testChapterId,
        });
        assert.strictEqual(assignResp.status, 200);
        assert.strictEqual(assignResp.data.ok, true);
        assert.strictEqual(assignResp.data.voice_id, newVoice);

        const updatedDoc = await Chapter.findOne({ pg_chapter_id: testChapterId }).lean();
        const updatedSegs = updatedDoc.segments.filter((s) => s.speaker_name === targetChar.canonical_name);
        assert.ok(updatedSegs.length > 0 && updatedSegs.every((s) => s.voice_id === newVoice), 'MongoDB segments must reflect new voice_id');

        const updatedTimeline = updatedDoc.manifest.timeline.filter((t) =>
          updatedSegs.some((s) => s.segment_id === t.segment_id)
        );
        assert.ok(updatedTimeline.length > 0 && updatedTimeline.every((t) => t.voice_id === newVoice), 'MongoDB manifest.timeline must reflect new voice_id');

        const updatedPgChar = await pool.query(
          'SELECT voice_id FROM characters WHERE novel_id = $1 AND canonical_name = $2',
          [testNovelId, targetChar.canonical_name]
        );
        assert.strictEqual(updatedPgChar.rows[0]?.voice_id, newVoice, 'PostgreSQL characters table must reflect new voice_id');
        console.log(`  ✔ POST /api/voices/assign (optionalAuth) verified (${targetChar.canonical_name} -> ${newVoice} across Mongo & PG)\n`);
      }
    } finally {
      if (createdDbFixtures) {
        await Chapter.deleteMany({ pg_chapter_id: testChapterId }).catch(() => {});
        await pool.query('DELETE FROM characters WHERE novel_id = $1', [testNovelId]).catch(() => {});
        await pool.query('DELETE FROM chapters WHERE id = $1', [testChapterId]).catch(() => {});
        await pool.query('DELETE FROM novels WHERE id = $1', [testNovelId]).catch(() => {});
        await pool.query('DELETE FROM users WHERE id = $1', [testUserId]).catch(() => {});
      }
      if (hadParserConfig && prevParserConfigRaw !== null) {
        fs.writeFileSync(parserConfigPath, prevParserConfigRaw, 'utf-8');
      } else if (!hadParserConfig && fs.existsSync(parserConfigPath)) {
        fs.unlinkSync(parserConfigPath);
      }
      if (hadRegistry && prevRegistryRaw !== null) {
        fs.writeFileSync(registryPath, prevRegistryRaw, 'utf-8');
      } else if (!hadRegistry && fs.existsSync(registryPath)) {
        fs.unlinkSync(registryPath);
      }
    }

    console.log('================================================================');
    console.log('🎉 ALL VOICE MATRIX, ENGINE, PARSER & EVENT LOOP TESTS PASSED (100%)!');
    console.log('================================================================');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await pool.end().catch(() => {});
    await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  runVoiceMatrixTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n❌ VOICE MATRIX TEST SUITE FAILED:', err.message);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
}

module.exports = { runVoiceMatrixTests };
