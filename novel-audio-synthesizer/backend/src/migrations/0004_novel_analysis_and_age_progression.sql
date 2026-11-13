-- ==============================================================================
-- Migration 0004: Novel Analysis, Character Age Progression, Timeline Anchors,
--                 and Pronunciation Dictionaries
-- ==============================================================================
-- Adds 4 new tables and extends the `characters` table with new columns.
-- Safe to re-run: all statements use IF NOT EXISTS.
-- ==============================================================================

-- ---------------------------------------------------------------------------
-- 1. New columns on `characters`
-- ---------------------------------------------------------------------------
ALTER TABLE characters ADD COLUMN IF NOT EXISTS description   TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS role          VARCHAR(20) NOT NULL DEFAULT 'minor';
ALTER TABLE characters ADD COLUMN IF NOT EXISTS dialogue_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS first_chapter  INTEGER;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS last_chapter   INTEGER;

-- ---------------------------------------------------------------------------
-- 2. Novel Analyses Table (AI Understanding Results)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS novel_analyses (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    novel_id        UUID        NOT NULL UNIQUE,
    status          VARCHAR(30) NOT NULL DEFAULT 'pending',
    analysis_data   JSONB,
    character_count INTEGER     NOT NULL DEFAULT 0,
    dialogue_count  INTEGER     NOT NULL DEFAULT 0,
    error_message   TEXT,
    created_at      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT fk_novel_analyses_novel
        FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_novel_analyses_novel_id
    ON novel_analyses (novel_id);

-- ---------------------------------------------------------------------------
-- 3. Character Age Stages Table (Voice Evolution Across Story Chronology)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS character_age_stages (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id     UUID        NOT NULL,
    stage_name       VARCHAR(50) NOT NULL,
    approx_age_min   INTEGER,
    approx_age_max   INTEGER,
    base_voice_id    VARCHAR(64) NOT NULL,
    pitch_adjustment VARCHAR(10) NOT NULL DEFAULT '+0%',
    rate_adjustment  VARCHAR(10) NOT NULL DEFAULT '+0%',
    created_at       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT fk_character_age_stages_character
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_character_age_stages_voice
        FOREIGN KEY (base_voice_id) REFERENCES voices(id)
);

ALTER TABLE character_age_stages
    DROP CONSTRAINT IF EXISTS uq_character_age_stage;
ALTER TABLE character_age_stages
    ADD CONSTRAINT uq_character_age_stage UNIQUE (character_id, stage_name);

CREATE INDEX IF NOT EXISTS ix_character_age_stages_character_id
    ON character_age_stages (character_id);

-- ---------------------------------------------------------------------------
-- 4. Chapter Timeline Anchors Table (Story Chronology)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chapter_timeline_anchors (
    id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id   UUID    NOT NULL UNIQUE,
    story_order  INTEGER NOT NULL,
    story_year   DECIMAL(8, 2),
    is_flashback BOOLEAN NOT NULL DEFAULT false,
    is_time_jump BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT fk_chapter_timeline_anchors_chapter
        FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- 5. Pronunciation Dictionaries Table (Novel-Scoped Phonetic Overrides)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pronunciation_dictionaries (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    novel_id   UUID         NOT NULL,
    word       VARCHAR(100) NOT NULL,
    phonetic   VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT fk_pronunciation_dictionaries_novel
        FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
);

ALTER TABLE pronunciation_dictionaries
    DROP CONSTRAINT IF EXISTS uq_pronunciation_dict_novel_word;
ALTER TABLE pronunciation_dictionaries
    ADD CONSTRAINT uq_pronunciation_dict_novel_word UNIQUE (novel_id, word);

CREATE INDEX IF NOT EXISTS ix_pronunciation_dictionaries_novel_id
    ON pronunciation_dictionaries (novel_id);
