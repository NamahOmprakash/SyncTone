require('dotenv').config({ path: './.env' });
const { Pool } = require('pg');
const mongoose = require('mongoose');
const { config } = require('../config');

async function seedAllProse() {
  const pool = new Pool({ connectionString: config.databaseUrl });
  await mongoose.connect(config.mongoUri);
  console.log('Connected to PG and MongoDB');

  const ChapterCol = mongoose.connection.collection('chapters');

  // 1. Fetch all chapters from PG
  const chRes = await pool.query(`
    SELECT c.id, c.novel_id, c.chapter_number, c.title, n.title as novel_title
    FROM chapters c
    JOIN novels n ON c.novel_id = n.id
    ORDER BY n.title, c.chapter_number
  `);

  console.log(`Found ${chRes.rows.length} chapters to ensure prose for.`);

  // Prose data map
  const proseMap = {
    "Harry Potter and the Philosopher's Stone": {
      2: {
        title: 'The Vanishing Glass',
        segments: [
          { order: 1, type: 'narration', speaker: 'British Narrator', voice: 'en-GB-RyanNeural', start: 0, end: 5500, text: 'Nearly ten years had passed since the Dursleys had woken up to find their nephew on the front step, but Privet Drive had hardly changed at all.' },
          { order: 2, type: 'narration', speaker: 'British Narrator', voice: 'en-GB-RyanNeural', start: 5800, end: 11000, text: 'Only the photographs on the mantelpiece showed how much time had passed. Ten years ago, there were lots of pictures of what looked like a large pink beach ball.' },
          { order: 3, type: 'dialogue', speaker: 'Aunt Petunia', voice: 'en-GB-SoniaNeural', start: 11300, end: 14200, text: 'Up! Get up! Now!' },
          { order: 4, type: 'narration', speaker: 'British Narrator', voice: 'en-GB-RyanNeural', start: 14500, end: 19800, text: 'Harry heard her walking toward the kitchen and then the sound of the frying pan being put on the stove. He rolled onto his back and tried to remember the dream he had been having.' },
          { order: 5, type: 'dialogue', speaker: 'Aunt Petunia', voice: 'en-GB-SoniaNeural', start: 20100, end: 23900, text: 'Are you up yet? Mind the bacon, and do not dare let it burn!' },
          { order: 6, type: 'dialogue', speaker: 'Harry Potter', voice: 'en-GB-ThomasNeural', start: 24200, end: 26500, text: 'Yes, Aunt Petunia.' },
          { order: 7, type: 'narration', speaker: 'British Narrator', voice: 'en-GB-RyanNeural', start: 26800, end: 33000, text: 'Harry dressed and went down the hall into the kitchen. The table was almost hidden beneath all Dudley’s birthday presents. It looked as though Dudley had gotten everything he wanted.' },
        ],
      },
      3: {
        title: 'The Letters from No One',
        segments: [
          { order: 1, type: 'narration', speaker: 'British Narrator', voice: 'en-GB-RyanNeural', start: 0, end: 6000, text: 'The escape of the Brazilian boa constrictor earned Harry his longest-ever punishment. By the time he was allowed out of his cupboard again, the summer holidays had started.' },
          { order: 2, type: 'narration', speaker: 'British Narrator', voice: 'en-GB-RyanNeural', start: 6300, end: 12500, text: 'One morning in July, Uncle Vernon’s mail arrived with a sharp click through the letter slot and a flop on the doormat.' },
          { order: 3, type: 'dialogue', speaker: 'Uncle Vernon', voice: 'en-GB-ArthurNeural', start: 12800, end: 15400, text: 'Get the mail, Dudley.' },
          { order: 4, type: 'dialogue', speaker: 'Dudley Dursley', voice: 'en-GB-AlfieNeural', start: 15700, end: 17800, text: 'Make Harry get it.' },
          { order: 5, type: 'dialogue', speaker: 'Uncle Vernon', voice: 'en-GB-ArthurNeural', start: 18100, end: 20200, text: 'Poke him with your Smeltings stick, Dudley.' },
          { order: 6, type: 'narration', speaker: 'British Narrator', voice: 'en-GB-RyanNeural', start: 20500, end: 28000, text: 'Harry picked up the letters. There was a postcard from Marge, a brown envelope that looked like a bill, and—a letter for Harry. Harry stared at it, his heart twanging like a giant elastic band.' },
        ],
      },
    },
    "The Adventures of Sherlock Holmes": {
      1: {
        title: 'A Scandal in Bohemia',
        segments: [
          { order: 1, type: 'narration', speaker: 'Dr. John Watson', voice: 'bm_george', start: 0, end: 5500, text: 'To Sherlock Holmes she is always THE woman. I have seldom heard him mention her under any other name.' },
          { order: 2, type: 'narration', speaker: 'Dr. John Watson', voice: 'bm_george', start: 5800, end: 11800, text: 'One night, a visitor of formidable stature strode into our Baker Street rooms, wearing a black vizard mask over his eyes.' },
          { order: 3, type: 'dialogue', speaker: 'King of Bohemia', voice: 'am_michael', start: 12100, end: 17100, text: 'You had my note? Did it tell you that I would call? I am Count von Kramm, a Bohemian nobleman.' },
          { order: 4, type: 'dialogue', speaker: 'Sherlock Holmes', voice: 'am_adam', start: 17400, end: 22600, text: 'Pray take a seat, Your Majesty. This heavy Bohemian paper could hardly disguise your royal crest.' },
          { order: 5, type: 'dialogue', speaker: 'King of Bohemia', voice: 'am_michael', start: 22900, end: 28700, text: 'You must see that it is of the utmost importance to European politics. The compromising photograph must be recovered!' },
          { order: 6, type: 'dialogue', speaker: 'Sherlock Holmes', voice: 'am_adam', start: 29000, end: 33800, text: 'It is a capital mistake to theorize before one has data. We must investigate Miss Irene Adler at once.' },
        ],
      },
      2: {
        title: 'The Red-Headed League',
        segments: [
          { order: 1, type: 'narration', speaker: 'Dr. John Watson', voice: 'bm_george', start: 0, end: 6000, text: 'I had called upon my friend, Mr. Sherlock Holmes, one day in the autumn of last year and found him in deep conversation with a very stout, florid-faced, elderly gentleman with fiery red hair.' },
          { order: 2, type: 'dialogue', speaker: 'Sherlock Holmes', voice: 'am_adam', start: 6300, end: 11500, text: 'You could not have come at a better time, my dear Watson. Mr. Jabez Wilson here has been telling us a singular story.' },
          { order: 3, type: 'dialogue', speaker: 'Jabez Wilson', voice: 'am_michael', start: 11800, end: 17000, text: 'All red-headed men who are sound in body and mind and above the age of twenty-one years are eligible for four pounds a week for nominal services.' },
          { order: 4, type: 'narration', speaker: 'Dr. John Watson', voice: 'bm_george', start: 17300, end: 23000, text: 'Holmes rubbed his hands and his eyes glistened. He leaned forward in his chair with that sharp concentration that always seized him when a strange puzzle presented itself.' },
          { order: 5, type: 'dialogue', speaker: 'Sherlock Holmes', voice: 'am_adam', start: 23300, end: 27500, text: 'It is quite a three-pipe problem, Watson, and I beg that you won’t speak to me for fifty minutes.' },
        ],
      },
    },
    "The Great Gatsby": {
      1: {
        title: 'In My Younger and More Vulnerable Years',
        segments: [
          { order: 1, type: 'narration', speaker: 'Nick Carraway', voice: 'am_michael', start: 0, end: 7000, text: 'In my younger and more vulnerable years my father gave me some advice that I have been turning over in my mind ever since.' },
          { order: 2, type: 'dialogue', speaker: 'Nick’s Father', voice: 'am_adam', start: 7300, end: 14500, text: 'Whenever you feel like criticizing anyone, just remember that all the people in this world haven’t had the advantages that you’ve had.' },
          { order: 3, type: 'narration', speaker: 'Nick Carraway', voice: 'am_michael', start: 14800, end: 22000, text: 'He didn’t say any more, but we’ve always been unusually communicative in a reserved way, and I understood that he meant a great deal more than that.' },
          { order: 4, type: 'narration', speaker: 'Nick Carraway', voice: 'am_michael', start: 22300, end: 30000, text: 'When I came back from the East last autumn I felt that I wanted the world to be in uniform and at a sort of moral attention forever. Only Gatsby was exempt from my reaction.' },
          { order: 5, type: 'narration', speaker: 'Nick Carraway', voice: 'am_michael', start: 30300, end: 37500, text: 'Gatsby, who represented everything for which I have an unaffected scorn. If personality is an unbroken series of successful gestures, then there was something gorgeous about him.' },
        ],
      },
    },
  };

  for (const ch of chRes.rows) {
    const existing = await ChapterCol.findOne({ pg_chapter_id: ch.id });
    if (existing && Array.isArray(existing.segments) && existing.segments.length > 0) {
      console.log(`✔ Chapter ${ch.id} (${ch.novel_title} - ${ch.title}) already has ${existing.segments.length} segments.`);
      continue;
    }

    const novelProse = proseMap[ch.novel_title];
    const chData = novelProse ? novelProse[ch.chapter_number] : null;

    if (chData) {
      const segs = chData.segments.map((s) => ({
        order: s.order,
        segment_id: s.order,
        type: s.type,
        speaker_name: s.speaker,
        voice_id: s.voice,
        assigned_voice_id: s.voice,
        text: s.text,
        start_ms: s.start,
        end_ms: s.end,
        confidence: 1.0,
        source: 'manual',
        needs_review: false,
      }));

      const totalDuration = segs[segs.length - 1].end_ms;
      const rawText = segs.map((s) => s.text).join('\n\n');

      const manifest = {
        total_duration_ms: totalDuration,
        audio_url: `/api/stream/${ch.id}`,
        timeline: segs.map((s) => ({
          order: s.order,
          segment_id: s.segment_id,
          start_ms: s.start_ms,
          end_ms: s.end_ms,
          character_id: s.speaker_name,
          voice_id: s.voice_id,
          text: s.text,
        })),
      };

      await ChapterCol.updateOne(
        { pg_chapter_id: ch.id },
        {
          $set: {
            pg_chapter_id: ch.id,
            novel_id: ch.novel_id,
            chapter_number: ch.chapter_number,
            title: ch.title,
            raw_text: rawText,
            audio_version: 1,
            manifest,
            segments: segs,
          },
        },
        { upsert: true }
      );

      // Update total duration in PostgreSQL
      await pool.query(
        'UPDATE chapters SET total_duration_ms = $1, status = $2, swift_audio_object = $3 WHERE id = $4',
        [totalDuration, 'completed', `${ch.id}.mp3`, ch.id]
      );

      console.log(`✔ Seeded ${segs.length} segments for Chapter ${ch.id} (${ch.novel_title} - ${ch.title})`);
    } else {
      console.warn(`No preset prose found for ${ch.novel_title} Ch ${ch.chapter_number}`);
    }
  }

  await pool.end();
  await mongoose.disconnect();
  console.log('Finished seeding all chapter prose!');
}

seedAllProse().catch((e) => {
  console.error('Error in seedAllProse:', e);
  process.exit(1);
});

