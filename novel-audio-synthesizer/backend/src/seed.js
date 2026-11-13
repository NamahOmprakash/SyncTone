const { Pool } = require('pg');
const mongoose = require('mongoose');
const { config } = require('./config');
const Chapter = require('./models/Chapter');

async function seed() {
  console.log('🌱 Starting SyncTone Database Seeder...');

  const pool = new Pool({ connectionString: config.databaseUrl });
  await mongoose.connect(config.mongoUri);
  console.log('✔ Connected to PostgreSQL and MongoDB');

  // 1. Create or ensure test users
  const userRes = await pool.query(`
    INSERT INTO users (username, email, password_hash, role)
    VALUES 
      ('author_jk', 'author@synctone.com', crypt('password123', gen_salt('bf')), 'writer'),
      ('reader_alice', 'reader@synctone.com', crypt('password123', gen_salt('bf')), 'reader'),
      ('admin_synctone', 'admin@synctone.com', crypt('password123', gen_salt('bf')), 'admin')
    ON CONFLICT (email) DO UPDATE SET updated_at = now()
    RETURNING id, username, email, role;
  `);
  const authorId = userRes.rows.find((u) => u.role === 'writer')?.id || userRes.rows[0].id;

  // 2. Clear old demo data if any
  await pool.query("DELETE FROM novels WHERE title IN ('Harry Potter and the Philosopher''s Stone', 'The Adventures of Sherlock Holmes', 'The Great Gatsby')");

  // 3. Insert Novel 1: Harry Potter
  const hpRes = await pool.query(
    `INSERT INTO novels (added_by, title, synopsis, channel, status, global_tone)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      authorId,
      "Harry Potter and the Philosopher's Stone",
      'Harry Potter has never even heard of Hogwarts when the letters start dropping on the doormat at number four, Privet Drive. Addressed in green ink on yellowish parchment with a purple seal, they are swiftly confiscated by his grisly aunt and uncle.',
      'verified',
      'published',
      'British Fantasy',
    ]
  );
  const hpId = hpRes.rows[0].id;

  // Characters for Harry Potter
  await pool.query(
    `INSERT INTO characters (novel_id, canonical_name, gender, age_band, voice_id, is_narrator, sample_quote)
     VALUES 
      ($1, 'British Narrator', 'male', 'adult', 'en-GB-RyanNeural', true, 'Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were perfectly normal, thank you very much.'),
      ($1, 'Harry Potter', 'male', 'young', 'en-GB-ThomasNeural', false, 'I will be in my bedroom, making no noise and pretending I do not exist.'),
      ($1, 'Albus Dumbledore', 'male', 'elder', 'en-GB-ArthurNeural', false, 'It does not do to dwell on dreams and forget to live, remember that, Harry.'),
      ($1, 'Severus Snape', 'male', 'adult', 'en-GB-NoahNeural', false, 'I can teach you how to bottle fame, brew glory, even stopper death.'),
      ($1, 'Prof. McGonagall', 'female', 'adult', 'en-GB-SoniaNeural', false, 'Transfiguration is some of the most complex and dangerous magic you will learn at Hogwarts.')
     ON CONFLICT DO NOTHING;`,
    [hpId]
  );

  // Chapters for Harry Potter
  const ch1Res = await pool.query(
    `INSERT INTO chapters (novel_id, chapter_number, title, status, total_duration_ms, swift_audio_object)
     VALUES ($1, 1, 'The Boy Who Lived', 'completed', 185000, 'hp_ch1.opus'),
            ($1, 2, 'The Vanishing Glass', 'completed', 142000, 'hp_ch2.opus'),
            ($1, 3, 'The Letters from No One', 'draft', 0, NULL)
     RETURNING id, chapter_number`,
    [hpId]
  );
  const ch1Id = ch1Res.rows.find((r) => r.chapter_number === 1).id;

  // 4. Insert Novel 2: Sherlock Holmes
  const shRes = await pool.query(
    `INSERT INTO novels (added_by, title, synopsis, channel, status, global_tone)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      authorId,
      'The Adventures of Sherlock Holmes',
      'To Sherlock Holmes she is always THE woman. I have seldom heard him mention her under any other name. In his eyes she eclipses and predominates the whole of her sex.',
      'verified',
      'published',
      'Victorian Mystery',
    ]
  );
  const shId = shRes.rows[0].id;

  await pool.query(
    `INSERT INTO characters (novel_id, canonical_name, gender, age_band, voice_id, is_narrator, sample_quote)
     VALUES 
      ($1, 'Dr. John Watson', 'male', 'adult', 'en-GB-ArthurNeural', true, 'In the year 1878 I took my degree of Doctor of Medicine of the University of London.'),
      ($1, 'Sherlock Holmes', 'male', 'adult', 'en-GB-RyanNeural', false, 'It is a capital mistake to theorize before one has data.'),
      ($1, 'Irene Adler', 'female', 'adult', 'en-GB-LibbyNeural', false, 'I had been warned against you months ago, Mr. Holmes.')
     ON CONFLICT DO NOTHING;`,
    [shId]
  );

  await pool.query(
    `INSERT INTO chapters (novel_id, chapter_number, title, status, total_duration_ms, swift_audio_object)
     VALUES ($1, 1, 'A Scandal in Bohemia', 'completed', 164000, 'sh_ch1.opus'),
            ($1, 2, 'The Red-Headed League', 'draft', 0, NULL)`,
    [shId]
  );

  // 5. Insert Novel 3: The Great Gatsby
  const ggRes = await pool.query(
    `INSERT INTO novels (added_by, title, synopsis, channel, status, global_tone)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      authorId,
      'The Great Gatsby',
      "In my younger and more vulnerable years my father gave me some advice that I have been turning over in my mind ever since. Whenever you feel like criticizing anyone, just remember that all the people in this world haven't had the advantages that you have had.",
      'community',
      'published',
      'Jazz Age Fiction',
    ]
  );
  const ggId = ggRes.rows[0].id;

  await pool.query(
    `INSERT INTO characters (novel_id, canonical_name, gender, age_band, voice_id, is_narrator, sample_quote)
     VALUES 
      ($1, 'Nick Carraway', 'male', 'young', 'am_michael', true, 'I am inclined to reserve all judgements, a habit that has opened up many curious natures to me.'),
      ($1, 'Jay Gatsby', 'male', 'adult', 'am_adam', false, 'Can''t repeat the past? Why of course you can, old sport!'),
      ($1, 'Daisy Buchanan', 'female', 'young', 'af_heart', false, 'I hope she''ll be a fool—that''s the best thing a girl can be in this world, a beautiful little fool.')
     ON CONFLICT DO NOTHING;`,
    [ggId]
  );

  await pool.query(
    `INSERT INTO chapters (novel_id, chapter_number, title, status, total_duration_ms, swift_audio_object)
     VALUES ($1, 1, 'In My Younger and More Vulnerable Years', 'completed', 125000, 'gg_ch1.opus')`,
    [ggId]
  );

  // 6. MongoDB Prose & Segments for Harry Potter Chapter 1
  await Chapter.deleteMany({ pg_chapter_id: ch1Id });
  const segments = [
    {
      order: 1,
      segment_id: 1,
      type: 'narration',
      text: 'Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were perfectly normal, thank you very much.',
      speaker_name: 'British Narrator',
      voice_id: 'en-GB-RyanNeural',
      start_ms: 0,
      end_ms: 6200,
      confidence: 1.0,
      source: 'narrator_default',
    },
    {
      order: 2,
      segment_id: 2,
      type: 'narration',
      text: 'They were the last people you would expect to be involved in anything strange or mysterious, because they just did not hold with such nonsense.',
      speaker_name: 'British Narrator',
      voice_id: 'en-GB-RyanNeural',
      start_ms: 6450,
      end_ms: 13800,
      confidence: 1.0,
      source: 'narrator_default',
    },
    {
      order: 3,
      segment_id: 3,
      type: 'dialogue',
      text: 'Little tyke!',
      speaker_name: 'Mr. Dursley',
      voice_id: 'en-GB-ArthurNeural',
      start_ms: 14050,
      end_ms: 15900,
      confidence: 0.95,
      source: 'regex_rule',
    },
    {
      order: 4,
      segment_id: 4,
      type: 'narration',
      text: 'chortled Mr. Dursley as he got into his car.',
      speaker_name: 'British Narrator',
      voice_id: 'en-GB-RyanNeural',
      start_ms: 16150,
      end_ms: 19200,
      confidence: 1.0,
      source: 'narrator_default',
    },
    {
      order: 5,
      segment_id: 5,
      type: 'dialogue',
      text: 'Shoo!',
      speaker_name: 'Mr. Dursley',
      voice_id: 'en-GB-ArthurNeural',
      start_ms: 19450,
      end_ms: 20600,
      confidence: 0.92,
      source: 'regex_rule',
    },
    {
      order: 6,
      segment_id: 6,
      type: 'narration',
      text: 'said Mr. Dursley loudly. The cat didn’t move. It just gave him a stern look.',
      speaker_name: 'British Narrator',
      voice_id: 'en-GB-RyanNeural',
      start_ms: 20850,
      end_ms: 25400,
      confidence: 1.0,
      source: 'narrator_default',
    },
    {
      order: 7,
      segment_id: 7,
      type: 'dialogue',
      text: 'Fancy seeing you here, Professor McGonagall.',
      speaker_name: 'Albus Dumbledore',
      voice_id: 'en-GB-ArthurNeural',
      start_ms: 25650,
      end_ms: 29800,
      confidence: 0.98,
      source: 'regex_rule',
    },
    {
      order: 8,
      segment_id: 8,
      type: 'dialogue',
      text: 'How did you know it was me?',
      speaker_name: 'Prof. McGonagall',
      voice_id: 'en-GB-SoniaNeural',
      start_ms: 30050,
      end_ms: 32500,
      confidence: 0.96,
      source: 'regex_rule',
    },
    {
      order: 9,
      segment_id: 9,
      type: 'narration',
      text: 'she asked, turning her tabby cat form into a rather severe-looking woman.',
      speaker_name: 'British Narrator',
      voice_id: 'en-GB-RyanNeural',
      start_ms: 32750,
      end_ms: 37100,
      confidence: 1.0,
      source: 'narrator_default',
    },
    {
      order: 10,
      segment_id: 10,
      type: 'dialogue',
      text: 'My dear Professor, I have never seen a cat sit so stiffly.',
      speaker_name: 'Albus Dumbledore',
      voice_id: 'en-GB-ArthurNeural',
      start_ms: 37350,
      end_ms: 42200,
      confidence: 0.99,
      source: 'regex_rule',
    },
  ];

  const timeline = segments.map((s) => ({
    order: s.order,
    segment_id: s.segment_id,
    start_ms: s.start_ms,
    end_ms: s.end_ms,
    character_id: s.speaker_name,
    voice_id: s.voice_id,
  }));

  await Chapter.create({
    pg_chapter_id: ch1Id,
    novel_id: hpId,
    chapter_number: 1,
    title: 'The Boy Who Lived',
    raw_text: segments.map((s) => s.text).join(' '),
    audio_version: 1,
    segments,
    manifest: {
      total_duration_ms: 42200,
      audio_url: `/api/stream/${ch1Id}`,
      timeline,
    },
  });

  console.log('✔ Successfully seeded novels, characters, and Chapter 1 prose to PostgreSQL and MongoDB!');
  await pool.end();
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
