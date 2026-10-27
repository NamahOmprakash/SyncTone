const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const mongoose = require('mongoose');
const { config } = require('../config');

async function updateHpChapters() {
  console.log('Connecting to databases...');
  await mongoose.connect(config.mongoUri);
  console.log('✔ Connected to MongoDB');

  const pool = new Pool({ connectionString: config.databaseUrl });
  console.log('✔ Connected to PostgreSQL');

  const novelId = '2361aae1-bd74-4e82-b33d-d62ab5fa9e2f';

  // Find narrator character id
  const charRes = await pool.query(
    'SELECT id, voice_id FROM characters WHERE novel_id = $1 AND is_narrator = true LIMIT 1',
    [novelId]
  );
  const narratorCharId = charRes.rows[0]?.id || null;
  const narratorVoiceId = charRes.rows[0]?.voice_id || 'en-GB-RyanNeural';

  const jsonPath = path.resolve(__dirname, '../../output/hp1_extracted.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`hp1_extracted.json not found at ${jsonPath}`);
  }
  const extracted = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`Loaded ${extracted.chapters.length} chapters from ${jsonPath}`);

  const ChapterCol = mongoose.connection.collection('chapters');

  let totalUpdatedImages = 0;
  let totalSegmentsUpdated = 0;

  for (const ch of extracted.chapters) {
    const chNum = ch.chapter_number;
    const existingDoc = await ChapterCol.findOne({
      novel_id: novelId,
      chapter_number: chNum,
    });

    if (!existingDoc) {
      console.warn(`Chapter ${chNum} not found in MongoDB! Skipping.`);
      continue;
    }

    let existingProseIdx = 0;
    const existingSegs = existingDoc.segments || [];
    const mergedSegments = [];
    const timeline = [];

    for (let i = 0; i < ch.segments.length; i++) {
      const s = ch.segments[i];
      const order = i + 1;

      if (s.type === 'image') {
        const prev = mergedSegments[mergedSegments.length - 1];
        const startMs = prev ? prev.end_ms : 0;
        const endMs = startMs;
        const imgSeg = {
          order,
          segment_id: order,
          type: 'image',
          text: s.text,
          image_url: s.image_url,
          character_id: narratorCharId || existingSegs[0]?.character_id || 'narrator',
          speaker_id: narratorCharId || existingSegs[0]?.speaker_id || 'narrator',
          speaker_name: 'Narrator',
          voice_id: narratorVoiceId,
          assigned_voice_id: narratorVoiceId,
          start_ms: startMs,
          end_ms: endMs,
          confidence: 1.0,
          source: 'image',
          needs_review: false,
        };
        mergedSegments.push(imgSeg);
        timeline.push({
          order,
          segment_id: order,
          start_ms: startMs,
          end_ms: endMs,
          character_id: imgSeg.character_id,
          voice_id: imgSeg.voice_id,
          text: imgSeg.text,
          type: 'image',
          image_url: s.image_url,
        });
        totalUpdatedImages++;
      } else {
        const exist = existingSegs[existingProseIdx++];
        const proseSeg = {
          ...exist,
          order,
          segment_id: order,
          text: s.text,
          type: s.type,
        };
        mergedSegments.push(proseSeg);
        timeline.push({
          order,
          segment_id: order,
          start_ms: exist ? exist.start_ms : 0,
          end_ms: exist ? exist.end_ms : 0,
          character_id: exist?.character_id || null,
          voice_id: exist?.voice_id || narratorVoiceId,
          text: s.text,
          type: s.type,
          image_url: null,
        });
      }
    }

    const totalDur = existingDoc.manifest?.total_duration_ms || (mergedSegments[mergedSegments.length - 1]?.end_ms || 0);

    // Update MongoDB
    await ChapterCol.updateOne(
      { _id: existingDoc._id },
      {
        $set: {
          raw_text: ch.raw_text,
          segments: mergedSegments,
          'manifest.timeline': timeline,
          'manifest.total_duration_ms': totalDur,
          updatedAt: new Date(),
        },
      }
    );

    // Update PostgreSQL
    await pool.query(
      'UPDATE chapters SET title = $1, updated_at = NOW() WHERE novel_id = $2 AND chapter_number = $3',
      [ch.title, novelId, chNum]
    );

    totalSegmentsUpdated += mergedSegments.length;
    const imgCount = mergedSegments.filter((s) => s.type === 'image').length;
    console.log(
      `  ✔ Chapter ${String(chNum).padStart(2, '0')}: ${ch.title.padEnd(35)} | Total Segs: ${mergedSegments.length} (Images: ${imgCount})`
    );
  }

  console.log('=================================================================');
  console.log(`Successfully updated ${extracted.chapters.length} chapters in MongoDB and PostgreSQL.`);
  console.log(`Total images placed: ${totalUpdatedImages}`);
  console.log(`Total segments: ${totalSegmentsUpdated}`);
  console.log('=================================================================');

  await mongoose.disconnect();
  await pool.end();
}

updateHpChapters().catch((err) => {
  console.error('Update failed:', err);
  process.exit(1);
});
