const assert = require('assert');
const { ttsEngine } = require('./src/engine/ttsEngine');

async function runTests() {
  console.log('================================================================');
  console.log('🧪 SYNCTONE 3-ENGINE TTS ARCHITECTURE VERIFICATION');
  console.log('================================================================');

  // Test 1: checkModelAvailable status
  console.log('▶ [Test 1] Checking Model Availability & Status...');
  const status = await ttsEngine.checkModelAvailable();
  assert.ok(Array.isArray(status.engines), 'status.engines must be an array');
  assert.deepStrictEqual(
    status.engines,
    ['msedge-tts', 'kokoro-tts', 'machine-tts'],
    'Must list all 3 distinct TTS engines'
  );
  assert.strictEqual(status.initialized, true);
  console.log('  ✔ Model status returns all 3 TTS engines:', status.engines);

  // Test 2: Engine 1: msedge-tts
  console.log('▶ [Test 2] Testing Engine 1: msedge-tts (Microsoft Edge Cloud Neural)...');
  const edgeRes = await ttsEngine.synthesizeSegment(
    'SyncTone neural reading test.',
    'en-GB-RyanNeural',
    1.0,
    'msedge-tts'
  );
  assert.strictEqual(edgeRes.engine, 'msedge-tts');
  assert.strictEqual(edgeRes.format, 'mp3');
  assert.ok(edgeRes.audio_buffer instanceof Buffer);
  assert.ok(edgeRes.audio_buffer.length > 0, 'Buffer must not be empty');
  assert.ok(edgeRes.duration_ms > 0, 'Duration must be positive');
  console.log(`  ✔ Engine 1 (msedge-tts) generated ${edgeRes.audio_buffer.length} bytes MP3 (${edgeRes.duration_ms}ms)`);

  // Test 3: Engine 2: kokoro-tts
  console.log('▶ [Test 3] Testing Engine 2: kokoro-tts (Local Acoustic Neural Fallback)...');
  const kokoroRes = await ttsEngine.synthesizeSegment(
    'SyncTone Kokoro fallback synthesis.',
    'af_heart',
    1.0,
    'kokoro-tts'
  );
  assert.strictEqual(kokoroRes.engine, 'kokoro-tts');
  assert.strictEqual(kokoroRes.format, 'pcm');
  assert.ok(kokoroRes.audio_buffer instanceof Buffer);
  assert.ok(kokoroRes.audio_buffer.length > 0);
  assert.ok(kokoroRes.duration_ms > 0);
  console.log(`  ✔ Engine 2 (kokoro-tts) generated ${kokoroRes.audio_buffer.length} bytes PCM (${kokoroRes.duration_ms}ms)`);

  // Test 4: Engine 3: machine-tts
  console.log('▶ [Test 4] Testing Engine 3: machine-tts (Machine Local OS Speech)...');
  const machineRes = await ttsEngine.synthesizeSegment(
    'SyncTone machine voice synthesis.',
    'Daniel',
    1.0,
    'machine-tts'
  );
  assert.strictEqual(machineRes.engine, 'machine-tts');
  assert.strictEqual(machineRes.format, 'pcm');
  assert.ok(machineRes.audio_buffer instanceof Buffer);
  assert.ok(machineRes.audio_buffer.length > 0);
  assert.ok(machineRes.duration_ms > 0);
  console.log(`  ✔ Engine 3 (machine-tts) generated ${machineRes.audio_buffer.length} bytes PCM (${machineRes.duration_ms}ms)`);

  // Test 5: Fallback Chain with 'auto'
  console.log('▶ [Test 5] Testing Fallback Chain with engine="auto"...');
  const autoRes = await ttsEngine.synthesizeSegment(
    'SyncTone automatic fallback chain test.',
    'en-GB-RyanNeural',
    1.0,
    'auto'
  );
  assert.ok(['msedge-tts', 'kokoro-tts', 'machine-tts'].includes(autoRes.engine));
  assert.ok(autoRes.audio_buffer.length > 0);
  console.log(`  ✔ Fallback chain succeeded using engine: ${autoRes.engine} (${autoRes.duration_ms}ms)`);

  console.log('\n================================================================');
  console.log('🎉 ALL 3-ENGINE TTS TESTS PASSED (100% OPERATIONAL)!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('❌ TTS 3-ENGINE TEST FAILED:', err);
  process.exit(1);
});
