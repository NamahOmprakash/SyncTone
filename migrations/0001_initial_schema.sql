-- ==============================================================================
-- SyncTone — Standalone SQL Schema Reference / Manual Alternative (Strict 4NF)
-- ==============================================================================
-- IMPORTANT NOTICE:
-- The canonical source of schema truth and migration runner for SyncTone is 
-- Alembic (located at: novel-audio-synthesizer/kokoro-tts-backend/alembic).
--
-- This raw SQL file provides the complete 12-table Strict 4NF schema matching
-- migrations 0001_initial_schema.py -> 0002_enforce_strict_3nf.py -> 0003_enforce_4nf.py.
-- It initializes all tables, indexes, triggers, constraint checks, views, and
-- stamps the alembic_version table so `alembic upgrade head` is completely idempotent.
-- ==============================================================================

-- 0. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users Table (Authentication & RBAC)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'reader' CHECK (role IN ('reader', 'writer', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_users_username ON users(username);
CREATE INDEX IF NOT EXISTS ix_users_email ON users(email);

-- 2. Voices Table (Unified Edge Neural + Kokoro Voice Catalog)
CREATE TABLE IF NOT EXISTS voices (
    id VARCHAR(64) PRIMARY KEY,
    label VARCHAR(100) NOT NULL,
    gender VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female', 'other')),
    age_band VARCHAR(10) NOT NULL DEFAULT 'adult' CHECK (age_band IN ('child', 'young', 'teen', 'adult', 'elder', 'elderly')),
    language VARCHAR(10) NOT NULL DEFAULT 'en-us',
    reserved_narrator BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Novels Table (Catalog & Portfolio Metadata)
CREATE TABLE IF NOT EXISTS novels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    added_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    synopsis TEXT,
    channel VARCHAR(20) NOT NULL DEFAULT 'verified' CHECK (channel IN ('verified', 'community')),
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    global_tone VARCHAR(100),
    portfolio_source VARCHAR(20) NOT NULL DEFAULT 'ai' CHECK (portfolio_source IN ('ai', 'manual')),
    cover_object VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_novels_added_by ON novels(added_by);

-- 4. Chapters Table (Relational Metadata & Swift Audio Reference)
-- Linked 1:1 to MongoDB chapters document collection via pg_chapter_id = id
CREATE TABLE IF NOT EXISTS chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    chapter_number INT NOT NULL,
    title VARCHAR(255) NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'completed', 'failed')),
    audio_version INT NOT NULL DEFAULT 1,
    swift_audio_object VARCHAR(512),
    total_duration_ms INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_chapters_novel_chapter_number UNIQUE (novel_id, chapter_number)
);

CREATE INDEX IF NOT EXISTS ix_chapters_novel_id ON chapters(novel_id);

-- 5. Characters Table (Grounded Character Cast Portfolio)
CREATE TABLE IF NOT EXISTS characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    canonical_name VARCHAR(100) NOT NULL,
    gender VARCHAR(10) NOT NULL DEFAULT 'unknown' CHECK (gender IN ('male', 'female', 'unknown')),
    age_band VARCHAR(10) NOT NULL DEFAULT 'adult' CHECK (age_band IN ('child', 'young', 'teen', 'adult', 'elder', 'elderly')),
    temperament VARCHAR(100),
    sample_quote TEXT,
    voice_id VARCHAR(64) REFERENCES voices(id) ON DELETE SET NULL,
    speed_multiplier REAL NOT NULL DEFAULT 1.0,
    is_narrator BOOLEAN NOT NULL DEFAULT false,
    needs_review BOOLEAN NOT NULL DEFAULT false,
    source VARCHAR(20) NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'manual', 'fallback')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_characters_novel_canonical_name UNIQUE (novel_id, canonical_name)
);

CREATE INDEX IF NOT EXISTS ix_characters_novel_id ON characters(novel_id);
CREATE INDEX IF NOT EXISTS ix_characters_voice_id ON characters(voice_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_characters_narrator_per_novel ON characters(novel_id) WHERE is_narrator = true;

-- 6. Character Aliases Table (Strict 4NF Alias Normalization)
-- Transitive novel_id removed; uniqueness per novel enforced via DB trigger + advisory lock
CREATE TABLE IF NOT EXISTS character_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL CONSTRAINT fk_character_aliases_character REFERENCES characters(id) ON DELETE CASCADE,
    alias VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_character_aliases_character_alias UNIQUE (character_id, alias)
);

CREATE INDEX IF NOT EXISTS ix_character_aliases_character_id ON character_aliases(character_id);

-- 7. Synthesis Jobs Table (Strict 4NF Pure Queue Broker with SKIP LOCKED)
CREATE TABLE IF NOT EXISTS synthesis_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    job_type VARCHAR(30) NOT NULL CONSTRAINT chk_synthesis_jobs_job_type CHECK (job_type IN ('profile_novel', 'synthesize_chapter')),
    status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'dead_letter')),
    progress_pct REAL NOT NULL DEFAULT 0.0,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    run_after TIMESTAMPTZ NOT NULL DEFAULT now(),
    worker_id VARCHAR(100),
    locked_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_synthesis_jobs_claim ON synthesis_jobs(status, run_after, attempts);
CREATE INDEX IF NOT EXISTS ix_synthesis_jobs_requested_by ON synthesis_jobs(requested_by);

-- 8. Novel Profile Job Targets Table (4NF Subtype for profile_novel Jobs)
CREATE TABLE IF NOT EXISTS novel_profile_job_targets (
    job_id UUID PRIMARY KEY REFERENCES synthesis_jobs(id) ON DELETE CASCADE,
    novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_novel_profile_job_targets_novel_id ON novel_profile_job_targets(novel_id);

-- 9. Chapter Synthesis Job Targets Table (4NF Subtype for synthesize_chapter Jobs)
CREATE TABLE IF NOT EXISTS chapter_synthesis_job_targets (
    job_id UUID PRIMARY KEY REFERENCES synthesis_jobs(id) ON DELETE CASCADE,
    chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_chapter_synthesis_job_targets_chapter_id ON chapter_synthesis_job_targets(chapter_id);

-- 10. Segment Audio Cache Table (LRU Lookup for Synthesized 24kHz PCM Buffers)
CREATE TABLE IF NOT EXISTS segment_audio_cache (
    text_hash VARCHAR(64) NOT NULL,
    voice_hash VARCHAR(64) NOT NULL,
    local_pcm_path VARCHAR(512) NOT NULL,
    n_samples INT NOT NULL,
    sample_rate INT NOT NULL DEFAULT 24000,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (text_hash, voice_hash)
);

CREATE INDEX IF NOT EXISTS idx_segment_audio_cache_lru ON segment_audio_cache(last_used_at);

-- 11. Playback History Table (Strict 4NF User-Novel Bookmark Identity)
CREATE TABLE IF NOT EXISTS playback_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_playback_history_user_novel UNIQUE (user_id, novel_id)
);

CREATE INDEX IF NOT EXISTS ix_playback_history_user_id ON playback_history(user_id);
CREATE INDEX IF NOT EXISTS ix_playback_history_novel_id ON playback_history(novel_id);

-- 12. Playback Positions Table (Strict 4NF Chapter & Millisecond Offset State)
CREATE TABLE IF NOT EXISTS playback_positions (
    history_id UUID PRIMARY KEY REFERENCES playback_history(id) ON DELETE CASCADE,
    chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    segment_order INT NOT NULL DEFAULT 0,
    position_ms INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_playback_positions_chapter_id ON playback_positions(chapter_id);

-- ==============================================================================
-- Triggers & Integrity Functions (Strict 3NF & 4NF Relational Constraints)
-- ==============================================================================

-- A. Subtype Target Matching Triggers for synthesis_jobs
CREATE OR REPLACE FUNCTION fn_check_novel_profile_target_subtype()
RETURNS TRIGGER AS $$
DECLARE
  v_job_type VARCHAR(30);
BEGIN
  SELECT job_type INTO v_job_type FROM synthesis_jobs WHERE id = NEW.job_id;
  IF v_job_type IS NULL THEN
    RAISE EXCEPTION 'Target subtype violation: referenced synthesis_job % does not exist', NEW.job_id;
  ELSIF v_job_type != 'profile_novel' THEN
    RAISE EXCEPTION 'Target subtype mismatch: novel_profile_job_targets can only target jobs with job_type = ''profile_novel'' (job % has job_type = ''%'')', NEW.job_id, v_job_type;
  END IF;
  IF EXISTS (SELECT 1 FROM chapter_synthesis_job_targets WHERE job_id = NEW.job_id) THEN
    RAISE EXCEPTION 'Target exclusivity violation: job % is already assigned to chapter_synthesis_job_targets', NEW.job_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_novel_profile_target_subtype ON novel_profile_job_targets;
CREATE TRIGGER trg_check_novel_profile_target_subtype
BEFORE INSERT OR UPDATE ON novel_profile_job_targets
FOR EACH ROW EXECUTE FUNCTION fn_check_novel_profile_target_subtype();

CREATE OR REPLACE FUNCTION fn_check_chapter_synthesis_target_subtype()
RETURNS TRIGGER AS $$
DECLARE
  v_job_type VARCHAR(30);
BEGIN
  SELECT job_type INTO v_job_type FROM synthesis_jobs WHERE id = NEW.job_id;
  IF v_job_type IS NULL THEN
    RAISE EXCEPTION 'Target subtype violation: referenced synthesis_job % does not exist', NEW.job_id;
  ELSIF v_job_type != 'synthesize_chapter' THEN
    RAISE EXCEPTION 'Target subtype mismatch: chapter_synthesis_job_targets can only target jobs with job_type = ''synthesize_chapter'' (job % has job_type = ''%'')', NEW.job_id, v_job_type;
  END IF;
  IF EXISTS (SELECT 1 FROM novel_profile_job_targets WHERE job_id = NEW.job_id) THEN
    RAISE EXCEPTION 'Target exclusivity violation: job % is already assigned to novel_profile_job_targets', NEW.job_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_chapter_synthesis_target_subtype ON chapter_synthesis_job_targets;
CREATE TRIGGER trg_check_chapter_synthesis_target_subtype
BEFORE INSERT OR UPDATE ON chapter_synthesis_job_targets
FOR EACH ROW EXECUTE FUNCTION fn_check_chapter_synthesis_target_subtype();

-- B. Job Target Immutability
CREATE OR REPLACE FUNCTION fn_prevent_job_target_reassignment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.job_id IS DISTINCT FROM OLD.job_id THEN
    RAISE EXCEPTION 'Target immutability violation: job_id cannot be reassigned (attempted to change % to %)', OLD.job_id, NEW.job_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_01_prevent_reassign_novel_target ON novel_profile_job_targets;
CREATE TRIGGER trg_01_prevent_reassign_novel_target
BEFORE UPDATE OF job_id ON novel_profile_job_targets
FOR EACH ROW EXECUTE FUNCTION fn_prevent_job_target_reassignment();

DROP TRIGGER IF EXISTS trg_01_prevent_reassign_chapter_target ON chapter_synthesis_job_targets;
CREATE TRIGGER trg_01_prevent_reassign_chapter_target
BEFORE UPDATE OF job_id ON chapter_synthesis_job_targets
FOR EACH ROW EXECUTE FUNCTION fn_prevent_job_target_reassignment();

-- C. Deferred Target Completeness for synthesis_jobs
CREATE OR REPLACE FUNCTION fn_check_synthesis_job_target_completeness()
RETURNS TRIGGER AS $$
DECLARE
  v_job_type VARCHAR(30);
BEGIN
  SELECT job_type INTO v_job_type FROM synthesis_jobs WHERE id = NEW.id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_job_type = 'profile_novel' THEN
    IF NOT EXISTS (SELECT 1 FROM novel_profile_job_targets WHERE job_id = NEW.id) THEN
      RAISE EXCEPTION 'Target completeness violation: synthesis_job % of type profile_novel has no matching target row in novel_profile_job_targets at commit time', NEW.id;
    END IF;
  ELSIF v_job_type = 'synthesize_chapter' THEN
    IF NOT EXISTS (SELECT 1 FROM chapter_synthesis_job_targets WHERE job_id = NEW.id) THEN
      RAISE EXCEPTION 'Target completeness violation: synthesis_job % of type synthesize_chapter has no matching target row in chapter_synthesis_job_targets at commit time', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_synthesis_job_target_completeness ON synthesis_jobs;
CREATE CONSTRAINT TRIGGER trg_synthesis_job_target_completeness
AFTER INSERT OR UPDATE ON synthesis_jobs
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_check_synthesis_job_target_completeness();

-- D. Cascading Delete of Parent synthesis_job on Target Deletion
CREATE OR REPLACE FUNCTION fn_delete_parent_synthesis_job()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM synthesis_jobs WHERE id = OLD.job_id) THEN
    DELETE FROM synthesis_jobs WHERE id = OLD.job_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cascade_delete_novel_job ON novel_profile_job_targets;
CREATE TRIGGER trg_cascade_delete_novel_job
AFTER DELETE ON novel_profile_job_targets
FOR EACH ROW EXECUTE FUNCTION fn_delete_parent_synthesis_job();

DROP TRIGGER IF EXISTS trg_cascade_delete_chapter_job ON chapter_synthesis_job_targets;
CREATE TRIGGER trg_cascade_delete_chapter_job
AFTER DELETE ON chapter_synthesis_job_targets
FOR EACH ROW EXECUTE FUNCTION fn_delete_parent_synthesis_job();

-- E. 4NF Playback Cross-Novel Verification & Synchronization Triggers
CREATE OR REPLACE FUNCTION fn_check_playback_position_chapter_novel()
RETURNS TRIGGER AS $$
DECLARE
  v_novel_id UUID;
  v_chapter_novel_id UUID;
  v_lock1 BIGINT;
  v_lock2 BIGINT;
BEGIN
  SELECT novel_id INTO v_novel_id FROM playback_history WHERE id = NEW.history_id FOR SHARE;
  IF v_novel_id IS NULL THEN
    RAISE EXCEPTION 'Referenced playback_history bookmark % does not exist', NEW.history_id;
  END IF;

  SELECT novel_id INTO v_chapter_novel_id FROM chapters WHERE id = NEW.chapter_id FOR SHARE;
  IF v_chapter_novel_id IS NULL THEN
    RAISE EXCEPTION 'Referenced chapter % does not exist', NEW.chapter_id;
  END IF;

  v_lock1 := hashtext('history_novel_sync_' || NEW.history_id::text);
  v_lock2 := hashtext('chapter_novel_sync_' || NEW.chapter_id::text);
  IF v_lock1 < v_lock2 THEN
    PERFORM pg_advisory_xact_lock(v_lock1);
    PERFORM pg_advisory_xact_lock(v_lock2);
  ELSIF v_lock1 > v_lock2 THEN
    PERFORM pg_advisory_xact_lock(v_lock2);
    PERFORM pg_advisory_xact_lock(v_lock1);
  ELSE
    PERFORM pg_advisory_xact_lock(v_lock1);
  END IF;

  IF v_chapter_novel_id != v_novel_id THEN
    RAISE EXCEPTION 'Playback chapter mismatch: chapter % (novel %) does not belong to bookmark % (novel %)',
      NEW.chapter_id, v_chapter_novel_id, NEW.history_id, v_novel_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_playback_position_chapter_novel ON playback_positions;
CREATE TRIGGER trg_check_playback_position_chapter_novel
BEFORE INSERT OR UPDATE OF chapter_id, history_id ON playback_positions
FOR EACH ROW EXECUTE FUNCTION fn_check_playback_position_chapter_novel();

CREATE OR REPLACE FUNCTION fn_check_playback_history_novel_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.novel_id IS DISTINCT FROM OLD.novel_id THEN
    PERFORM pg_advisory_xact_lock(hashtext('history_novel_sync_' || NEW.id::text));

    IF EXISTS (
      SELECT 1 FROM playback_positions p
      JOIN chapters c ON p.chapter_id = c.id
      WHERE p.history_id = NEW.id AND c.novel_id IS DISTINCT FROM NEW.novel_id
    ) THEN
      RAISE EXCEPTION 'Cannot update playback_history novel_id: existing playback_position chapter does not belong to novel %', NEW.novel_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_playback_history_novel_update ON playback_history;
CREATE TRIGGER trg_check_playback_history_novel_update
BEFORE UPDATE OF novel_id ON playback_history
FOR EACH ROW EXECUTE FUNCTION fn_check_playback_history_novel_update();

CREATE OR REPLACE FUNCTION fn_check_chapter_novel_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.novel_id IS DISTINCT FROM OLD.novel_id THEN
    PERFORM pg_advisory_xact_lock(hashtext('chapter_novel_sync_' || NEW.id::text));

    IF EXISTS (
      SELECT 1 FROM playback_positions p
      JOIN playback_history h ON p.history_id = h.id
      WHERE p.chapter_id = NEW.id AND h.novel_id IS DISTINCT FROM NEW.novel_id
    ) THEN
      RAISE EXCEPTION 'Cannot update chapters novel_id: chapter % is currently referenced by playback_positions in bookmark for novel %',
        NEW.id, OLD.novel_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_chapter_novel_update ON chapters;
CREATE TRIGGER trg_check_chapter_novel_update
BEFORE UPDATE OF novel_id ON chapters
FOR EACH ROW EXECUTE FUNCTION fn_check_chapter_novel_update();

-- F. 4NF Character Alias Cross-Novel Uniqueness Triggers
CREATE OR REPLACE FUNCTION fn_check_character_alias_novel_uniqueness()
RETURNS TRIGGER AS $$
DECLARE
  v_novel_id UUID;
  v_old_novel_id UUID;
  v_lock1 BIGINT;
  v_lock2 BIGINT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.character_id = OLD.character_id THEN
      SELECT novel_id INTO v_novel_id FROM characters WHERE id = NEW.character_id FOR SHARE;
    ELSE
      SELECT novel_id INTO v_novel_id FROM characters WHERE id = NEW.character_id FOR SHARE;
      SELECT novel_id INTO v_old_novel_id FROM characters WHERE id = OLD.character_id FOR SHARE;
    END IF;

    IF v_novel_id IS NULL THEN
      RAISE EXCEPTION 'Referenced character % does not exist', NEW.character_id;
    END IF;

    IF v_old_novel_id IS NOT NULL AND v_old_novel_id IS DISTINCT FROM v_novel_id THEN
      v_lock1 := hashtext('char_alias_novel_' || v_old_novel_id::text);
      v_lock2 := hashtext('char_alias_novel_' || v_novel_id::text);
      IF v_lock1 < v_lock2 THEN
        PERFORM pg_advisory_xact_lock(v_lock1);
        PERFORM pg_advisory_xact_lock(v_lock2);
      ELSIF v_lock1 > v_lock2 THEN
        PERFORM pg_advisory_xact_lock(v_lock2);
        PERFORM pg_advisory_xact_lock(v_lock1);
      ELSE
        PERFORM pg_advisory_xact_lock(v_lock1);
      END IF;
    ELSE
      PERFORM pg_advisory_xact_lock(hashtext('char_alias_novel_' || v_novel_id::text));
    END IF;
  ELSE
    SELECT novel_id INTO v_novel_id FROM characters WHERE id = NEW.character_id FOR SHARE;
    IF v_novel_id IS NULL THEN
      RAISE EXCEPTION 'Referenced character % does not exist', NEW.character_id;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('char_alias_novel_' || v_novel_id::text));
  END IF;

  IF EXISTS (
    SELECT 1 FROM character_aliases ca
    JOIN characters c ON ca.character_id = c.id
    WHERE c.novel_id = v_novel_id
      AND ca.alias = NEW.alias
      AND ca.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Unique alias violation: alias ''%'' already exists for novel %', NEW.alias, v_novel_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_character_alias_novel_uniqueness ON character_aliases;
CREATE TRIGGER trg_check_character_alias_novel_uniqueness
BEFORE INSERT OR UPDATE OF character_id, alias ON character_aliases
FOR EACH ROW EXECUTE FUNCTION fn_check_character_alias_novel_uniqueness();

CREATE OR REPLACE FUNCTION fn_check_character_novel_update()
RETURNS TRIGGER AS $$
DECLARE
  v_lock1 BIGINT;
  v_lock2 BIGINT;
BEGIN
  IF NEW.novel_id IS DISTINCT FROM OLD.novel_id THEN
    v_lock1 := hashtext('char_alias_novel_' || OLD.novel_id::text);
    v_lock2 := hashtext('char_alias_novel_' || NEW.novel_id::text);

    IF v_lock1 < v_lock2 THEN
      PERFORM pg_advisory_xact_lock(v_lock1);
      PERFORM pg_advisory_xact_lock(v_lock2);
    ELSIF v_lock1 > v_lock2 THEN
      PERFORM pg_advisory_xact_lock(v_lock2);
      PERFORM pg_advisory_xact_lock(v_lock1);
    ELSE
      PERFORM pg_advisory_xact_lock(v_lock1);
    END IF;

    IF EXISTS (
      SELECT 1 FROM character_aliases ca1
      JOIN character_aliases ca2 ON ca1.alias = ca2.alias
      JOIN characters c2 ON ca2.character_id = c2.id
      WHERE ca1.character_id = NEW.id
        AND c2.novel_id = NEW.novel_id
        AND c2.id IS DISTINCT FROM NEW.id
    ) THEN
      RAISE EXCEPTION 'Cannot update character novel_id: alias collision detected in target novel %', NEW.novel_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_character_novel_update ON characters;
CREATE TRIGGER trg_check_character_novel_update
BEFORE UPDATE OF novel_id ON characters
FOR EACH ROW EXECUTE FUNCTION fn_check_character_novel_update();

-- ==============================================================================
-- Projection Views
-- ==============================================================================

CREATE OR REPLACE VIEW v_synthesis_jobs AS
SELECT
  j.id,
  COALESCE(np.novel_id, c.novel_id) AS novel_id,
  cs.chapter_id,
  j.requested_by,
  j.job_type,
  j.status,
  j.progress_pct,
  j.attempts,
  j.max_attempts,
  j.run_after,
  j.worker_id,
  j.locked_at,
  j.error_message,
  j.created_at,
  j.completed_at
FROM synthesis_jobs j
LEFT JOIN novel_profile_job_targets np ON j.id = np.job_id
LEFT JOIN chapter_synthesis_job_targets cs ON j.id = cs.job_id
LEFT JOIN chapters c ON cs.chapter_id = c.id;

CREATE OR REPLACE VIEW v_character_aliases AS
SELECT
  ca.id,
  c.novel_id,
  ca.character_id,
  ca.alias
FROM character_aliases ca
JOIN characters c ON ca.character_id = c.id;

CREATE OR REPLACE VIEW v_playback_history AS
SELECT
  h.id,
  h.user_id,
  h.novel_id,
  p.chapter_id,
  p.segment_order,
  p.position_ms,
  p.updated_at
FROM playback_history h
LEFT JOIN playback_positions p ON h.id = p.history_id;

CREATE OR REPLACE VIEW reading_progress AS
SELECT
  h.id,
  h.user_id,
  h.novel_id,
  p.chapter_id,
  p.segment_order,
  p.position_ms,
  p.updated_at
FROM playback_history h
LEFT JOIN playback_positions p ON h.id = p.history_id;

-- ==============================================================================
-- Seed Data: 20 Unified Voices (12 Kokoro-82M + 8 Microsoft Edge Neural)
-- ==============================================================================
INSERT INTO voices (id, label, gender, age_band, language, reserved_narrator) VALUES
('am_adam', 'Adam (Narrator Default)', 'male', 'adult', 'en-us', true),
('af_heart', 'Heart (Warm & Expressive)', 'female', 'adult', 'en-us', false),
('af_bella', 'Bella (Lively & Clear)', 'female', 'adult', 'en-us', false),
('af_nicole', 'Nicole (Youthful)', 'female', 'young', 'en-us', false),
('af_sarah', 'Sarah (Mature)', 'female', 'elder', 'en-us', false),
('am_michael', 'Michael (Strong & Resonant)', 'male', 'adult', 'en-us', false),
('am_george', 'George (Deep & Mature)', 'male', 'elder', 'en-us', false),
('am_onyx', 'Onyx (Deep Male)', 'male', 'adult', 'en-us', false),
('af_sky', 'Sky (Calm Female)', 'female', 'adult', 'en-us', false),
('bm_george', 'George (British Received)', 'male', 'adult', 'en-gb', false),
('bf_emma', 'Emma (British Refined)', 'female', 'young', 'en-gb', false),
('bm_daniel', 'Daniel (British Expressive)', 'male', 'young', 'en-gb', false),
('en-GB-RyanNeural', 'Ryan Neural (British Narrator)', 'male', 'adult', 'en-gb', true),
('en-GB-ThomasNeural', 'Thomas Neural (Harry Potter)', 'male', 'young', 'en-gb', false),
('en-GB-LibbyNeural', 'Libby Neural (Hermione Granger)', 'female', 'young', 'en-gb', false),
('en-GB-AlfieNeural', 'Alfie Neural (Ron Weasley)', 'male', 'young', 'en-gb', false),
('en-GB-ArthurNeural', 'Arthur Neural (Albus Dumbledore)', 'male', 'elder', 'en-gb', false),
('en-GB-NoahNeural', 'Noah Neural (Severus Snape)', 'male', 'adult', 'en-gb', false),
('en-GB-SoniaNeural', 'Sonia Neural (Prof. McGonagall)', 'female', 'adult', 'en-gb', false),
('en-GB-OliverNeural', 'Oliver Neural (Draco Malfoy)', 'male', 'young', 'en-gb', false)
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- Alembic Version Stamp (SyncTone Strict 4NF Head)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS alembic_version (
    version_num VARCHAR(32) NOT NULL PRIMARY KEY
);

INSERT INTO alembic_version (version_num) 
VALUES ('0003_enforce_4nf') 
ON CONFLICT (version_num) DO NOTHING;
