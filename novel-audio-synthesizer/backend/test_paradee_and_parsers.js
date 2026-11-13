/**
 * SyncTone — Paradee-8M-v1.2 + Machine-TTS Mixed Mode & 3-Tier AI Parser Verification Suite
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  PARADEE_VOICES,
  MACHINE_EXTRA_POOL,
  mapToParadeeVoice,
  buildMixedCastPlan,
  resolveMixedVoiceForCharacter,
} = require('./src/engine/mixedVoiceRouter');
const {
  parseNormalizedDetBoxes,
  stripUnlimitedOcrTags,
} = require('./src/engine/parsers/unlimitedOcrParser');
const { normalizeGeminiPayload } = require('./src/engine/parsers/geminiParser');
const { getParsersStatus } = require('./src/engine/parsers');
const { ttsEngine } = require('./src/engine/ttsEngine');

async function runVerification() {
  console.log('================================================================');
  console.log('🧪 PARADEE-8M + MACHINE-TTS MIXED MODE & 3-TIER PARSER TESTS');
  console.log('================================================================\n');

  // 1. Verify Paradee-8M-v1.2 ONNX weights exist locally
  console.log('▶ [1/5] Checking Paradee-8M-v1.2 ONNX model weights...');
  const modelStatus = await ttsEngine.checkModelAvailable();
  if (modelStatus.paradee_ready) {
    console.log('  ✔ Paradee-8M-v1.2 int8 ONNX model verified in models_cache/paradee\n');
  } else {
    console.log('  ℹ Paradee-8M ONNX weights not installed locally (optional offline weights). Skipping neural paradee PCM synthesis.\n');
  }

  // 2. Verify Mixed-Mode Cast Router (Narrator + Top 3 Paradee + 5th..Nth Machine-TTS)
  console.log('▶ [2/5] Testing Mixed-Mode Cast Slot Priority (paradee-mixed)...');
  const mockSegments = [
    { order: 1, type: 'narration', character_id: 'narrator', voice_id: 'en-GB-RyanNeural', text: 'The train steamed out of King Cross.' },
    // Character 1: Hermione (4 lines, female)
    { order: 2, type: 'dialogue', character_id: 'hermione', speaker_name: 'Hermione', voice_id: 'en-GB-SoniaNeural', text: 'Are you sure that is a real spell?' },
    { order: 3, type: 'dialogue', character_id: 'hermione', speaker_name: 'Hermione', voice_id: 'en-GB-SoniaNeural', text: 'Well, it is not very good, is it?' },
    { order: 4, type: 'dialogue', character_id: 'hermione', speaker_name: 'Hermione', voice_id: 'en-GB-SoniaNeural', text: 'I have tried a few simple spells myself.' },
    { order: 5, type: 'dialogue', character_id: 'hermione', speaker_name: 'Hermione', voice_id: 'en-GB-SoniaNeural', text: 'Nobody in my family is magic at all.' },
    // Character 2: Ron (3 lines, male)
    { order: 6, type: 'dialogue', character_id: 'ron', speaker_name: 'Ron', voice_id: 'en-GB-ThomasNeural', text: 'Sunshine, daisies, butter mellow.' },
    { order: 7, type: 'dialogue', character_id: 'ron', speaker_name: 'Ron', voice_id: 'en-GB-ThomasNeural', text: 'Turn this stupid, fat rat yellow.' },
    { order: 8, type: 'dialogue', character_id: 'ron', speaker_name: 'Ron', voice_id: 'en-GB-ThomasNeural', text: 'George gave it to me.' },
    // Character 3: Ginny (2 lines, female)
    { order: 9, type: 'dialogue', character_id: 'ginny', speaker_name: 'Ginny', voice_id: 'en-GB-LibbyNeural', text: 'Mom, can I go on the train too?' },
    { order: 10, type: 'dialogue', character_id: 'ginny', speaker_name: 'Ginny', voice_id: 'en-GB-LibbyNeural', text: 'I want to see Hogwarts!' },
    // Character 4 (5th slot including Narrator): Neville (1 line, male -> overflows to machine-tts!)
    { order: 11, type: 'dialogue', character_id: 'neville', speaker_name: 'Neville', voice_id: 'en-US-GuyNeural', text: 'Has anyone seen a toad?' },
    // Character 5 (6th slot including Narrator): Malfoy (1 line, male -> overflows to machine-tts!)
    { order: 12, type: 'dialogue', character_id: 'malfoy', speaker_name: 'Draco Malfoy', voice_id: 'en-AU-WilliamNeural', text: 'You will soon find out some wizarding families are better.' },
  ];

  const plan = buildMixedCastPlan(mockSegments);
  const narratorSlot = plan.get('narrator');
  const hermioneSlot = plan.get('hermione');
  const ronSlot = plan.get('ron');
  const ginnySlot = plan.get('ginny');
  const nevilleSlot = plan.get('neville');
  const malfoySlot = plan.get('malfoy');

  assert.strictEqual(narratorSlot.engine, 'paradee-tts');
  assert.strictEqual(narratorSlot.voiceId, 'bm_fable');
  assert.strictEqual(hermioneSlot.engine, 'paradee-tts');
  assert.strictEqual(ronSlot.engine, 'paradee-tts');
  assert.strictEqual(ginnySlot.engine, 'paradee-tts');

  // Verify all 4 Paradee neural voices are distinct across Narrator + Top 3 characters
  const primaryVoices = new Set([
    narratorSlot.voiceId,
    hermioneSlot.voiceId,
    ronSlot.voiceId,
    ginnySlot.voiceId,
  ]);
  assert.strictEqual(primaryVoices.size, 4, 'Expected all 4 Paradee-8M voices assigned without collision');

  // Verify 5th+ characters (Neville, Malfoy) overflow to machine-tts with distinct extra voices
  assert.strictEqual(nevilleSlot.engine, 'machine-tts');
  assert.strictEqual(malfoySlot.engine, 'machine-tts');
  assert.notStrictEqual(nevilleSlot.voiceId, malfoySlot.voiceId, 'Expected distinct machine-tts voices for extra characters');
  console.log(
    `  ✔ Cast Plan verified: Narrator(${narratorSlot.voiceId}), Hermione(${hermioneSlot.voiceId}), Ron(${ronSlot.voiceId}), Ginny(${ginnySlot.voiceId}) -> Paradee-8M; Neville(${nevilleSlot.voiceId}), Malfoy(${malfoySlot.voiceId}) -> Machine-TTS\n`
  );

  // 3. Verify Unlimited-OCR Markdown + <|det|> Bounding Box Parser
  console.log('▶ [3/5] Testing Baidu Unlimited-OCR Markdown & BBox Parser...');
  const sampleOcrOutput = [
    '# Chapter 1: The Boy Who Lived',
    'Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were perfectly normal.',
    '<|ref|>image<|/ref|><|det|>[[120, 250, 880, 640]]<|/det|>',
    '"Little tyke," chortled Mr. Dursley as he left the house.',
  ].join('\n\n');

  const boxes = parseNormalizedDetBoxes(sampleOcrOutput);
  const cleanText = stripUnlimitedOcrTags(sampleOcrOutput);
  assert.strictEqual(boxes.length, 1, 'Expected 1 detected figure bounding box');
  assert.deepStrictEqual(boxes[0].normalized, [120, 250, 880, 640]);
  assert.ok(!cleanText.includes('<|det|>'), 'Expected <|det|> tags stripped from clean prose');
  console.log('  ✔ Unlimited-OCR layout Markdown & <|det|> bounding-box extraction verified!\n');

  // 4. Verify Gemini JSON Extractor & 3-Tier Status
  console.log('▶ [4/5] Testing Gemini JSON Extractor & 3-Tier Parser Status...');
  const parsedGemini = normalizeGeminiPayload('{"title":"Test Novel","chapters":[{"chapter_number":1,"title":"Ch 1","segments":[{"type":"narration","text":"Hello world."}]}]}');
  assert.strictEqual(parsedGemini.title, 'Test Novel');
  assert.strictEqual(parsedGemini.chapters.length, 1);

  const parsersStatus = await getParsersStatus();
  assert.strictEqual(parsersStatus.heuristic.available, true);
  assert.ok(parsersStatus.gemini);
  assert.ok(parsersStatus.unlimited_ocr);
  console.log('  ✔ Gemini JSON extractor & 3-tier parser status verified!\n');

  // 5. Verify Live PCM Synthesis for paradee-tts, paradee-mixed, and machine-tts
  console.log('▶ [5/5] Testing PCM Synthesis across paradee-tts, paradee-mixed & machine-tts...');

  if (modelStatus.paradee_ready) {
    // 5a. Paradee-8M neural voice synthesis
    const resParadee = await ttsEngine.synthesizeSegment(
      'Mr. Sherlock Holmes was seated at the breakfast table.',
      'bm_fable',
      1.0,
      'paradee-tts'
    );
    assert.ok(
      Buffer.isBuffer(resParadee.audio_buffer) && resParadee.audio_buffer.length > 4800,
      'Expected valid 24kHz PCM buffer from paradee-tts'
    );
    assert.strictEqual(resParadee.engine, 'paradee-tts');
    console.log(
      `  ✔ paradee-tts (bm_fable) synthesized ${resParadee.audio_buffer.length} bytes (${resParadee.duration_ms}ms) of 24kHz s16le PCM`
    );

    // 5b. Paradee-Mixed primary character (Hermione -> bf_isabella via paradee-tts)
    const resMixedPrimary = await ttsEngine.synthesizeSegment(
      'Are you sure that is a real spell?',
      'en-GB-SoniaNeural',
      1.0,
      'paradee-mixed',
      {
        characterId: 'hermione',
        speakerName: 'Hermione',
        castPlan: plan,
      }
    );
    assert.strictEqual(resMixedPrimary.engine, 'paradee-mixed');
    assert.strictEqual(resMixedPrimary.sub_engine, 'paradee-tts');
    assert.strictEqual(resMixedPrimary.resolved_voice_id, hermioneSlot.voiceId);
    assert.ok(Buffer.isBuffer(resMixedPrimary.audio_buffer) && resMixedPrimary.audio_buffer.length > 4800);
    console.log(
      `  ✔ paradee-mixed primary (hermione -> ${resMixedPrimary.resolved_voice_id}) synthesized ${resMixedPrimary.audio_buffer.length} bytes via ${resMixedPrimary.sub_engine}`
    );

    // 5c. Paradee-Mixed overflow character (Neville -> machine-tts)
    const resMixedExtra = await ttsEngine.synthesizeSegment(
      'Has anyone seen a toad?',
      'en-US-GuyNeural',
      1.0,
      'paradee-mixed',
      {
        characterId: 'neville',
        speakerName: 'Neville',
        castPlan: plan,
      }
    );
    assert.strictEqual(resMixedExtra.engine, 'paradee-mixed');
    assert.strictEqual(resMixedExtra.sub_engine, 'machine-tts');
    assert.strictEqual(resMixedExtra.resolved_voice_id, nevilleSlot.voiceId);
    assert.ok(
      Buffer.isBuffer(resMixedExtra.audio_buffer) && resMixedExtra.audio_buffer.length > 2400,
      'Expected valid 24kHz PCM buffer from paradee-mixed overflow'
    );
    console.log(
      `  ✔ paradee-mixed overflow (neville -> ${resMixedExtra.resolved_voice_id}) synthesized ${resMixedExtra.audio_buffer.length} bytes via ${resMixedExtra.sub_engine}`
    );
  } else {
    console.log('  ℹ Skipping live Paradee neural synthesis (model weights not installed).');
  }

  // 5d. Standalone machine-tts (non-destructive check)
  const resMachine = await ttsEngine.synthesizeSegment(
    'Standalone machine speech synthesis test.',
    'en-GB-RyanNeural',
    1.0,
    'machine-tts'
  );
  assert.strictEqual(resMachine.engine, 'machine-tts');
  assert.ok(
    Buffer.isBuffer(resMachine.audio_buffer) && resMachine.audio_buffer.length > 2400,
    'Expected valid 24kHz PCM buffer from standalone machine-tts'
  );
  console.log(
    `  ✔ standalone machine-tts synthesized ${resMachine.audio_buffer.length} bytes (${resMachine.duration_ms}ms) of 24kHz s16le PCM`
  );

  console.log('\n================================================================');
  console.log('🎉 ALL PARADEE-8M + MIXED MODE & 3-TIER PARSER CHECKS PASSED!');
  console.log('================================================================\n');
}

runVerification()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  });
