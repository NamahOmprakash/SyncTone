# Project: SyncTone AI-Powered Multi-Character Audiobook Synthesis System

## Architecture
SyncTone is a polyglot system integrating an Express.js API gateway, a PostgreSQL 16 Strict 4NF relational database, MongoDB 7.0 document store, Python processing engines, and a React 18 + Vite client:
- **API & Orchestration Gateway (`novel-audio-synthesizer/backend`)**: Express.js server providing REST and WebSocket interfaces for novel ingestion, chapter management, character casting, asynchronous synthesis queue dispatch, and RFC 7233 byte-range audio streaming.
- **Data Tier**:
  - PostgreSQL 16 (Strict 4NF): Authoritative store for users, novels, chapters, characters, character aliases, character age stages, timeline anchors, pronunciation dictionaries, synthesis jobs, and segment audio cache.
  - MongoDB 7.0: Aggregate document store for chapter manuscripts, structured dialogue/narration segments with source offsets, and pre-computed audio playback timelines with word/segment timestamps.
- **Novel Understanding Engine**: Ingestion pipeline supporting EPUB, PDF, and TXT with exact source offset preservation, verbatim text retention, multi-stage character entity resolution and alias clustering, literary dialogue detection (handling em-dashes, nested quotes, and multiline speeches), and confidence-scored speaker attribution with interactive review flagging.
- **Age Progression & Voice Casting Engine**: Chronological story timeline engine tracking character age stages (child, teen, adult, older adult), flashbacks, and time jumps independent of raw chapter order. Preserves acoustic identity across age stages via controlled prosody modulation. Provides persistent scoped cast management and pronunciation dictionaries.
- **Synthesis Pipeline & Audio Assembly**: Asynchronous segment-level TTS synthesis using Edge-TTS, Kokoro, Paradee, and local engines (with OpenAI/ElevenLabs configuration support), segment-level caching (`segment_audio_cache`), seamless PCM/WAV stitching with 10ms crossfade, natural pause insertion, word boundary alignment capture, and reader synchronization guards.
- **Background Worker Engine**: Persistent queue worker claiming `synthesis_jobs` via `FOR UPDATE SKIP LOCKED`, reporting real-time progress over WebSocket, supporting idempotent retries, exponential backoff, and job cancellation.

---

## Feature Inventory

Every requirement feature from R1 to R8 is enumerated below, assigned to a specific implementation milestone:

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Comprehensive Technical Audit | Complete P0-P3 technical audit of backend architecture, database, APIs, storage, TTS, queues, security, and tests | M1 | R1, Survey |
| 2 | Existing Test Suite Preservation | Maintain 100% pass on existing backend suites (`test_sprint1.js`, `test_de_integrity.js`, etc.) and frontend Vitest suite | M1 | R1, Survey |
| 3 | Strict 4NF Schema Migration | Add `character_age_stages`, `chapter_timeline_anchors`, `pronunciation_dictionaries`, and update `synthesis_jobs` status enum | M1 | R1, R8, Survey |
| 4 | Asynchronous Node.js Queue Worker | Background daemon claiming jobs via `FOR UPDATE SKIP LOCKED`, tracking progress, supporting retries and stale lock recovery | M1 | R8, Survey |
| 5 | Job Cancellation API & Logic | API route `/api/jobs/:id/cancel` and cancellation tokens during segment synthesis | M1 | R8, Survey |
| 6 | Fix Python `.venv` & Executable Guard | Install or fallback gracefully for `pypdf`, eliminating crash on uploaded PDF ingestion | M1 | R1, R2, Survey |
| 7 | Novel-Scoped Voice Profiler | Replace global flat `voice_registry.json` with novel-scoped voice persistence in PostgreSQL | M1 | R5, Survey |
| 8 | Fix Fake Chapter Ingestion Status | Ensure uploaded chapters enter `'draft'` status instead of fake `'completed'` before audio is synthesized | M1 | R6, R8, Survey |
| 9 | Exact Source Offset Tracking | Extract and preserve exact `source_char_start` and `source_char_end` for all paragraphs and segments | M2 | R2, Survey |
| 10 | Verbatim Text Preservation | Prevent prose deletion in Python and Node parsers; preserve dialogue tags and narration intact | M2 | R2, Survey |
| 11 | Multi-Format Ingestion Service | Robust EPUB, PDF, and TXT parsing without hardcoded novel bypasses, with scene boundary detection | M2 | R2, Survey |
| 12 | Canonical Character Extraction & Disambiguation | Multi-stage character extraction without conflating distinct characters sharing common names | M2 | R2, Survey |
| 13 | Active `character_aliases` Population | Populate and query alias clusters during entity resolution and speaker attribution | M2 | R2, Survey |
| 14 | Chunked Manuscript Processing | Bounded-window chunked analysis replacing single-shot LLM prompts to prevent token overflow | M2 | R2, Survey |
| 15 | Literary Punctuation & Dialogue Segmenter | Dialogue parser handling double quotes, curly quotes, em-dashes (`—`), guillemets, and multiline speeches | M3 | R3, Survey |
| 16 | Narrative, Dialogue & Internal Monologue Split | Accurate separation of spoken dialogue, narration, and internal thoughts/monologue | M3 | R3, Survey |
| 17 | Intra-Paragraph Multi-Turn Attribution | Independent speaker attribution for multiple dialogue segments within a single paragraph | M3 | R3, Survey |
| 18 | Multi-Party Conversational Tracking | Context tracking supporting >2 participants and LLM sliding-window attribution | M3 | R3, Survey |
| 19 | Confidence Scoring & Review Flagging | Calibrated confidence scores; set `needs_review: true` when confidence < 0.70; avoid random fallback speaker | M3 | R3, Survey |
| 20 | Interactive Speaker Review API | Endpoint `PATCH /api/chapters/:id/segments/:seg_id/speaker` to reassign flagged dialogue segments | M3 | R3, Survey |
| 21 | Chronological Story Timeline Engine | Model and track character age stages, story timeline positions, flashbacks, and time jumps | M4 | R4, Survey |
| 22 | Acoustic Voice Identity Preservation | Modulate character pitch/rate across age stages (child, teen, adult, older adult) while preserving core voice | M4 | R4, Survey |
| 23 | Distinct Character Voice Casting | Automated distinct voice assignment for major characters and dedicated narrator voice | M4 | R5, Survey |
| 24 | Persistent Cast Management API | APIs for voice assignment, voice previews, age-stage adjustments, and re-analysis persistence | M4 | R5, Survey |
| 25 | Pronunciation Dictionaries | Data store and text/SSML pre-processing for novel-scoped pronunciation and phonetic overrides | M4 | R5, Survey |
| 26 | TTS Provider Integrations & Fallback | Robust Edge-TTS, Kokoro, Paradee, and local engines, with OpenAI/ElevenLabs config readiness | M5 | R6, Survey |
| 27 | Lossless Linear PCM Audio Assembly | Transcode segments to uniform PCM/WAV, stitch with 10ms crossfade, and atomic file write (`.tmp` -> rename) | M5 | R6, Survey |
| 28 | Natural Pause Cadence Insertion | Dynamic pauses between distinct speakers, continuous flow for same speaker/narrator | M5 | R6, Survey |
| 29 | Segment Audio Caching | Query and populate `segment_audio_cache` for segment-level idempotency and fast retries | M5 | R6, R8, Survey |
| 30 | Word-Level Alignment Capture | Enable `wordBoundaryEnabled: true` in TTS, store word timestamps in manifest | M5 | R7, Survey |
| 31 | Reader Active Speaker & Highlight Sync | Synchronized active speaker display, sentence/word highlighting without view jumping | M5 | R7, Survey |
| 32 | Frontend Bundle Size Remediation | Code-split `FeaturedBook3D.jsx` (Three.js) to resolve cold-load bundle budget regression | M5 | R1, Survey |
| 33 | 100% E2E Test Certification | Pass 100% of E2E test suites (Tiers 1-4) on the multi-chapter verification novel | M-Final | Acceptance |
| 34 | Adversarial Coverage Hardening | White-box adversarial testing (Tier 5) closing all edge cases, race conditions, and error paths | M-Final | Acceptance |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Database Schema, Background Queue & Defect Remediation | Features 1, 2, 3, 4, 5, 6, 7, 8: PostgreSQL 4NF migrations (`character_age_stages`, `chapter_timeline_anchors`, `pronunciation_dictionaries`, `synthesis_jobs.status` enum update), Node.js async queue worker (`SKIP LOCKED`), job cancellation endpoint, novel-scoped voice registry, fix fake novel completion, fix `.venv` dependency fallback, preserve existing tests | None | PLANNED |
| M2 | AI Novel Understanding & Ingestion Engine | Features 9, 10, 11, 12, 13, 14: EPUB/PDF/TXT ingestion with exact character offset preservation (`source_char_start`/`end`), verbatim text retention, scene boundary detection, canonical character extraction, active `character_aliases` population and disambiguation, chunked manuscript processing | M1 | PLANNED |
| M3 | Context-Aware Dialogue Detection & Speaker Attribution | Features 15, 16, 17, 18, 19, 20: Literary punctuation parser (em-dashes, guillemets, nested quotes, multiline speeches), thoughts vs speech distinction, intra-paragraph multi-turn attribution, multi-party context graph, confidence scoring with `needs_review: true` flagging, interactive review API | M2 | PLANNED |
| M4 | Character Age Progression & Voice Casting Engine | Features 21, 22, 23, 24, 25: Chronological story timeline engine (age stages, flashbacks, time jumps), acoustic voice identity preservation formulas (pitch/rate modulation per stage), automated distinct voice casting, persistent cast management API, pronunciation dictionary data store and replacement pre-processor | M1, M3 | PLANNED |
| M5 | Multi-Voice TTS Synthesis Pipeline, Audio Assembly & Reader Sync | Features 26, 27, 28, 29, 30, 31, 32: Asynchronous segment synthesis with fallback chain and OpenAI/ElevenLabs config, PCM audio stitching with crossfade and natural pauses, atomic file write, `segment_audio_cache` integration, word-level alignment metadata capture, Reader view-jumping guard, frontend bundle budget fix | M1, M4 | PLANNED |
| M-Final | E2E Test Certification & Adversarial Coverage Hardening | Features 33, 34: Phase 1: Pass 100% of E2E tests (Tiers 1-4) published by E2E Testing Track on the multi-chapter verification novel. Phase 2: Adversarial coverage hardening (Tier 5) via Challenger -> Worker -> Reviewer loop | M5, TEST_READY | PLANNED |

---

## Interface Contracts

### 1. Novel Engine $\leftrightarrow$ Storage / Database
- **`TextSegment` Object Structure (stored in MongoDB `Chapter.segments[]`)**:
  ```typescript
  interface TextSegment {
    order: number;
    type: 'narration' | 'dialogue' | 'thought' | 'scene_break';
    text: string;
    source_char_start: number;
    source_char_end: number;
    speaker_id: string; // UUID of Character or 'narrator' or 'unresolved'
    speaker_name: string; // Canonical name or 'Narrator' or 'Unresolved'
    attribution_confidence: number; // 0.0 to 1.0
    needs_review: boolean; // true if confidence < 0.70
    suggested_speakers?: Array<{ character_id: string; name: string; score: number }>;
  }
  ```

### 2. Character Age Progression $\leftrightarrow$ Voice Engine
- **`CharacterAgeStage` & `TimelineAnchor` (PostgreSQL Schema)**:
  ```sql
  CREATE TABLE character_age_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    stage_name VARCHAR(50) NOT NULL, -- 'child', 'early_teen', 'late_teen', 'adult', 'elder'
    approx_age_min INT,
    approx_age_max INT,
    base_voice_id VARCHAR(64) NOT NULL REFERENCES voices(id),
    pitch_adjustment VARCHAR(10) NOT NULL DEFAULT '+0%', -- e.g. '+15%', '-8%'
    rate_adjustment VARCHAR(10) NOT NULL DEFAULT '+0%',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_character_age_stage UNIQUE (character_id, stage_name)
  );

  CREATE TABLE chapter_timeline_anchors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    story_order INT NOT NULL,
    story_year NUMERIC(8, 2),
    is_flashback BOOLEAN NOT NULL DEFAULT false,
    is_time_jump BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_chapter_timeline_anchor UNIQUE (chapter_id)
  );
  ```

- **`VoiceProfiler.resolveVoiceForSegment(characterId, chapterId, context)`**:
  - Resolves active character age stage from `chapter_timeline_anchors` and `character_age_stages`.
  - Returns `{ voice_id: string, pitch_adjustment: string, rate_adjustment: string, speed_multiplier: number }`.

### 3. Queue Worker $\leftrightarrow$ Synthesis Pipeline
- **`synthesis_jobs` Status Contract**:
  - Valid statuses: `'queued'`, `'processing'`, `'completed'`, `'failed'`, `'cancelled'`, `'dead_letter'`.
  - Claim query: `SELECT id FROM synthesis_jobs WHERE status = 'queued' AND run_after <= now() AND attempts < max_attempts ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1`.
  - Progress updates broadcast via WebSocket `/api/ws/progress/:chapter_id` with `{ job_id, chapter_id, progress_pct, current_segment, total_segments, status }`.

### 4. Audio Stitcher $\leftrightarrow$ Reader Synchronization
- **`ManifestTimelineEntry` Structure (stored in MongoDB `Chapter.manifest.timeline[]`)**:
  ```typescript
  interface ManifestTimelineEntry {
    order: number;
    segment_id: string;
    start_ms: number;
    end_ms: number;
    character_id: string;
    voice_id: string;
    text: string;
    type: 'narration' | 'dialogue' | 'thought';
    words?: Array<{
      word: string;
      start_ms: number;
      end_ms: number;
    }>;
  }
  ```

---

## Code Layout

Existing conventions and target file assignments:
```
novel-audio-synthesizer/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma                 # Updated Prisma models
│   ├── src/
│   │   ├── migrations/
│   │   │   └── 0002_age_progression_and_pronunciation.sql # DB migrations
│   │   ├── config/index.js               # Environment & provider config
│   │   ├── db/                           # Database pools & queries
│   │   ├── models/Chapter.js             # Mongoose chapter model with source offsets & words
│   │   ├── routes/
│   │   │   ├── novels.js                 # Novel ingestion, status, assets
│   │   │   ├── chapters.js               # Chapter parsing, synthesis, review
│   │   │   ├── voices.js                 # Cast management, pronunciation dict, preview
│   │   │   └── jobs.js                   # Job cancellation and status
│   │   └── engine/
│   │       ├── queueWorker.js            # Node.js asynchronous SKIP LOCKED worker daemon
│   │       ├── textParser.js             # Offset-preserving literary tokenizer
│   │       ├── attribution.js            # Context & multi-party attribution engine
│   │       ├── ageProgression.js         # Chronological timeline & age stage engine
│   │       ├── voiceProfiler.js          # Novel-scoped voice profiler & casting engine
│   │       ├── pronunciationDict.js      # Pronunciation dictionary replacement service
│   │       ├── ttsEngine.js              # TTS provider integrations & SSML age modulator
│   │       ├── audioStitcher.js          # PCM linear audio stitcher with crossfade & atomic write
│   │       └── providers/                # Modular TTS providers (Edge, Kokoro, OpenAI, etc.)
│   └── tests/                            # Automated test suites
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── ReaderView.jsx            # Synchronized scroll reader with view-jump guard
│       │   ├── OpenGLPageReader.jsx      # 3D paginated reader with navigation lock
│       │   └── NovelCatalog.jsx          # Catalog with lazy-loaded 3D book
│       └── utils/
│           └── readerLayoutEngine.js     # Word and sentence active highlight engine
└── test-novels/                          # Benchmark verification novels
```
