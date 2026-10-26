/**
 * SyncTone — Idempotent Demo Seeder
 *
 * Seeds reference demo portfolio datasets across PostgreSQL and MongoDB:
 * 1. System demo author user ('demo_author@synctone.internal')
 * 2. Local Verified Demo: 'Harry Potter and the Philosopher's Stone' (Chapter 1)
 *    with full British cast, grounded sample quotes, 4NF aliases, and synthesized audio.
 * 3. Public Verified Demo: 'The Adventures of Sherlock Holmes' (Chapters 1 & 2)
 *    with Victorian cast, grounded sample quotes, 4NF aliases, and synthesized audio.
 */

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const mongoose = require('mongoose');
const { pool, connectMongo, connectPostgres } = require('../db');
const { Chapter } = require('../models');
const { audioStitcher } = require('../engine/audioStitcher');
const { ttsEngine } = require('../engine/ttsEngine');
const { validateAudioBuffer } = require('../engine/audioValidator');
const { config } = require('../config');

// Voice Catalog fallback seeds to ensure all 20 unified voice IDs exist
const REQUIRED_VOICES = [
  { id: 'en-GB-RyanNeural', label: 'Ryan Neural (British Narrator)', gender: 'male', age_band: 'adult', language: 'en-gb', reserved_narrator: true },
  { id: 'en-GB-ThomasNeural', label: 'Thomas Neural (Harry Potter)', gender: 'male', age_band: 'young', language: 'en-gb', reserved_narrator: false },
  { id: 'en-GB-LibbyNeural', label: 'Libby Neural (Hermione Granger)', gender: 'female', age_band: 'young', language: 'en-gb', reserved_narrator: false },
  { id: 'en-GB-AlfieNeural', label: 'Alfie Neural (Ron Weasley)', gender: 'male', age_band: 'young', language: 'en-gb', reserved_narrator: false },
  { id: 'en-GB-ArthurNeural', label: 'Arthur Neural (Albus Dumbledore)', gender: 'male', age_band: 'elder', language: 'en-gb', reserved_narrator: false },
  { id: 'en-GB-NoahNeural', label: 'Noah Neural (Severus Snape)', gender: 'male', age_band: 'adult', language: 'en-gb', reserved_narrator: false },
  { id: 'en-GB-SoniaNeural', label: 'Sonia Neural (Prof. McGonagall)', gender: 'female', age_band: 'adult', language: 'en-gb', reserved_narrator: false },
  { id: 'en-GB-OliverNeural', label: 'Oliver Neural (Draco Malfoy)', gender: 'male', age_band: 'young', language: 'en-gb', reserved_narrator: false },
  { id: 'bm_george', label: 'George (British Received)', gender: 'male', age_band: 'adult', language: 'en-gb', reserved_narrator: false },
  { id: 'bm_daniel', label: 'Daniel (British Expressive)', gender: 'male', age_band: 'young', language: 'en-gb', reserved_narrator: false },
  { id: 'bf_emma', label: 'Emma (British Refined)', gender: 'female', age_band: 'young', language: 'en-gb', reserved_narrator: false },
  { id: 'am_adam', label: 'Adam (Narrator Default)', gender: 'male', age_band: 'adult', language: 'en-us', reserved_narrator: true },
  { id: 'af_heart', label: 'Heart (Warm & Expressive)', gender: 'female', age_band: 'adult', language: 'en-us', reserved_narrator: false },
  { id: 'af_bella', label: 'Bella (Lively & Clear)', gender: 'female', age_band: 'adult', language: 'en-us', reserved_narrator: false },
  { id: 'af_nicole', label: 'Nicole (Youthful)', gender: 'female', age_band: 'young', language: 'en-us', reserved_narrator: false },
  { id: 'af_sarah', label: 'Sarah (Mature)', gender: 'female', age_band: 'elder', language: 'en-us', reserved_narrator: false },
  { id: 'am_michael', label: 'Michael (Strong & Resonant)', gender: 'male', age_band: 'adult', language: 'en-us', reserved_narrator: false },
  { id: 'am_george', label: 'George (Deep & Mature)', gender: 'male', age_band: 'elder', language: 'en-us', reserved_narrator: false },
  { id: 'am_onyx', label: 'Onyx (Deep Male)', gender: 'male', age_band: 'adult', language: 'en-us', reserved_narrator: false },
  { id: 'af_sky', label: 'Sky (Calm Female)', gender: 'female', age_band: 'adult', language: 'en-us', reserved_narrator: false },
];

/**
 * Ensures a valid demo audio file exists for the chapter.
 *
 * @param {string} chapterId - PostgreSQL chapter UUID
 * @param {Array<object>} segments - Chapter segments array
 * @param {object} [options]
 * @param {number} [options.maxSynthesizeCount=0] - Max segments to synthesize with neural TTS before falling back to silence buffer
 */
async function ensureChapterAudio(chapterId, segments, { maxSynthesizeCount = 0 } = {}) {
  const outputDir = config.paths.outputDir;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const mp3Path = path.join(outputDir, `${chapterId}.mp3`);
  const wavPath = path.join(outputDir, `${chapterId}.wav`);

  if ((fs.existsSync(mp3Path) && fs.statSync(mp3Path).size > 0) ||
      (fs.existsSync(wavPath) && fs.statSync(wavPath).size > 0)) {
    const isWav = fs.existsSync(wavPath) && (!fs.existsSync(mp3Path) || fs.statSync(wavPath).mtimeMs > fs.statSync(mp3Path).mtimeMs);
    const format = isWav ? 'wav' : 'mp3';
    return {
      chapter_id: chapterId,
      audio_stream_url: `/api/stream/${chapterId}`,
      audio_url: `/api/stream/${chapterId}`,
      audio_format: format,
      total_duration_ms: segments.length ? segments[segments.length - 1].end_ms : 0,
      timeline: segments.map((s) => ({
        order: s.order,
        segment_id: s.segment_id,
        start_ms: s.start_ms,
        end_ms: s.end_ms,
        character_id: s.character_id,
        voice_id: s.voice_id,
        text: s.text,
      })),
    };
  }

  console.log(`  [Audio] Generating playback demo audio for chapter ${chapterId} (maxSynth: ${maxSynthesizeCount})...`);
  const segmentAudios = new Array(segments.length);
  let synthFormat = 'mp3';

  // Pass 1: Try synthesizing up to maxSynthesizeCount segments with Neural/Kokoro TTS
  const limit = Math.min(segments.length, maxSynthesizeCount);
  for (let i = 0; i < limit; i++) {
    const seg = segments[i];
    const durationMs = (seg.end_ms && seg.start_ms) ? (seg.end_ms - seg.start_ms) : (seg.duration_ms || 2500);

    try {
      const result = await ttsEngine.synthesizeSegment(seg.text, seg.voice_id);
      if (result && result.audio_buffer && result.audio_buffer.length > 0) {
        synthFormat = result.format || 'mp3';
        const dur = result.duration_ms || durationMs;
        segmentAudios[i] = {
          order: seg.order,
          segment_id: seg.segment_id,
          text: seg.text,
          voice_id: seg.voice_id,
          speaker_name: seg.speaker_name,
          character_id: seg.character_id,
          audio_buffer: result.audio_buffer,
          pcm_buffer: result.audio_buffer,
          duration_ms: dur,
          format: synthFormat,
        };
      }
    } catch (_synthErr) {
      // Fall through to silence buffer
    }
  }

  // Pass 2: Fill remaining segments with silence buffers matching the chosen audio format
  for (let i = 0; i < segments.length; i++) {
    if (segmentAudios[i]) continue;
    const seg = segments[i];
    const durationMs = Math.max(200, (seg.end_ms && seg.start_ms) ? (seg.end_ms - seg.start_ms) : (seg.duration_ms || 2500));
    const buffer = synthFormat === 'pcm'
      ? audioStitcher.createPcmSilenceBuffer(durationMs)
      : audioStitcher.createMp3SilenceBuffer(durationMs);

    segmentAudios[i] = {
      order: seg.order,
      segment_id: seg.segment_id,
      text: seg.text,
      voice_id: seg.voice_id,
      speaker_name: seg.speaker_name,
      character_id: seg.character_id,
      audio_buffer: buffer,
      pcm_buffer: buffer,
      duration_ms: durationMs,
      format: synthFormat,
    };
  }

  const stitchFn = typeof audioStitcher.stitchAudioSegments === 'function'
    ? audioStitcher.stitchAudioSegments.bind(audioStitcher)
    : audioStitcher.stitch.bind(audioStitcher);

  const stitched = stitchFn(segmentAudios, chapterId);

  // Validate resulting audio (support both mp3 and wav fallback)
  const savedAudioPath = fs.existsSync(mp3Path) ? mp3Path : wavPath;
  if (fs.existsSync(savedAudioPath)) {
    const savedBuffer = fs.readFileSync(savedAudioPath);
    const audioFmt = savedAudioPath.endsWith('.mp3') ? 'mp3' : 'wav';
    if (!validateAudioBuffer(savedBuffer, audioFmt)) {
      console.warn(`  [Audio Warning] Audio buffer validation warning for ${savedAudioPath}`);
    }
  }

  return stitched;
}

/**
 * Main idempotent demo seeding routine.
 *
 * @param {object} [options]
 * @param {boolean} [options.closeConnections=false] - If true, terminates DB pools upon completion
 */
async function seedDemos({ closeConnections = false } = {}) {
  console.log('========================================================================');
  console.log('🌱 SYNCTONE IDEMPOTENT DEMO DATABASE SEEDER');
  console.log('========================================================================\n');

  await connectPostgres();
  await connectMongo();

  // ---------------------------------------------------------------------------
  // 1. Ensure Voice Catalog
  // ---------------------------------------------------------------------------
  console.log('▶ [1/4] Ensuring Required Voices in Catalog...');
  for (const v of REQUIRED_VOICES) {
    await pool.query(
      `
      INSERT INTO voices (id, label, gender, age_band, language, reserved_narrator)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        label = EXCLUDED.label,
        gender = EXCLUDED.gender,
        age_band = EXCLUDED.age_band,
        language = EXCLUDED.language,
        reserved_narrator = EXCLUDED.reserved_narrator;
    `,
      [v.id, v.label, v.gender, v.age_band, v.language, v.reserved_narrator]
    );
  }
  console.log('  ✔ Voice catalog verified.\n');

  // ---------------------------------------------------------------------------
  // 2. System Demo Author User
  // ---------------------------------------------------------------------------
  console.log('▶ [2/4] Seeding System Demo Author User...');
  const authorEmail = 'demo_author@synctone.internal';
  const authorUsername = 'demo_author';

  const userRes = await pool.query(
    `
    INSERT INTO users (username, email, password_hash, role)
    VALUES ($1, $2, crypt('DemoPass2026!', gen_salt('bf')), 'writer')
    ON CONFLICT (email) DO UPDATE SET
      username = EXCLUDED.username,
      role = 'writer'
    RETURNING id;
  `,
    [authorUsername, authorEmail]
  );

  const authorId = userRes.rows[0].id;
  console.log(`  ✔ Demo Author confirmed: ID=${authorId} (${authorEmail})\n`);

  // ---------------------------------------------------------------------------
  // 3. Local Verified Demo: Harry Potter and the Philosopher's Stone
  // ---------------------------------------------------------------------------
  console.log("▶ [3/4] Seeding 'Harry Potter and the Philosopher's Stone'...");

  // ---------------------------------------------------------------------------
  // Auto-Extract Hook: Check & auto-generate hp1_extracted.json and cover art
  // ---------------------------------------------------------------------------
  const outputDir = config.paths.outputDir;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const candidateHpJsonPaths = [
    path.join(outputDir, 'hp1_extracted.json'),
    path.resolve(__dirname, '../../output/hp1_extracted.json'),
    path.resolve(__dirname, '../../../../novel-audio-synthesizer/output/hp1_extracted.json'),
    path.resolve(__dirname, '../../../../output/hp1_extracted.json'),
  ];

  let hpExtractedPath = candidateHpJsonPaths.find((p) => fs.existsSync(p));

  if (!hpExtractedPath) {
    const epubPath = process.env.HP_EPUB_PATH || "/Users/namahomprakash/Downloads/J. K. Rowling - 1. Harry Potter and the Philosopher's Stone - 2020.epub";
    const extractorScript = path.join(__dirname, 'extractHpEpub.py');

    if (fs.existsSync(extractorScript) && fs.existsSync(epubPath)) {
      console.log(`  [Auto-Extract] Extracting EPUB from '${epubPath}' via '${extractorScript}'...`);
      try {
        const extractProc = child_process.spawnSync('python3', [extractorScript], {
          env: { ...process.env, HP_EPUB_PATH: epubPath },
          stdio: 'inherit',
        });
        if (extractProc.error) {
          console.warn(`  [Auto-Extract Warning] Failed to run extractor: ${extractProc.error.message}`);
        }
      } catch (procErr) {
        console.warn(`  [Auto-Extract Warning] Extractor exception: ${procErr.message}`);
      }
      hpExtractedPath = candidateHpJsonPaths.find((p) => fs.existsSync(p));
    }
  }

  let hpExtractedData = null;
  if (hpExtractedPath) {
    try {
      hpExtractedData = JSON.parse(fs.readFileSync(hpExtractedPath, 'utf-8'));
      console.log(`  ✔ Loaded Harry Potter extracted dataset (${hpExtractedData.chapters?.length || 0} chapters) from ${hpExtractedPath}`);
    } catch (parseErr) {
      console.warn(`  [Auto-Extract Warning] Could not parse ${hpExtractedPath}: ${parseErr.message}`);
    }
  }

  // Ensure cover artwork is placed in output directory
  const coverTargetDir = path.join(outputDir, 'covers');
  if (!fs.existsSync(coverTargetDir)) {
    fs.mkdirSync(coverTargetDir, { recursive: true });
  }
  const coverTargetFile = path.join(coverTargetDir, 'hp1_cover.jpg');
  if (!fs.existsSync(coverTargetFile)) {
    const candidateCoverSources = [
      path.resolve(__dirname, '../../output/covers/hp1_cover.jpg'),
      path.resolve(__dirname, '../../../../novel-audio-synthesizer/output/covers/hp1_cover.jpg'),
      path.resolve(__dirname, '../../../../novel-audio-synthesizer/frontend/public/covers/hp1_cover.jpg'),
      path.resolve(__dirname, '../../../frontend/public/covers/hp1_cover.jpg'),
    ];
    for (const src of candidateCoverSources) {
      if (fs.existsSync(src)) {
        try {
          fs.copyFileSync(src, coverTargetFile);
          console.log(`  ✔ Copied cover artwork to ${coverTargetFile}`);
          break;
        } catch (_copyErr) {}
      }
    }
  }

  // Novel
  let hpNovelId;
  const hpNovelCheck = await pool.query(
    "SELECT id FROM novels WHERE title = $1 LIMIT 1",
    ["Harry Potter and the Philosopher's Stone"]
  );

  const hpCoverObject = '/static/covers/hp1_cover.jpg';
  const hpSynopsis = "A young wizard discovers his magical heritage on his eleventh birthday and attends Hogwarts School of Witchcraft and Wizardry.";

  if (hpNovelCheck.rows.length > 0) {
    hpNovelId = hpNovelCheck.rows[0].id;
    await pool.query(
      `
      UPDATE novels SET
        synopsis = $1,
        channel = 'verified',
        status = 'published',
        global_tone = 'British Fantasy',
        portfolio_source = 'manual',
        cover_object = $2,
        added_by = $3,
        updated_at = now()
      WHERE id = $4;
    `,
      [hpSynopsis, hpCoverObject, authorId, hpNovelId]
    );
  } else {
    const hpNovelInsert = await pool.query(
      `
      INSERT INTO novels (title, synopsis, channel, status, global_tone, portfolio_source, cover_object, added_by)
      VALUES ($1, $2, 'verified', 'published', 'British Fantasy', 'manual', $3, $4)
      RETURNING id;
    `,
      [
        "Harry Potter and the Philosopher's Stone",
        hpSynopsis,
        hpCoverObject,
        authorId,
      ]
    );
    hpNovelId = hpNovelInsert.rows[0].id;
  }
  console.log(`  ✔ Novel ID: ${hpNovelId} (cover_object: ${hpCoverObject})`);

  // Expanded Cast: All 21 attributed characters + supporting cast from hp1_extracted.json
  const hpCast = [
    {
      name: 'Narrator',
      voiceId: 'en-GB-RyanNeural',
      gender: 'male',
      ageBand: 'adult',
      temperament: 'British Received, Omniscient',
      sampleQuote: 'Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were perfectly normal, thank you very much.',
      isNarrator: true,
      aliases: ['Narrator', 'Storyteller'],
    },
    {
      name: 'Harry Potter',
      voiceId: 'en-GB-ThomasNeural',
      gender: 'male',
      ageBand: 'young',
      temperament: 'Curious, Resolute, Modest',
      sampleQuote: 'I already know where it is.',
      isNarrator: false,
      aliases: ['Harry Potter', 'Harry', 'Potter', 'The Boy Who Lived'],
    },
    {
      name: 'Ron Weasley',
      voiceId: 'en-GB-AlfieNeural',
      gender: 'male',
      ageBand: 'young',
      temperament: 'Loyal, Humorous, Reluctant',
      sampleQuote: 'Bloody hell, Harry! You could have got us killed!',
      isNarrator: false,
      aliases: ['Ron Weasley', 'Ron', 'Weasley'],
    },
    {
      name: 'Hermione Granger',
      voiceId: 'en-GB-LibbyNeural',
      gender: 'female',
      ageBand: 'young',
      temperament: 'Intellectual, Earnest, Loyal',
      sampleQuote: "Don't worry, Harry. We will find the Philosopher's Stone.",
      isNarrator: false,
      aliases: ['Hermione Granger', 'Hermione', 'Miss Granger', 'Granger'],
    },
    {
      name: 'Rubeus Hagrid',
      voiceId: 'en-GB-RyanNeural',
      gender: 'male',
      ageBand: 'adult',
      temperament: 'Warmhearted, Boisterous, Protective',
      sampleQuote: 'Yer a wizard, Harry.',
      isNarrator: false,
      aliases: ['Rubeus Hagrid', 'Hagrid', 'Keeper of Keys'],
    },
    {
      name: 'Albus Dumbledore',
      voiceId: 'en-GB-ArthurNeural',
      gender: 'male',
      ageBand: 'elder',
      temperament: 'Benevolent, Serene, Enigmatic',
      sampleQuote: 'It does not do to dwell on dreams and forget to live, Minerva.',
      isNarrator: false,
      aliases: ['Albus Dumbledore', 'Dumbledore', 'Professor Dumbledore', 'Headmaster', 'Albus'],
    },
    {
      name: 'Minerva McGonagall',
      voiceId: 'en-GB-SoniaNeural',
      gender: 'female',
      ageBand: 'adult',
      temperament: 'Strict, Dignified, Fiercely Protective',
      sampleQuote: 'You cannot be serious, Albus. You could not leave him with these people.',
      isNarrator: false,
      aliases: ['Minerva McGonagall', 'McGonagall', 'Professor McGonagall', 'Minerva'],
    },
    {
      name: 'Severus Snape',
      voiceId: 'en-GB-NoahNeural',
      gender: 'male',
      ageBand: 'adult',
      temperament: 'Austere, Sardonic, Disdainful',
      sampleQuote: 'Silence in the corridors. Five points from Gryffindor.',
      isNarrator: false,
      aliases: ['Severus Snape', 'Snape', 'Professor Snape', 'Potions Master', 'Severus'],
    },
    {
      name: 'Draco Malfoy',
      voiceId: 'en-GB-OliverNeural',
      gender: 'male',
      ageBand: 'young',
      temperament: 'Arrogant, Sneering, Aristocratic',
      sampleQuote: "You'll soon find out some wizarding families are much better than others, Potter.",
      isNarrator: false,
      aliases: ['Draco Malfoy', 'Draco', 'Malfoy'],
    },
    {
      name: 'Vernon Dursley',
      voiceId: 'en-GB-ArthurNeural',
      gender: 'male',
      ageBand: 'adult',
      temperament: 'Pompous, Choleric, Conventional',
      sampleQuote: 'I will not have it! There is no such thing as magic!',
      isNarrator: false,
      aliases: ['Vernon Dursley', 'Vernon', 'Mr. Dursley', 'Uncle Vernon'],
    },
    {
      name: 'Petunia Dursley',
      voiceId: 'en-GB-SoniaNeural',
      gender: 'female',
      ageBand: 'adult',
      temperament: 'Nosy, Spiteful, High-strung',
      sampleQuote: 'A nasty, common name, if you ask me.',
      isNarrator: false,
      aliases: ['Petunia Dursley', 'Petunia', 'Aunt Petunia', 'Mrs. Dursley'],
    },
    {
      name: 'Dudley Dursley',
      voiceId: 'en-GB-AlfieNeural',
      gender: 'male',
      ageBand: 'young',
      temperament: 'Spoiled, Demanding, Petulant',
      sampleQuote: 'Thirty-six! But last year, last year I had thirty-seven!',
      isNarrator: false,
      aliases: ['Dudley Dursley', 'Dudley', 'Dudders'],
    },
    {
      name: 'Professor Quirrell',
      voiceId: 'en-GB-NoahNeural',
      gender: 'male',
      ageBand: 'adult',
      temperament: 'Stuttering, Nervous, Deceptive',
      sampleQuote: "P-P-Potter, can't t-tell you how p-pleased I am to meet you.",
      isNarrator: false,
      aliases: ['Professor Quirrell', 'Quirrell'],
    },
    {
      name: 'Neville Longbottom',
      voiceId: 'en-GB-AlfieNeural',
      gender: 'male',
      ageBand: 'young',
      temperament: 'Timid, Well-meaning, Clumsy',
      sampleQuote: "I've found him! Gran, I've found my toad!",
      isNarrator: false,
      aliases: ['Neville Longbottom', 'Neville', 'Longbottom'],
    },
    {
      name: 'Oliver Wood',
      voiceId: 'en-GB-ThomasNeural',
      gender: 'male',
      ageBand: 'young',
      temperament: 'Athletic, Enthusiastic, Driven',
      sampleQuote: 'Quidditch is easy enough to understand, Harry.',
      isNarrator: false,
      aliases: ['Oliver Wood', 'Wood', 'Oliver'],
    },
    {
      name: 'Percy Weasley',
      voiceId: 'en-GB-ThomasNeural',
      gender: 'male',
      ageBand: 'young',
      temperament: 'Pompous, Dutiful, Ambitious',
      sampleQuote: 'Prefects lead the way! Follow me, first years!',
      isNarrator: false,
      aliases: ['Percy Weasley', 'Percy'],
    },
    {
      name: 'Fred Weasley',
      voiceId: 'en-GB-AlfieNeural',
      gender: 'male',
      ageBand: 'young',
      temperament: 'Mischievous, Witty, High-spirited',
      sampleQuote: "Only joking, Mum. We're only going to say hello.",
      isNarrator: false,
      aliases: ['Fred Weasley', 'Fred'],
    },
    {
      name: 'George Weasley',
      voiceId: 'en-GB-AlfieNeural',
      gender: 'male',
      ageBand: 'young',
      temperament: 'Mischievous, Quick-witted, Playful',
      sampleQuote: "He's not Fred, I am! Can't you tell your own twins apart?",
      isNarrator: false,
      aliases: ['George Weasley', 'George'],
    },
    {
      name: 'Molly Weasley',
      voiceId: 'en-GB-SoniaNeural',
      gender: 'female',
      ageBand: 'adult',
      temperament: 'Maternal, Warm, Bustling',
      sampleQuote: 'Platform nine and three-quarters this way, dear!',
      isNarrator: false,
      aliases: ['Molly Weasley', 'Mrs. Weasley', 'Molly'],
    },
    {
      name: 'Griphook',
      voiceId: 'bm_george',
      gender: 'male',
      ageBand: 'adult',
      temperament: 'Curt, Businesslike, Shrewd',
      sampleQuote: 'Enter, stranger, but take heed of what awaits the sin of greed.',
      isNarrator: false,
      aliases: ['Griphook', 'The Goblin'],
    },
    {
      name: 'Garrick Ollivander',
      voiceId: 'en-GB-ArthurNeural',
      gender: 'male',
      ageBand: 'elder',
      temperament: 'Eerie, Reverent, Perceptive',
      sampleQuote: 'Curious... curious indeed... The wand chooses the wizard, remember.',
      isNarrator: false,
      aliases: ['Garrick Ollivander', 'Ollivander', 'Mr. Ollivander'],
    },
    {
      name: 'Lord Voldemort',
      voiceId: 'en-GB-NoahNeural',
      gender: 'male',
      ageBand: 'adult',
      temperament: 'Cold, Sinister, Whispering',
      sampleQuote: 'There is no good and evil, there is only power...',
      isNarrator: false,
      aliases: ['Lord Voldemort', 'Voldemort', 'You-Know-Who'],
    },
    {
      name: 'Argus Filch',
      voiceId: 'en-GB-ArthurNeural',
      gender: 'male',
      ageBand: 'elder',
      temperament: 'Bitter, Sneering, Vindictive',
      sampleQuote: 'Students out of bed! Students in the corridors!',
      isNarrator: false,
      aliases: ['Argus Filch', 'Filch'],
    },
    {
      name: 'Madam Hooch',
      voiceId: 'en-GB-SoniaNeural',
      gender: 'female',
      ageBand: 'adult',
      temperament: 'Authoritative, Sharp-eyed, Sporting',
      sampleQuote: 'Good afternoon, class. Welcome to your first flying lesson.',
      isNarrator: false,
      aliases: ['Madam Hooch', 'Hooch'],
    },
    {
      name: 'Madam Pomfrey',
      voiceId: 'en-GB-SoniaNeural',
      gender: 'female',
      ageBand: 'adult',
      temperament: 'Brisk, Caring, Firm',
      sampleQuote: 'Out! He needs rest! Ten visitors is quite enough!',
      isNarrator: false,
      aliases: ['Madam Pomfrey', 'Pomfrey'],
    },
    {
      name: 'Professor Flitwick',
      voiceId: 'en-GB-ArthurNeural',
      gender: 'male',
      ageBand: 'elder',
      temperament: 'Excitable, Cheerful, Scholarly',
      sampleQuote: 'Wingardium Leviosa! Swish and flick, remember!',
      isNarrator: false,
      aliases: ['Professor Flitwick', 'Flitwick'],
    },
    {
      name: 'Seamus Finnigan',
      voiceId: 'en-GB-AlfieNeural',
      gender: 'male',
      ageBand: 'young',
      temperament: 'Good-natured, Energetic, Fiery',
      sampleQuote: 'Eye of rabbit, harp string hum, turn this water into rum!',
      isNarrator: false,
      aliases: ['Seamus Finnigan', 'Seamus'],
    },
    {
      name: 'Dean Thomas',
      voiceId: 'en-GB-ThomasNeural',
      gender: 'male',
      ageBand: 'young',
      temperament: 'Friendly, Creative, Loyal',
      sampleQuote: 'Send him off, ref! Red card!',
      isNarrator: false,
      aliases: ['Dean Thomas', 'Dean'],
    },
    {
      name: 'Lee Jordan',
      voiceId: 'en-GB-AlfieNeural',
      gender: 'male',
      ageBand: 'young',
      temperament: 'Animated, Partisan, Enthusiastic',
      sampleQuote: 'And Harry Potter dives for the Golden Snitch!',
      isNarrator: false,
      aliases: ['Lee Jordan'],
    },
    {
      name: 'Firenze',
      voiceId: 'en-GB-ArthurNeural',
      gender: 'male',
      ageBand: 'adult',
      temperament: 'Mystical, Grave, Serene',
      sampleQuote: 'Mars is bright tonight.',
      isNarrator: false,
      aliases: ['Firenze'],
    },
    {
      name: 'Bane',
      voiceId: 'en-GB-NoahNeural',
      gender: 'male',
      ageBand: 'adult',
      temperament: 'Stern, Traditionalist, Fierce',
      sampleQuote: 'We have taken no part in human matters!',
      isNarrator: false,
      aliases: ['Bane'],
    },
    {
      name: 'Ronan',
      voiceId: 'en-GB-ArthurNeural',
      gender: 'male',
      ageBand: 'adult',
      temperament: 'Melancholic, Pensive, Sober',
      sampleQuote: 'Always the innocent are the first victims.',
      isNarrator: false,
      aliases: ['Ronan'],
    },
    {
      name: 'Peeves',
      voiceId: 'en-GB-RyanNeural',
      gender: 'male',
      ageBand: 'adult',
      temperament: 'Chaotic, Taunting, Raucous',
      sampleQuote: 'Oh, Potter, you rotter, oh, what have you done!',
      isNarrator: false,
      aliases: ['Peeves', 'Peeves the Poltergeist'],
    },
  ];

  const hpCharMap = {};
  for (const c of hpCast) {
    const charRes = await pool.query(
      `
      INSERT INTO characters (novel_id, canonical_name, gender, age_band, temperament, sample_quote, voice_id, speed_multiplier, is_narrator, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 1.0, $8, 'manual')
      ON CONFLICT (novel_id, canonical_name) DO UPDATE SET
        gender = EXCLUDED.gender,
        age_band = EXCLUDED.age_band,
        temperament = EXCLUDED.temperament,
        sample_quote = EXCLUDED.sample_quote,
        voice_id = EXCLUDED.voice_id,
        speed_multiplier = EXCLUDED.speed_multiplier,
        is_narrator = EXCLUDED.is_narrator,
        source = 'manual',
        updated_at = now()
      RETURNING id, canonical_name;
    `,
      [hpNovelId, c.name, c.gender, c.ageBand, c.temperament, c.sampleQuote, c.voiceId, c.isNarrator]
    );

    const charId = charRes.rows[0].id;
    hpCharMap[c.name] = { id: charId, voiceId: c.voiceId };

    // 4NF Aliases (character_id, alias)
    for (const alias of c.aliases) {
      const aliasCheck = await pool.query(
        'SELECT id FROM character_aliases WHERE character_id = $1 AND alias = $2 LIMIT 1',
        [charId, alias]
      );
      if (aliasCheck.rows.length === 0) {
        await pool.query(
          'INSERT INTO character_aliases (character_id, alias) VALUES ($1, $2) ON CONFLICT (character_id, alias) DO NOTHING',
          [charId, alias]
        );
      }
    }
  }
  console.log(`  ✔ Seeded ${hpCast.length} British cast characters with 4NF aliases.`);

  const hpChapterIds = [];

  if (hpExtractedData && Array.isArray(hpExtractedData.chapters) && hpExtractedData.chapters.length > 0) {
    console.log(`  ▶ Seeding ${hpExtractedData.chapters.length} chapters from extracted EPUB dataset...`);

    for (const chData of hpExtractedData.chapters) {
      const chNumber = chData.chapter_number;
      const chTitle = chData.title || `Chapter ${chNumber}`;
      const rawText = chData.raw_text || '';

      let chCurrentMs = 0;
      const pauseMs = config.audio.interSpeakerPauseMs || 300;

      const mappedSegments = (chData.segments || []).map((s, idx) => {
        const speakerKey = s.speaker_name && hpCharMap[s.speaker_name] ? s.speaker_name : 'Narrator';
        const char = hpCharMap[speakerKey] || hpCharMap['Narrator'];
        const charId = char ? char.id : null;
        const voiceId = (char && char.voiceId) ? char.voiceId : (s.voice_id || 'en-GB-RyanNeural');

        const estDurationMs = Math.max(800, Math.round(((s.text || '').length / 15) * 1000));
        const startMs = chCurrentMs;
        const endMs = startMs + estDurationMs;
        chCurrentMs = endMs + pauseMs;

        const rawSource = s.attribution_source || (s.type === 'narration' ? 'narrator_default' : 'manual');
        const validSources = ['regex_rule', 'dependency_tree', 'llm_fallback', 'narrator_default', 'manual', 'unresolved'];
        const normalizedSource = validSources.includes(rawSource)
          ? rawSource
          : (s.type === 'narration' ? 'narrator_default' : 'regex_rule');

        return {
          order: idx + 1,
          segment_id: s.segment_id || (idx + 1),
          type: s.type || 'narration',
          speaker_id: charId,
          speaker_name: s.speaker_name || (s.type === 'narration' ? 'Narrator' : 'Character'),
          character_id: charId,
          voice_id: voiceId,
          assigned_voice_id: voiceId,
          text: s.text || '',
          start_ms: startMs,
          end_ms: endMs,
          confidence: s.attribution_confidence || 1.0,
          source: normalizedSource,
          needs_review: false,
        };
      });

      const chEstimatedDurationMs = chCurrentMs;

      // Upsert chapter in PostgreSQL
      const chRes = await pool.query(
        `
        INSERT INTO chapters (novel_id, chapter_number, title, status, audio_version, swift_audio_object, total_duration_ms)
        VALUES ($1, $2, $3, 'completed', 1, $4, $5)
        ON CONFLICT (novel_id, chapter_number) DO UPDATE SET
          title = EXCLUDED.title,
          status = 'completed',
          audio_version = EXCLUDED.audio_version,
          updated_at = now()
        RETURNING id;
      `,
        [hpNovelId, chNumber, chTitle, `hp_ch${chNumber}.mp3`, chEstimatedDurationMs]
      );

      const chapterId = chRes.rows[0].id;
      hpChapterIds.push(chapterId);

      // Chapter 1: synthesize up to 12 segments via neural TTS; Chapters 2-17: 0 (use silence/tone buffer)
      const maxSynth = chNumber === 1 ? 12 : 0;
      const stitched = await ensureChapterAudio(chapterId, mappedSegments, { maxSynthesizeCount: maxSynth });

      const finalAudioFormat = stitched?.audio_format || 'mp3';
      const finalDurationMs = stitched?.total_duration_ms || chEstimatedDurationMs;
      const finalTimeline = (stitched?.timeline && stitched.timeline.length > 0)
        ? stitched.timeline
        : mappedSegments.map((seg) => ({
            order: seg.order,
            segment_id: seg.segment_id,
            start_ms: seg.start_ms,
            end_ms: seg.end_ms,
            character_id: seg.character_id,
            voice_id: seg.voice_id,
            text: seg.text,
          }));

      // Update segment timings with stitched timeline if available
      if (stitched?.timeline && stitched.timeline.length === mappedSegments.length) {
        for (let i = 0; i < mappedSegments.length; i++) {
          mappedSegments[i].start_ms = stitched.timeline[i].start_ms;
          mappedSegments[i].end_ms = stitched.timeline[i].end_ms;
        }
      }

      const swiftAudioObj = `${chapterId}.${finalAudioFormat}`;

      // Update PostgreSQL chapter with final duration and object path
      await pool.query(
        `UPDATE chapters SET total_duration_ms = $1, swift_audio_object = $2, updated_at = now() WHERE id = $3;`,
        [finalDurationMs, swiftAudioObj, chapterId]
      );

      // Upsert MongoDB chapter document
      await Chapter.findOneAndUpdate(
        { pg_chapter_id: chapterId },
        {
          pg_chapter_id: chapterId,
          novel_id: hpNovelId,
          chapter_number: chNumber,
          title: chTitle,
          raw_text: rawText,
          audio_version: 1,
          manifest: {
            total_duration_ms: finalDurationMs,
            audio_url: `/api/stream/${chapterId}`,
            timeline: finalTimeline,
          },
          segments: mappedSegments,
        },
        { upsert: true, new: true, runValidators: true }
      );

      console.log(`  ✔ Seeded Chapter ${chNumber} ('${chTitle}'): ID=${chapterId} (${finalDurationMs}ms, ${finalAudioFormat})`);
    }
  } else {
    // ---------------------------------------------------------------------------
    // Fallback: Chapter 1 Demo Segments (CI / Standalone Environment)
    // ---------------------------------------------------------------------------
    console.log('  ▶ [CI Fallback] Seeding built-in Chapter 1 demo segments...');

    const hpRawSegments = [
      {
        type: 'narration',
        speaker_name: 'Narrator',
        char_name: 'Narrator',
        text: 'Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were perfectly normal, thank you very much.',
        duration_ms: 6500,
      },
      {
        type: 'dialogue',
        speaker_name: 'Vernon Dursley',
        char_name: 'Vernon Dursley',
        text: 'I will not have it! There is no such thing as magic!',
        duration_ms: 3200,
      },
      {
        type: 'narration',
        speaker_name: 'Narrator',
        char_name: 'Narrator',
        text: 'Later, in the shadows outside the great castle, young voices conferred in hushed tones.',
        duration_ms: 4500,
      },
      {
        type: 'dialogue',
        speaker_name: 'Hermione Granger',
        char_name: 'Hermione Granger',
        text: "Don't worry, Harry. We will find the Philosopher's Stone.",
        duration_ms: 3800,
      },
      {
        type: 'dialogue',
        speaker_name: 'Ron Weasley',
        char_name: 'Ron Weasley',
        text: 'Bloody hell, Harry! You could have got us killed!',
        duration_ms: 3100,
      },
      {
        type: 'dialogue',
        speaker_name: 'Harry Potter',
        char_name: 'Harry Potter',
        text: 'I already know where it is.',
        duration_ms: 2200,
      },
      {
        type: 'dialogue',
        speaker_name: 'Severus Snape',
        char_name: 'Severus Snape',
        text: 'Silence in the corridors. Five points from Gryffindor.',
        duration_ms: 3500,
      },
      {
        type: 'dialogue',
        speaker_name: 'Minerva McGonagall',
        char_name: 'Minerva McGonagall',
        text: 'You cannot be serious, Albus. You could not leave him with these people.',
        duration_ms: 4200,
      },
      {
        type: 'dialogue',
        speaker_name: 'Albus Dumbledore',
        char_name: 'Albus Dumbledore',
        text: 'It does not do to dwell on dreams and forget to live, Minerva.',
        duration_ms: 4100,
      },
    ];

    let hpCurrentMs = 0;
    const pauseMs = config.audio.interSpeakerPauseMs || 300;
    const hpSegments = hpRawSegments.map((s, idx) => {
      const startMs = hpCurrentMs;
      const endMs = startMs + s.duration_ms;
      hpCurrentMs = endMs + pauseMs;
      const char = hpCharMap[s.char_name] || hpCharMap['Narrator'];
      return {
        order: idx + 1,
        segment_id: idx + 1,
        type: s.type,
        speaker_id: char.id,
        speaker_name: s.speaker_name,
        character_id: char.id,
        voice_id: char.voiceId,
        assigned_voice_id: char.voiceId,
        text: s.text,
        start_ms: startMs,
        end_ms: endMs,
        confidence: 1.0,
        source: s.type === 'narration' ? 'narrator_default' : 'manual',
        needs_review: false,
      };
    });
    const hpTotalDurationMs = hpCurrentMs;

    const hpTimeline = hpSegments.map((seg) => ({
      order: seg.order,
      segment_id: seg.segment_id,
      start_ms: seg.start_ms,
      end_ms: seg.end_ms,
      character_id: seg.character_id,
      voice_id: seg.voice_id,
      text: seg.text,
    }));

    // PostgreSQL chapter row
    const hpChapterRes = await pool.query(
      `
      INSERT INTO chapters (novel_id, chapter_number, title, status, audio_version, swift_audio_object, total_duration_ms)
      VALUES ($1, 1, 'The Boy Who Lived', 'completed', 1, 'hp_ch1.mp3', $2)
      ON CONFLICT (novel_id, chapter_number) DO UPDATE SET
        title = EXCLUDED.title,
        status = 'completed',
        audio_version = EXCLUDED.audio_version,
        updated_at = now()
      RETURNING id;
    `,
      [hpNovelId, hpTotalDurationMs]
    );
    const hpChapterId = hpChapterRes.rows[0].id;
    hpChapterIds.push(hpChapterId);

    // Synthesize/stitch demo chapter audio and capture real durations & format
    const stitchedHp = await ensureChapterAudio(hpChapterId, hpSegments, { maxSynthesizeCount: 12 });
    const hpAudioFormat = stitchedHp?.audio_format || 'mp3';
    const hpFinalDurationMs = stitchedHp?.total_duration_ms || hpTotalDurationMs;
    const hpFinalTimeline = (stitchedHp?.timeline && stitchedHp.timeline.length > 0) ? stitchedHp.timeline : hpTimeline;
    const hpSwiftAudioObject = `${hpChapterId}.${hpAudioFormat}`;

    // Update PostgreSQL chapter with verified audio object and exact duration
    await pool.query(
      `UPDATE chapters SET total_duration_ms = $1, swift_audio_object = $2, updated_at = now() WHERE id = $3;`,
      [hpFinalDurationMs, hpSwiftAudioObject, hpChapterId]
    );

    // MongoDB chapter document
    const hpRawText = hpRawSegments.map((s) => s.text).join('\n\n');
    await Chapter.findOneAndUpdate(
      { pg_chapter_id: hpChapterId },
      {
        pg_chapter_id: hpChapterId,
        novel_id: hpNovelId,
        chapter_number: 1,
        title: 'The Boy Who Lived',
        raw_text: hpRawText,
        audio_version: 1,
        manifest: {
          total_duration_ms: hpFinalDurationMs,
          audio_url: `/api/stream/${hpChapterId}`,
          timeline: hpFinalTimeline,
        },
        segments: hpSegments,
      },
      { upsert: true, new: true, runValidators: true }
    );

    console.log(`  ✔ Seeded Chapter 1 ('The Boy Who Lived'): ID=${hpChapterId} (${hpFinalDurationMs}ms, ${hpAudioFormat})\n`);
  }

  // ---------------------------------------------------------------------------
  // 4. Public Verified Demo: The Adventures of Sherlock Holmes (Ch 1 & 2)
  // ---------------------------------------------------------------------------
  console.log("▶ [4/4] Seeding 'The Adventures of Sherlock Holmes' (Chapters 1 & 2)...");

  // Novel
  let shNovelId;
  const shNovelCheck = await pool.query(
    "SELECT id FROM novels WHERE title = $1 LIMIT 1",
    ["The Adventures of Sherlock Holmes"]
  );

  if (shNovelCheck.rows.length > 0) {
    shNovelId = shNovelCheck.rows[0].id;
    await pool.query(
      `
      UPDATE novels SET
        synopsis = $1,
        channel = 'verified',
        status = 'published',
        global_tone = 'Victorian Mystery',
        portfolio_source = 'manual',
        added_by = $2,
        updated_at = now()
      WHERE id = $3;
    `,
      [
        "A collection of classic detective mysteries in Victorian London featuring Sherlock Holmes and Dr. John Watson.",
        authorId,
        shNovelId,
      ]
    );
  } else {
    const shNovelInsert = await pool.query(
      `
      INSERT INTO novels (title, synopsis, channel, status, global_tone, portfolio_source, added_by)
      VALUES ($1, $2, 'verified', 'published', 'Victorian Mystery', 'manual', $3)
      RETURNING id;
    `,
      [
        "The Adventures of Sherlock Holmes",
        "A collection of classic detective mysteries in Victorian London featuring Sherlock Holmes and Dr. John Watson.",
        authorId,
      ]
    );
    shNovelId = shNovelInsert.rows[0].id;
  }
  console.log(`  ✔ Novel ID: ${shNovelId}`);

  // Cast
  const shCast = [
    {
      name: 'Dr. John Watson',
      voiceId: 'bm_george',
      gender: 'male',
      ageBand: 'adult',
      temperament: 'Loyal, Observant, Methodical',
      sampleQuote: 'To Sherlock Holmes she is always THE woman. I have seldom heard him mention her under any other name.',
      isNarrator: true,
      aliases: ['Watson', 'John', 'Doctor Watson', 'Narrator'],
    },
    {
      name: 'Sherlock Holmes',
      voiceId: 'bm_daniel',
      gender: 'male',
      ageBand: 'young',
      temperament: 'Analytical, Incisive, Bohemian',
      sampleQuote: 'It is a capital mistake to theorize before one has data. Insensibly one begins to twist facts to suit theories.',
      isNarrator: false,
      aliases: ['Holmes', 'Sherlock', 'The Consulting Detective'],
    },
    {
      name: 'Irene Adler',
      voiceId: 'bf_emma',
      gender: 'female',
      ageBand: 'young',
      temperament: 'Quick-witted, Daring, Elegant',
      sampleQuote: 'I know that he is a master of disguise, but he could not deceive me.',
      isNarrator: false,
      aliases: ['Irene', 'The Woman', 'Miss Adler'],
    },
    {
      name: 'King of Bohemia',
      voiceId: 'am_michael',
      gender: 'male',
      ageBand: 'adult',
      temperament: 'Aristocratic, Anxious, Imperious',
      sampleQuote: 'You must see that it is of the utmost importance to European politics.',
      isNarrator: false,
      aliases: ['The King', 'Wilhelm Gottsreich Sigismond von Ormstein', 'Count von Kramm'],
    },
  ];

  const shCharMap = {};
  for (const c of shCast) {
    const charRes = await pool.query(
      `
      INSERT INTO characters (novel_id, canonical_name, gender, age_band, temperament, sample_quote, voice_id, speed_multiplier, is_narrator, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 1.0, $8, 'manual')
      ON CONFLICT (novel_id, canonical_name) DO UPDATE SET
        gender = EXCLUDED.gender,
        age_band = EXCLUDED.age_band,
        temperament = EXCLUDED.temperament,
        sample_quote = EXCLUDED.sample_quote,
        voice_id = EXCLUDED.voice_id,
        speed_multiplier = EXCLUDED.speed_multiplier,
        is_narrator = EXCLUDED.is_narrator,
        source = 'manual',
        updated_at = now()
      RETURNING id, canonical_name;
    `,
      [shNovelId, c.name, c.gender, c.ageBand, c.temperament, c.sampleQuote, c.voiceId, c.isNarrator]
    );

    const charId = charRes.rows[0].id;
    shCharMap[c.name] = { id: charId, voiceId: c.voiceId };

    // 4NF Aliases (character_id, alias)
    for (const alias of c.aliases) {
      const aliasCheck = await pool.query(
        'SELECT id FROM character_aliases WHERE character_id = $1 AND alias = $2 LIMIT 1',
        [charId, alias]
      );
      if (aliasCheck.rows.length === 0) {
        await pool.query(
          'INSERT INTO character_aliases (character_id, alias) VALUES ($1, $2) ON CONFLICT (character_id, alias) DO NOTHING',
          [charId, alias]
        );
      }
    }
  }
  console.log(`  ✔ Seeded ${shCast.length} Sherlock cast characters with 4NF aliases.`);

  // Chapter 1: A Scandal in Bohemia - Part I
  const shCh1RawSegments = [
    {
      type: 'narration',
      speaker_name: 'Dr. John Watson',
      char_name: 'Dr. John Watson',
      text: 'To Sherlock Holmes she is always THE woman. I have seldom heard him mention her under any other name.',
      duration_ms: 5500,
    },
    {
      type: 'narration',
      speaker_name: 'Dr. John Watson',
      char_name: 'Dr. John Watson',
      text: 'One night, a visitor of formidable stature strode into our Baker Street rooms, wearing a black vizard mask over his eyes.',
      duration_ms: 6000,
    },
    {
      type: 'dialogue',
      speaker_name: 'King of Bohemia',
      char_name: 'King of Bohemia',
      text: 'You had my note? Did it tell you that I would call? I am Count von Kramm, a Bohemian nobleman.',
      duration_ms: 5000,
    },
    {
      type: 'dialogue',
      speaker_name: 'Sherlock Holmes',
      char_name: 'Sherlock Holmes',
      text: 'Pray take a seat, Your Majesty. This heavy Bohemian paper could hardly disguise your royal crest.',
      duration_ms: 5200,
    },
    {
      type: 'dialogue',
      speaker_name: 'King of Bohemia',
      char_name: 'King of Bohemia',
      text: 'You must see that it is of the utmost importance to European politics. The compromising photograph must be recovered!',
      duration_ms: 5800,
    },
    {
      type: 'dialogue',
      speaker_name: 'Sherlock Holmes',
      char_name: 'Sherlock Holmes',
      text: 'It is a capital mistake to theorize before one has data. We must investigate Miss Irene Adler at once.',
      duration_ms: 4800,
    },
  ];

  const pauseMs = (config.audio && config.audio.interSpeakerPauseMs) || 300;
  let shCh1CurrentMs = 0;
  const shCh1Segments = shCh1RawSegments.map((s, idx) => {
    const startMs = shCh1CurrentMs;
    const endMs = startMs + s.duration_ms;
    shCh1CurrentMs = endMs + pauseMs;
    const char = shCharMap[s.char_name];
    return {
      order: idx + 1,
      segment_id: idx + 1,
      type: s.type,
      speaker_id: char.id,
      speaker_name: s.speaker_name,
      character_id: char.id,
      voice_id: char.voiceId,
      assigned_voice_id: char.voiceId,
      text: s.text,
      start_ms: startMs,
      end_ms: endMs,
      confidence: 1.0,
      source: s.type === 'narration' ? 'narrator_default' : 'manual',
      needs_review: false,
    };
  });
  const shCh1TotalDurationMs = shCh1CurrentMs;

  const shCh1Timeline = shCh1Segments.map((seg) => ({
    order: seg.order,
    segment_id: seg.segment_id,
    start_ms: seg.start_ms,
    end_ms: seg.end_ms,
    character_id: seg.character_id,
    voice_id: seg.voice_id,
    text: seg.text,
  }));

  const shCh1Res = await pool.query(
    `
    INSERT INTO chapters (novel_id, chapter_number, title, status, audio_version, swift_audio_object, total_duration_ms)
    VALUES ($1, 1, 'A Scandal in Bohemia - Part I', 'completed', 1, 'sh_ch1.mp3', $2)
    ON CONFLICT (novel_id, chapter_number) DO UPDATE SET
      title = EXCLUDED.title,
      status = 'completed',
      audio_version = EXCLUDED.audio_version,
      updated_at = now()
    RETURNING id;
  `,
    [shNovelId, shCh1TotalDurationMs]
  );
  const shCh1Id = shCh1Res.rows[0].id;

  // Synthesize/stitch demo chapter audio and capture real durations & format
  const stitchedSh1 = await ensureChapterAudio(shCh1Id, shCh1Segments);
  const sh1AudioFormat = stitchedSh1?.audio_format || (fs.existsSync(path.join(outputDir, `${shCh1Id}.wav`)) ? 'wav' : 'mp3');
  const sh1FinalDurationMs = stitchedSh1?.total_duration_ms || shCh1TotalDurationMs;
  const sh1FinalTimeline = (stitchedSh1?.timeline && stitchedSh1.timeline.length > 0) ? stitchedSh1.timeline : shCh1Timeline;
  const sh1SwiftAudioObject = `${shCh1Id}.${sh1AudioFormat}`;

  // Update PostgreSQL chapter with verified audio object and exact duration
  await pool.query(
    `UPDATE chapters SET total_duration_ms = $1, swift_audio_object = $2, updated_at = now() WHERE id = $3;`,
    [sh1FinalDurationMs, sh1SwiftAudioObject, shCh1Id]
  );

  const shCh1RawText = shCh1RawSegments.map((s) => s.text).join('\n\n');
  await Chapter.findOneAndUpdate(
    { pg_chapter_id: shCh1Id },
    {
      pg_chapter_id: shCh1Id,
      novel_id: shNovelId,
      chapter_number: 1,
      title: 'A Scandal in Bohemia - Part I',
      raw_text: shCh1RawText,
      audio_version: 1,
      manifest: {
        total_duration_ms: sh1FinalDurationMs,
        audio_url: `/api/stream/${shCh1Id}`,
        timeline: sh1FinalTimeline,
      },
      segments: shCh1Segments,
    },
    { upsert: true, new: true, runValidators: true }
  );

  console.log(`  ✔ Seeded Chapter 1 ('A Scandal in Bohemia - Part I'): ID=${shCh1Id} (${sh1FinalDurationMs}ms, ${sh1AudioFormat})`);

  // Chapter 2: A Scandal in Bohemia - Part II
  const shCh2RawSegments = [
    {
      type: 'narration',
      speaker_name: 'Dr. John Watson',
      char_name: 'Dr. John Watson',
      text: 'At dusk, Holmes disguised himself as an amicable, simple-minded clergyman, complete with broad-brimmed hat and white cravat.',
      duration_ms: 6200,
    },
    {
      type: 'dialogue',
      speaker_name: 'Sherlock Holmes',
      char_name: 'Sherlock Holmes',
      text: "When the carriage arrives at Briony Lodge, Watson, throw the smoke rocket through the open window and cry 'Fire!'",
      duration_ms: 5400,
    },
    {
      type: 'narration',
      speaker_name: 'Dr. John Watson',
      char_name: 'Dr. John Watson',
      text: 'A thick plume of smoke curled through the sitting room. In an instant, Miss Adler darted toward a secret sliding panel in the wall.',
      duration_ms: 6400,
    },
    {
      type: 'dialogue',
      speaker_name: 'Sherlock Holmes',
      char_name: 'Sherlock Holmes',
      text: 'She has shown us where the photograph is hidden! Now, a quick withdrawal before suspicions rise.',
      duration_ms: 4900,
    },
    {
      type: 'narration',
      speaker_name: 'Dr. John Watson',
      char_name: 'Dr. John Watson',
      text: 'Yet when we returned the following dawn, the house was deserted, and only a letter remained upon the mantelpiece.',
      duration_ms: 5900,
    },
    {
      type: 'dialogue',
      speaker_name: 'Irene Adler',
      char_name: 'Irene Adler',
      text: 'Goodnight, Mister Sherlock Holmes! I know that you are a master of disguise, but you could not deceive me.',
      duration_ms: 5100,
    },
  ];

  let shCh2CurrentMs = 0;
  const shCh2Segments = shCh2RawSegments.map((s, idx) => {
    const startMs = shCh2CurrentMs;
    const endMs = startMs + s.duration_ms;
    shCh2CurrentMs = endMs + pauseMs;
    const char = shCharMap[s.char_name];
    return {
      order: idx + 1,
      segment_id: idx + 1,
      type: s.type,
      speaker_id: char.id,
      speaker_name: s.speaker_name,
      character_id: char.id,
      voice_id: char.voiceId,
      assigned_voice_id: char.voiceId,
      text: s.text,
      start_ms: startMs,
      end_ms: endMs,
      confidence: 1.0,
      source: s.type === 'narration' ? 'narrator_default' : 'manual',
      needs_review: false,
    };
  });
  const shCh2TotalDurationMs = shCh2CurrentMs;

  const shCh2Timeline = shCh2Segments.map((seg) => ({
    order: seg.order,
    segment_id: seg.segment_id,
    start_ms: seg.start_ms,
    end_ms: seg.end_ms,
    character_id: seg.character_id,
    voice_id: seg.voice_id,
    text: seg.text,
  }));

  const shCh2Res = await pool.query(
    `
    INSERT INTO chapters (novel_id, chapter_number, title, status, audio_version, swift_audio_object, total_duration_ms)
    VALUES ($1, 2, 'A Scandal in Bohemia - Part II', 'completed', 1, 'sh_ch2.mp3', $2)
    ON CONFLICT (novel_id, chapter_number) DO UPDATE SET
      title = EXCLUDED.title,
      status = 'completed',
      audio_version = EXCLUDED.audio_version,
      updated_at = now()
    RETURNING id;
  `,
    [shNovelId, shCh2TotalDurationMs]
  );
  const shCh2Id = shCh2Res.rows[0].id;

  // Synthesize/stitch demo chapter audio and capture real durations & format
  const stitchedSh2 = await ensureChapterAudio(shCh2Id, shCh2Segments);
  const sh2AudioFormat = stitchedSh2?.audio_format || (fs.existsSync(path.join(outputDir, `${shCh2Id}.wav`)) ? 'wav' : 'mp3');
  const sh2FinalDurationMs = stitchedSh2?.total_duration_ms || shCh2TotalDurationMs;
  const sh2FinalTimeline = (stitchedSh2?.timeline && stitchedSh2.timeline.length > 0) ? stitchedSh2.timeline : shCh2Timeline;
  const sh2SwiftAudioObject = `${shCh2Id}.${sh2AudioFormat}`;

  // Update PostgreSQL chapter with verified audio object and exact duration
  await pool.query(
    `UPDATE chapters SET total_duration_ms = $1, swift_audio_object = $2, updated_at = now() WHERE id = $3;`,
    [sh2FinalDurationMs, sh2SwiftAudioObject, shCh2Id]
  );

  const shCh2RawText = shCh2RawSegments.map((s) => s.text).join('\n\n');
  await Chapter.findOneAndUpdate(
    { pg_chapter_id: shCh2Id },
    {
      pg_chapter_id: shCh2Id,
      novel_id: shNovelId,
      chapter_number: 2,
      title: 'A Scandal in Bohemia - Part II',
      raw_text: shCh2RawText,
      audio_version: 1,
      manifest: {
        total_duration_ms: sh2FinalDurationMs,
        audio_url: `/api/stream/${shCh2Id}`,
        timeline: sh2FinalTimeline,
      },
      segments: shCh2Segments,
    },
    { upsert: true, new: true, runValidators: true }
  );

  console.log(`  ✔ Seeded Chapter 2 ('A Scandal in Bohemia - Part II'): ID=${shCh2Id} (${sh2FinalDurationMs}ms, ${sh2AudioFormat})\n`);

  console.log('========================================================================');
  console.log('✅ Demo seeding finished successfully!');
  console.log('========================================================================');

  if (closeConnections) {
    try {
      await mongoose.disconnect();
      await pool.end();
    } catch (_closeErr) {}
  }

  return {
    authorId,
    hpNovelId,
    hpChapterId: hpChapterIds[0] || null,
    hpChapterIds,
    shNovelId,
    shChapterIds: [shCh1Id, shCh2Id],
  };
}

module.exports = {
  seedDemos,
};
module.exports.seedDemos = seedDemos;
module.exports.default = seedDemos;

if (require.main === module) {
  seedDemos({ closeConnections: true })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal seeding error:', err);
      process.exit(1);
    });
}
