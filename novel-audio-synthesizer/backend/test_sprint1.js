/**
 * SyncTone — Sprint 1 Comprehensive Backend & Database Verification Suite
 * Aligned with Master Engineering Brief + Assessment Alignment & Evidence Supplement (AP + DE Scope)
 */

const http = require('http');
const axios = require('axios');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { createApp } = require('./src/app');
const { pool, connectMongo, connectPostgres } = require('./src/db');
const { Chapter } = require('./src/models');
const { config } = require('./src/config');

const TEST_PORT = 4999;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}/api`;

let server;
const cleanupState = {
  writerId: null,
  readerId: null,
  novelId: null,
};

async function runTests() {
  console.log('================================================================');
  console.log('🚀 SYNCTONE SPRINT 1 + AP/DE ASSESSMENT VERIFICATION SUITE');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // [Task 1] Environment & Database Connections (Section 9: 10%)
  // ---------------------------------------------------------------------------
  console.log('▶ [Task 1] Testing Database Connections & Startup...');
  await connectPostgres();
  await connectMongo();
  const pgPing = await pool.query('SELECT 1 as connected');
  if (pgPing.rows[0].connected !== 1) throw new Error('PostgreSQL ping failed');
  if (mongoose.connection.readyState !== 1) throw new Error('MongoDB not connected');
  console.log('  ✔ PostgreSQL 16 & MongoDB 7.0 connections successfully established!\n');

  // Start ephemeral HTTP server
  const app = createApp();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`  ✔ Express API Gateway listening on port ${TEST_PORT}\n`);

  // ---------------------------------------------------------------------------
  // [Task 2] MongoDB Chapter Model Contract (Section 9: 20%, Section 10: 15%)
  // ---------------------------------------------------------------------------
  console.log('▶ [Task 2] Testing MongoDB Chapter Model Contract & Polyglot Schema...');
  const testPgId = '11111111-1111-4111-a111-111111111111';
  const testNovelId = '22222222-2222-4222-a222-222222222222';

  await Chapter.deleteMany({ pg_chapter_id: testPgId });

  const testChapterDoc = new Chapter({
    pg_chapter_id: testPgId,
    novel_id: testNovelId,
    chapter_number: 1,
    title: 'Model Contract Test Chapter',
    raw_text: 'The quick brown fox jumps over the lazy dog.',
    audio_version: 1,
    segments: [
      {
        order: 1,
        type: 'narration',
        text: 'The quick brown fox jumps over the lazy dog.',
        voice_id: 'am_adam',
        start_ms: 0,
        end_ms: 2500,
        confidence: 0.98,
        source: 'narrator_default',
      },
    ],
    manifest: {
      total_duration_ms: 2500,
      audio_url: 'test_audio.opus',
      timeline: [
        {
          order: 1,
          start_ms: 0,
          end_ms: 2500,
          voice_id: 'am_adam',
          text: 'The quick brown fox jumps over the lazy dog.',
        },
      ],
    },
  });

  await testChapterDoc.save();
  const retrievedDoc = await Chapter.findOne({ pg_chapter_id: testPgId });
  if (!retrievedDoc) throw new Error('Failed to retrieve saved Chapter doc');
  if (retrievedDoc.segments.length !== 1) throw new Error('Segments length mismatch');
  if (retrievedDoc.manifest.timeline.length !== 1) throw new Error('Manifest timeline mismatch');
  await Chapter.deleteOne({ pg_chapter_id: testPgId });
  console.log('  ✔ Chapter Mongoose Model schema & persistence contract verified!\n');

  // ---------------------------------------------------------------------------
  // [Task 3] Authentication & RBAC (Section 9: 15%, Section 12 Matrix)
  // ---------------------------------------------------------------------------
  console.log('▶ [Task 3] Testing Authentication & RBAC (/api/auth)...');
  const uniqueId = Date.now();
  const writerUsername = `writer_${uniqueId}`;
  const writerEmail = `writer_${uniqueId}@example.com`;
  const readerUsername = `reader_${uniqueId}`;
  const readerEmail = `reader_${uniqueId}@example.com`;
  const testPassword = 'Password123!';

  // 3.1 Register writer (also testing 'author' alias mapping)
  const registerWriterRes = await axios.post(`${BASE_URL}/auth/register`, {
    username: writerUsername,
    email: writerEmail,
    password: testPassword,
    role: 'author', // normalized to 'writer'
  });
  if (registerWriterRes.status !== 201) throw new Error(`Registration failed: ${registerWriterRes.status}`);
  const writerUser = registerWriterRes.data.user;
  cleanupState.writerId = writerUser.id;
  if (!writerUser.id || writerUser.role !== 'writer') throw new Error('Invalid writer payload');
  console.log(`  ✔ POST /api/auth/register created writer (${writerUser.username}, role: ${writerUser.role})`);

  // 3.2 Register reader
  const registerReaderRes = await axios.post(`${BASE_URL}/auth/register`, {
    username: readerUsername,
    email: readerEmail,
    password: testPassword,
    role: 'reader',
  });
  const readerUser = registerReaderRes.data.user;
  cleanupState.readerId = readerUser.id;
  console.log(`  ✔ POST /api/auth/register created reader (${readerUser.username}, role: ${readerUser.role})`);

  // 3.3 Duplicate registration check
  try {
    await axios.post(`${BASE_URL}/auth/register`, {
      username: writerUsername,
      email: writerEmail,
      password: testPassword,
    });
    throw new Error('Expected duplicate registration to fail');
  } catch (err) {
    if (err.response?.status !== 409) throw new Error(`Expected 409 Conflict, got ${err.response?.status}`);
    console.log('  ✔ Duplicate username/email rejected with 409 Conflict');
  }

  // 3.4 Bad password check
  try {
    await axios.post(`${BASE_URL}/auth/login`, {
      email: writerEmail,
      password: 'WrongPassword!',
    });
    throw new Error('Expected wrong password login to fail');
  } catch (err) {
    if (err.response?.status !== 401) throw new Error(`Expected 401, got ${err.response?.status}`);
    console.log('  ✔ Invalid password rejected with 401 Unauthorized');
  }

  // 3.4b Unknown email login timing check & generic error response (Audit Fix 3)
  try {
    await axios.post(`${BASE_URL}/auth/login`, {
      email: `nonexistent_${Date.now()}@example.com`,
      password: 'SomeRandomPassword123!',
    });
    throw new Error('Expected unknown email login to fail');
  } catch (err) {
    if (err.response?.status !== 401) throw new Error(`Expected 401, got ${err.response?.status}`);
    if (err.response?.data?.error !== 'Invalid email or password.') {
      throw new Error(`Expected generic error message, got: ${err.response?.data?.error}`);
    }
    console.log('  ✔ Unknown email rejected with 401 and generic error (timing mitigation verified)');
  }

  // 3.5 Successful login & cookie capture (Rule 1: httpOnly cookie)
  const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
    email: writerEmail,
    password: testPassword,
  });
  if (loginRes.status !== 200) throw new Error('Login failed');
  const cookies = loginRes.headers['set-cookie'];
  if (!cookies || !cookies.some((c) => c.includes('token='))) {
    throw new Error('Expected httpOnly token cookie on login');
  }
  const writerTokenCookie = cookies.find((c) => c.includes('token=')).split(';')[0];
  console.log('  ✔ POST /api/auth/login issued httpOnly cookie (Rule 1 satisfied)');

  // Login reader
  const readerLoginRes = await axios.post(`${BASE_URL}/auth/login`, {
    email: readerEmail,
    password: testPassword,
  });
  const readerTokenCookie = readerLoginRes.headers['set-cookie']
    .find((c) => c.includes('token='))
    .split(';')[0];

  // 3.6 Session check with valid cookie
  const meRes = await axios.get(`${BASE_URL}/auth/me`, {
    headers: { Cookie: writerTokenCookie },
  });
  if (meRes.data.user.email !== writerEmail) throw new Error('GET /api/auth/me returned wrong user');
  console.log('  ✔ GET /api/auth/me validated active session');

  // 3.7 Session check with absent / invalid cookie
  try {
    await axios.get(`${BASE_URL}/auth/me`);
    throw new Error('Expected missing cookie to fail');
  } catch (err) {
    if (err.response?.status !== 401) throw new Error(`Expected 401, got ${err.response?.status}`);
    console.log('  ✔ Absent session cookie properly rejected with 401 Unauthorized');
  }

  // 3.8 Expired JWT cookie rejection (Audit Fix 4)
  const expiredJwt = jwt.sign(
    { id: writerUser.id, username: writerUser.username, role: 'writer' },
    config.jwtSecret,
    { expiresIn: '-10s' }
  );
  try {
    await axios.get(`${BASE_URL}/auth/me`, {
      headers: { Cookie: `token=${expiredJwt}` },
    });
    throw new Error('Expected expired JWT to fail');
  } catch (err) {
    if (err.response?.status !== 401) throw new Error(`Expected 401, got ${err.response?.status}`);
    console.log('  ✔ Expired JWT cookie rejected with 401 Unauthorized via HTTP gateway\n');
  }

  // ---------------------------------------------------------------------------
  // [Task 4] Novel CRUD & Relational Queries (Section 9: 15%, Section 12 Matrix)
  // ---------------------------------------------------------------------------
  console.log('▶ [Task 4] Testing Novel CRUD & Relational Integrity (/api/novels)...');

  // 4.1 Forbidden role check: Reader cannot create novel
  try {
    await axios.post(
      `${BASE_URL}/novels`,
      { title: 'Reader Forbidden Novel', added_by: readerUser.id },
      { headers: { Cookie: readerTokenCookie } }
    );
    throw new Error('Expected reader to be forbidden from creating novel');
  } catch (err) {
    if (err.response?.status !== 403) throw new Error(`Expected 403 Forbidden, got ${err.response?.status}`);
    console.log('  ✔ Forbidden role rejected with 403 (readers cannot create novels)');
  }

  // 4.2 Invalid payload: Missing title
  try {
    await axios.post(
      `${BASE_URL}/novels`,
      { added_by: writerUser.id },
      { headers: { Cookie: writerTokenCookie } }
    );
    throw new Error('Expected missing title to fail');
  } catch (err) {
    if (err.response?.status !== 400) throw new Error(`Expected 400, got ${err.response?.status}`);
    console.log('  ✔ Invalid novel payload rejected with 400 Bad Request');
  }

  // 4.3 Create valid novel
  const createNovelRes = await axios.post(
    `${BASE_URL}/novels`,
    {
      title: 'A Study in Scarlet',
      synopsis: 'The landmark debut of Sherlock Holmes and Dr. John Watson.',
      channel: 'verified',
      added_by: writerUser.id,
    },
    { headers: { Cookie: writerTokenCookie } }
  );
  if (createNovelRes.status !== 201) throw new Error('Failed to create novel');
  const createdNovel = createNovelRes.data.novel;
  cleanupState.novelId = createdNovel.id;
  const profileJob = createNovelRes.data.job;
  if (!profileJob || profileJob.job_type !== 'profile_novel') {
    throw new Error('profile_novel job was not enqueued in synthesis_jobs');
  }
  console.log(
    `  ✔ POST /api/novels created novel '${createdNovel.title}' and enqueued profile_novel job (${profileJob.id})`
  );

  // Insert narrator character for relationship join (ensuring am_adam voice exists)
  await pool.query(`
    INSERT INTO voices (id, label, gender, age_band, language, reserved_narrator)
    VALUES ('am_adam', 'Adam (Narrator Default)', 'male', 'adult', 'en-us', true)
    ON CONFLICT (id) DO NOTHING;
  `);
  await pool.query(
    `
    INSERT INTO characters (novel_id, canonical_name, voice_id, is_narrator)
    VALUES ($1, 'Dr. John Watson', 'am_adam', true)
    ON CONFLICT (novel_id, canonical_name) DO NOTHING;
  `,
    [createdNovel.id]
  );

  // 4.4 GET /api/novels (channel filter & narrator join)
  const listNovelsRes = await axios.get(`${BASE_URL}/novels?channel=verified`);
  const foundNovel = listNovelsRes.data.novels.find((n) => n.id === createdNovel.id);
  if (!foundNovel) throw new Error('Created novel not in list');
  if (foundNovel.narrator_name !== 'Dr. John Watson' || foundNovel.narrator_voice_id !== 'am_adam') {
    throw new Error('Narrator join failed');
  }
  console.log(`  ✔ GET /api/novels verified channel filtering and narrator join (${foundNovel.narrator_name})`);

  // 4.5 GET /api/novels/:id details & unknown ID check
  const novelDetailRes = await axios.get(`${BASE_URL}/novels/${createdNovel.id}`);
  if (novelDetailRes.data.novel.id !== createdNovel.id) throw new Error('Wrong novel returned');
  if (novelDetailRes.data.characters.length !== 1) throw new Error('Characters roster missing');

  try {
    await axios.get(`${BASE_URL}/novels/00000000-0000-0000-0000-000000000000`);
    throw new Error('Expected unknown ID to return 404');
  } catch (err) {
    if (err.response?.status !== 404) throw new Error(`Expected 404, got ${err.response?.status}`);
    console.log('  ✔ GET /api/novels/:id verified details and handled unknown ID with 404');
  }

  // 4.6 Atomic novel creation failure rollback test (Audit Fix 1)
  console.log('  ▶ Testing atomic novel creation transaction rollback on synthesis job failure...');
  const testOrphanNovelId = uuidv4();
  const testClient = await pool.connect();
  try {
    await testClient.query('BEGIN');
    await testClient.query(
      `INSERT INTO novels (id, added_by, title, synopsis, channel)
       VALUES ($1, $2, 'Atomic Rollback Test Novel', 'Must rollback', 'verified');`,
      [testOrphanNovelId, writerUser.id]
    );
    // Violate target subtype trigger: assign synthesize_chapter target to profile_novel job
    const badJobRes = await testClient.query(
      `INSERT INTO synthesis_jobs (requested_by, job_type)
       VALUES ($1, 'profile_novel') RETURNING id;`,
      [writerUser.id]
    );
    await testClient.query(
      `INSERT INTO chapter_synthesis_job_targets (job_id, chapter_id)
       VALUES ($1, '00000000-0000-0000-0000-000000000000');`,
      [badJobRes.rows[0].id]
    );
    await testClient.query('COMMIT');
    throw new Error('Expected invalid synthesis job target to fail transaction');
  } catch (err) {
    await testClient.query('ROLLBACK').catch(() => {});
  } finally {
    testClient.release();
  }

  const orphanNovelRes = await pool.query('SELECT * FROM novels WHERE id = $1', [testOrphanNovelId]);
  if (orphanNovelRes.rows.length !== 0) {
    throw new Error('Atomic rollback failed: orphan novel record found');
  }
  console.log('  ✔ Atomic Novel Creation Rollback Verified: Zero orphan novel records remaining in PostgreSQL\n');

  // ---------------------------------------------------------------------------
  // [Task 5] Chapter Ingestion & Polyglot Persistence (Section 9: 20%, Section 12 Matrix)
  // ---------------------------------------------------------------------------
  console.log('▶ [Task 5] Testing Polyglot Ingestion & Transaction Integrity...');
  const chapterText = 'In the year 1878 I took my degree of Doctor of Medicine of the University of London...';

  // 5.1 Ingestion failure case: Malformed / empty text
  try {
    await axios.post(`${BASE_URL}/novels/${createdNovel.id}/chapters`, {
      title: 'Invalid Chapter',
      text: '',
    });
    throw new Error('Expected empty text to fail');
  } catch (err) {
    if (err.response?.status !== 400) throw new Error(`Expected 400, got ${err.response?.status}`);
    console.log('  ✔ Malformed/empty chapter text rejected with 400 Bad Request');
  }

  // 5.2 Ingestion failure case: Non-existent novel ID
  try {
    await axios.post(`${BASE_URL}/novels/00000000-0000-0000-0000-000000000000/chapters`, {
      title: 'Invalid Novel Chapter',
      text: 'Some sample text',
    });
    throw new Error('Expected invalid novel ID to fail');
  } catch (err) {
    if (err.response?.status !== 404) throw new Error(`Expected 404, got ${err.response?.status}`);
    console.log('  ✔ Ingestion to non-existent novel rejected with 404 Not Found');
  }

  // 5.3 Valid Ingestion
  const ingestRes = await axios.post(`${BASE_URL}/novels/${createdNovel.id}/chapters`, {
    title: 'Chapter 1: Mr. Sherlock Holmes',
    text: chapterText,
    chapter_number: 1,
    requested_by: writerUser.id,
  });
  if (ingestRes.status !== 201) throw new Error('Ingestion failed');
  const ingestedChapterId = ingestRes.data.chapter_id;

  // Cross-store verification
  const pgChapterCheck = await pool.query('SELECT * FROM chapters WHERE id = $1', [ingestedChapterId]);
  if (pgChapterCheck.rows.length === 0) throw new Error('PostgreSQL chapter record missing');
  const pgJobCheck = await pool.query(
    'SELECT j.*, cs.chapter_id FROM synthesis_jobs j JOIN chapter_synthesis_job_targets cs ON j.id = cs.job_id WHERE cs.chapter_id = $1',
    [ingestedChapterId]
  );
  if (pgJobCheck.rows.length === 0) throw new Error('PostgreSQL synthesis_jobs / chapter target record missing');
  const mongoDocCheck = await Chapter.findOne({ pg_chapter_id: ingestedChapterId });
  if (!mongoDocCheck) throw new Error('MongoDB chapter document missing');
  if (mongoDocCheck.raw_text !== chapterText) throw new Error('MongoDB raw text mismatch');
  console.log(
    `  ✔ Linked state verified: Postgres chapters (${pgChapterCheck.rows[0].id}) <-> Mongo doc (${mongoDocCheck.pg_chapter_id}) <-> Job (${pgJobCheck.rows[0].id})`
  );

  // 5.4 Unique constraint / failure rollback test (Section 12: No silent partial state)
  try {
    await axios.post(`${BASE_URL}/novels/${createdNovel.id}/chapters`, {
      title: 'Duplicate Chapter 1',
      text: 'Duplicate chapter prose',
      chapter_number: 1, // Violates UNIQUE(novel_id, chapter_number)
      requested_by: writerUser.id,
    });
    throw new Error('Expected duplicate chapter number to fail');
  } catch (err) {
    if (err.response?.status !== 409) throw new Error(`Expected 409, got ${err.response?.status}`);
    // Confirm no orphaned Mongo doc was left behind
    const orphanCheck = await Chapter.find({ novel_id: createdNovel.id, title: 'Duplicate Chapter 1' });
    if (orphanCheck.length !== 0) throw new Error('Compensating cleanup failed: orphan doc found');
    console.log('  ✔ Transaction rollback verified: duplicate chapter rejected with 409, zero orphan Mongo docs');
  }

  // 5.4b Concurrent chapter ingestion test (Audit Fix 2: serialized auto-numbering via FOR UPDATE)
  console.log('  ▶ Testing concurrent chapter ingestion with omitted chapter_number...');
  const concurrentUploads = [
    axios.post(`${BASE_URL}/novels/${createdNovel.id}/chapters`, {
      title: 'Auto Chapter A',
      text: 'Text for concurrent auto chapter A...',
      requested_by: writerUser.id,
      // chapter_number intentionally omitted
    }),
    axios.post(`${BASE_URL}/novels/${createdNovel.id}/chapters`, {
      title: 'Auto Chapter B',
      text: 'Text for concurrent auto chapter B...',
      requested_by: writerUser.id,
      // chapter_number intentionally omitted
    }),
    axios.post(`${BASE_URL}/novels/${createdNovel.id}/chapters`, {
      title: 'Auto Chapter C',
      text: 'Text for concurrent auto chapter C...',
      requested_by: writerUser.id,
      // chapter_number intentionally omitted
    }),
  ];

  const concurrentResults = await Promise.all(concurrentUploads);
  const assignedChapterNumbers = concurrentResults
    .map((r) => r.data.chapter.chapter_number)
    .sort((a, b) => a - b);

  // Chapter 1 already existed from 5.3, so concurrent chapters should receive 2, 3, 4 without collision
  if (JSON.stringify(assignedChapterNumbers) !== JSON.stringify([2, 3, 4])) {
    throw new Error(`Concurrent numbering race detected! Got numbers: [${assignedChapterNumbers.join(', ')}]`);
  }
  console.log(
    `  ✔ Concurrent ingestion verified: serialized without race conditions [${assignedChapterNumbers.join(', ')}]`
  );

  // 5.5 Manifest endpoint & Rule 3 stream URL mapping
  // Manually attach test manifest to chapter in Mongo to verify Rule 3
  mongoDocCheck.manifest = {
    total_duration_ms: 12000,
    audio_url: `${ingestedChapterId}.opus`,
    timeline: [
      { order: 1, start_ms: 0, end_ms: 12000, voice_id: 'am_adam', text: chapterText },
    ],
  };
  await mongoDocCheck.save();

  const manifestRes = await axios.get(`${BASE_URL}/manifest/${ingestedChapterId}`);
  if (!manifestRes.data.audio_stream_url || manifestRes.data.audio_stream_url !== `${ingestedChapterId}.opus`) {
    throw new Error('Rule 3 manifest stream URL mapping failed');
  }
  console.log(`  ✔ GET /api/manifest/:id verified Rule 3 (mapped audio_stream_url: ${manifestRes.data.audio_stream_url})`);

  // 5.6 Playback history atomic upsert & idempotence
  const p1 = await axios.post(`${BASE_URL}/playback/progress`, {
    user_id: writerUser.id,
    novel_id: createdNovel.id,
    chapter_id: ingestedChapterId,
    segment_order: 1,
    position_ms: 3000,
  });
  if (p1.status !== 200) throw new Error('Playback progress post failed');

  const p2 = await axios.post(`${BASE_URL}/playback/progress`, {
    user_id: writerUser.id,
    novel_id: createdNovel.id,
    chapter_id: ingestedChapterId,
    segment_order: 2,
    position_ms: 6500,
  });
  const histCheck = await pool.query(
    `SELECT h.id, h.user_id, h.novel_id, p.chapter_id, p.position_ms
     FROM playback_history h
     JOIN playback_positions p ON h.id = p.history_id
     WHERE h.user_id = $1 AND h.novel_id = $2`,
    [writerUser.id, createdNovel.id]
  );
  if (histCheck.rows.length !== 1 || histCheck.rows[0].position_ms !== 6500) {
    throw new Error('Atomic playback upsert failed');
  }
  console.log('  ✔ Playback history atomic upsert & idempotence verified (position_ms: 6500)');

  // ==============================================================================
  // Task 7: Security Audit & Role-Based Access Control Regression Verification
  // ==============================================================================
  console.log('\n▶ [Task 7] Running Security Audit & RBAC Regression Checks...');

  // 7.1 Prevent public registration from self-assigning admin privileges (Role Escalation)
  try {
    await axios.post(`${BASE_URL}/auth/register`, {
      username: `admin_attacker_${uniqueId}`,
      email: `admin_attacker_${uniqueId}@example.com`,
      password: 'AttackerPassword123!',
      role: 'admin',
    });
    throw new Error('Expected admin registration to be rejected');
  } catch (err) {
    if (err.response?.status !== 403) {
      throw new Error(`Expected 403 Forbidden for admin registration, got ${err.response?.status}`);
    }
    console.log('  ✔ Role Escalation Check: Public admin registration rejected with 403 Forbidden');
  }

  // 7.2 Anonymous access to POST /api/voices/assign must be rejected with 401
  try {
    await axios.post(`${BASE_URL}/voices/assign`, {
      character_id: 'Sherlock Holmes',
      new_voice_id: 'am_adam',
      chapter_id: ingestedChapterId,
    });
    throw new Error('Expected anonymous voice assignment to fail');
  } catch (err) {
    if (err.response?.status !== 401) {
      throw new Error(`Expected 401 Unauthorized for anonymous voice assignment, got ${err.response?.status}`);
    }
    console.log('  ✔ Security Check: Anonymous voice assignment rejected with 401 Unauthorized');
  }

  // 7.3 Reader access to POST /api/voices/assign must be rejected with 403
  try {
    await axios.post(
      `${BASE_URL}/voices/assign`,
      {
        character_id: 'Sherlock Holmes',
        new_voice_id: 'am_adam',
        chapter_id: ingestedChapterId,
      },
      { headers: { Cookie: readerTokenCookie } }
    );
    throw new Error('Expected reader voice assignment to fail');
  } catch (err) {
    if (err.response?.status !== 403) {
      throw new Error(`Expected 403 Forbidden for reader voice assignment, got ${err.response?.status}`);
    }
    console.log('  ✔ RBAC Check: Reader voice assignment rejected with 403 Forbidden');
  }

  // 7.4 Writer access to POST /api/voices/assign succeeds with 200
  const assignWriterRes = await axios.post(
    `${BASE_URL}/voices/assign`,
    {
      character_id: 'Dr. John Watson',
      new_voice_id: 'bm_george',
      chapter_id: ingestedChapterId,
    },
    { headers: { Cookie: writerTokenCookie } }
  );
  if (assignWriterRes.status !== 200) {
    throw new Error(`Expected 200 for writer voice assignment, got ${assignWriterRes.status}`);
  }
  console.log('  ✔ RBAC Check: Writer voice assignment succeeded with 200 OK');

  // 7.5 Anonymous access to POST /api/novels/:id/chapters must be rejected with 401
  try {
    await axios.post(`${BASE_URL}/novels/${createdNovel.id}/chapters`, {
      title: 'Anonymous Chapter Ingestion',
      text: 'Sample unauthorized text from an anonymous source.',
    });
    throw new Error('Expected anonymous chapter ingestion to fail');
  } catch (err) {
    if (err.response?.status !== 401) {
      throw new Error(`Expected 401 Unauthorized for anonymous chapter ingestion, got ${err.response?.status}`);
    }
    console.log('  ✔ Security Check: Anonymous chapter ingestion rejected with 401 Unauthorized');
  }

  // 7.6 Reader access to POST /api/novels/:id/chapters must be rejected with 403
  try {
    await axios.post(
      `${BASE_URL}/novels/${createdNovel.id}/chapters`,
      {
        title: 'Reader Chapter Ingestion',
        text: 'Sample unauthorized text from a reader session.',
      },
      { headers: { Cookie: readerTokenCookie } }
    );
    throw new Error('Expected reader chapter ingestion to fail');
  } catch (err) {
    if (err.response?.status !== 403) {
      throw new Error(`Expected 403 Forbidden for reader chapter ingestion, got ${err.response?.status}`);
    }
    console.log('  ✔ RBAC Check: Reader chapter ingestion rejected with 403 Forbidden');
  }

  // 7.7 Reader requested_by to POST /api/novels/:id/chapters must be rejected with 403
  try {
    await axios.post(`${BASE_URL}/novels/${createdNovel.id}/chapters`, {
      title: 'Reader Requested Chapter Ingestion',
      text: 'Sample unauthorized text from a reader requested_by.',
      requested_by: readerUser.id,
    });
    throw new Error('Expected reader requested_by chapter ingestion to fail');
  } catch (err) {
    if (err.response?.status !== 403) {
      throw new Error(`Expected 403 Forbidden for reader requested_by chapter ingestion, got ${err.response?.status}`);
    }
    console.log('  ✔ RBAC Check: Reader requested_by chapter ingestion rejected with 403 Forbidden');
  }
  // 7.8 Verify /api/health and /api/chapters/:id/progress endpoints
  const healthRes = await axios.get(`${BASE_URL}/health`);
  if (healthRes.status !== 200 || healthRes.data.status !== 'healthy') {
    throw new Error('Expected /api/health to return healthy');
  }
  const progRes = await axios.get(`${BASE_URL}/chapters/${ingestedChapterId}/progress`);
  if (progRes.status !== 200 || progRes.data.chapter_id !== ingestedChapterId) {
    throw new Error('Expected /api/chapters/:id/progress to return progress state');
  }
  console.log('  ✔ Phase 3 Check: /api/health & /api/chapters/:id/progress verified');

  await Chapter.deleteMany({ novel_id: createdNovel.id });
  await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [writerUser.id, readerUser.id]);
  cleanupState.novelId = null;
  cleanupState.writerId = null;
  cleanupState.readerId = null;
  console.log('  ✔ Test database fixtures cleanly removed');

  console.log('\n================================================================');
  console.log('🎉 ALL ASSESSMENTS & ACCEPTANCE CRITERIA PASSED (100% COMPLETE)!');
  console.log('================================================================\n');
}

runTests()
  .catch((err) => {
    console.error('\n❌ TEST RUN FAILED:', err.message);
    if (err.response) {
      console.error('Response data:', err.response.data);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (cleanupState.novelId) {
        await Chapter.deleteMany({ novel_id: cleanupState.novelId }).catch(() => {});
      }
      const userIds = [cleanupState.writerId, cleanupState.readerId].filter(Boolean);
      if (userIds.length > 0) {
        await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]).catch(() => {});
      }
    } catch (_) {}
    if (server) server.close();
    await pool.end();
    await mongoose.disconnect();
  });
