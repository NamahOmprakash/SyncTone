"""0001_initial_schema

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-10-12 11:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 0. Ensure PostgreSQL UUID and crypto extensions
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')

    # 1. Users Table
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=20), server_default="reader", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("role IN ('reader', 'writer', 'admin')", name="chk_users_role"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("username"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)

    # 2. Voices Table (Kokoro-82M Voice Catalog)
    op.create_table(
        "voices",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=100), nullable=False),
        sa.Column("gender", sa.String(length=10), nullable=False),
        sa.Column("age_band", sa.String(length=10), server_default="adult", nullable=False),
        sa.Column("language", sa.String(length=10), server_default="en-us", nullable=False),
        sa.Column("reserved_narrator", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("age_band IN ('child', 'young', 'teen', 'adult', 'elder', 'elderly')", name="chk_voices_age_band"),
        sa.CheckConstraint("gender IN ('male', 'female')", name="chk_voices_gender"),
        sa.PrimaryKeyConstraint("id"),
    )

    # 3. Novels Table
    op.create_table(
        "novels",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("added_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("synopsis", sa.Text(), nullable=True),
        sa.Column("channel", sa.String(length=20), server_default="verified", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="draft", nullable=False),
        sa.Column("global_tone", sa.String(length=100), nullable=True),
        sa.Column("portfolio_source", sa.String(length=20), server_default="ai", nullable=False),
        sa.Column("cover_object", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("channel IN ('verified', 'community')", name="chk_novels_channel"),
        sa.CheckConstraint("portfolio_source IN ('manual', 'ai')", name="chk_novels_portfolio_source"),
        sa.CheckConstraint("status IN ('draft', 'profiling', 'published', 'archived')", name="chk_novels_status"),
        sa.ForeignKeyConstraint(["added_by"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_novels_added_by"), "novels", ["added_by"], unique=False)

    # 4. Chapters Table
    op.create_table(
        "chapters",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("novel_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chapter_number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), server_default="", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="draft", nullable=False),
        sa.Column("audio_version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("swift_audio_object", sa.String(length=512), nullable=True),
        sa.Column("total_duration_ms", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("chapter_number > 0", name="chk_chapters_chapter_number"),
        sa.CheckConstraint(
            "status IN ('draft', 'parsed', 'synthesizing', 'completed', 'outdated', 'failed')",
            name="chk_chapters_status",
        ),
        sa.ForeignKeyConstraint(["novel_id"], ["novels.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("novel_id", "chapter_number", name="uq_chapters_novel_chapter_number"),
    )
    op.create_index(op.f("ix_chapters_novel_id"), "chapters", ["novel_id"], unique=False)

    # 5. Characters Table
    op.create_table(
        "characters",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("novel_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("canonical_name", sa.String(length=100), nullable=False),
        sa.Column("gender", sa.String(length=10), server_default="unknown", nullable=False),
        sa.Column("age_band", sa.String(length=10), server_default="adult", nullable=False),
        sa.Column("temperament", sa.String(length=100), nullable=True),
        sa.Column("sample_quote", sa.Text(), nullable=True),
        sa.Column("voice_id", sa.String(length=64), nullable=True),
        sa.Column("speed_multiplier", sa.Float(), server_default="1.0", nullable=False),
        sa.Column("is_narrator", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("needs_review", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("source", sa.String(length=20), server_default="ai", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("age_band IN ('child', 'young', 'teen', 'adult', 'elder', 'elderly')", name="chk_characters_age_band"),
        sa.CheckConstraint("gender IN ('male', 'female', 'unknown')", name="chk_characters_gender"),
        sa.CheckConstraint("source IN ('manual', 'ai')", name="chk_characters_source"),
        sa.CheckConstraint("speed_multiplier >= 0.5 AND speed_multiplier <= 2.0", name="chk_characters_speed_multiplier"),
        sa.ForeignKeyConstraint(["novel_id"], ["novels.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["voice_id"], ["voices.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("novel_id", "canonical_name", name="uq_characters_novel_canonical_name"),
    )
    op.create_index(op.f("ix_characters_novel_id"), "characters", ["novel_id"], unique=False)
    op.create_index(op.f("ix_characters_voice_id"), "characters", ["voice_id"], unique=False)
    # Partial unique index: at most one narrator per novel
    op.create_index(
        "uq_characters_narrator_per_novel",
        "characters",
        ["novel_id"],
        unique=True,
        postgresql_where=sa.text("is_narrator = true"),
    )

    # 6. Character Aliases Table
    op.create_table(
        "character_aliases",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("novel_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("character_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("alias", sa.String(length=100), nullable=False),
        sa.ForeignKeyConstraint(["character_id"], ["characters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["novel_id"], ["novels.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("novel_id", "alias", name="uq_character_aliases_novel_alias"),
    )
    op.create_index(op.f("ix_character_aliases_character_id"), "character_aliases", ["character_id"], unique=False)
    op.create_index(op.f("ix_character_aliases_novel_id"), "character_aliases", ["novel_id"], unique=False)

    # 7. Synthesis Jobs Table (Task Queue)
    op.create_table(
        "synthesis_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("novel_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chapter_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("job_type", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="queued", nullable=False),
        sa.Column("progress_pct", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("max_attempts", sa.Integer(), server_default="3", nullable=False),
        sa.Column("run_after", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("worker_id", sa.String(length=100), nullable=True),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "(job_type = 'profile_novel' AND chapter_id IS NULL) OR "
            "(job_type = 'synthesize_chapter' AND chapter_id IS NOT NULL)",
            name="chk_jobs_type_chapter_match",
        ),
        sa.CheckConstraint("job_type IN ('profile_novel', 'synthesize_chapter')", name="chk_jobs_job_type"),
        sa.CheckConstraint("status IN ('queued', 'processing', 'completed', 'failed')", name="chk_jobs_status"),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["novel_id"], ["novels.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_synthesis_jobs_claim", "synthesis_jobs", ["status", "run_after", "attempts"], unique=False)
    op.create_index(op.f("ix_synthesis_jobs_chapter_id"), "synthesis_jobs", ["chapter_id"], unique=False)
    op.create_index(op.f("ix_synthesis_jobs_novel_id"), "synthesis_jobs", ["novel_id"], unique=False)
    op.create_index(op.f("ix_synthesis_jobs_requested_by"), "synthesis_jobs", ["requested_by"], unique=False)

    # 8. Segment Audio Cache Table
    op.create_table(
        "segment_audio_cache",
        sa.Column("text_hash", sa.String(length=64), nullable=False),
        sa.Column("voice_hash", sa.String(length=64), nullable=False),
        sa.Column("local_pcm_path", sa.String(length=512), nullable=False),
        sa.Column("n_samples", sa.Integer(), nullable=False),
        sa.Column("sample_rate", sa.Integer(), server_default="24000", nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("text_hash", "voice_hash"),
    )
    op.create_index("idx_segment_audio_cache_lru", "segment_audio_cache", ["last_used_at"], unique=False)

    # 9. Playback History Table
    op.create_table(
        "playback_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("novel_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chapter_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("segment_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("position_ms", sa.Integer(), server_default="0", nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["novel_id"], ["novels.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "novel_id", name="uq_playback_history_user_novel"),
    )
    op.create_index(op.f("ix_playback_history_chapter_id"), "playback_history", ["chapter_id"], unique=False)
    op.create_index(op.f("ix_playback_history_novel_id"), "playback_history", ["novel_id"], unique=False)
    op.create_index(op.f("ix_playback_history_user_id"), "playback_history", ["user_id"], unique=False)

    # 10. Compatibility View: reading_progress -> playback_history
    op.execute("CREATE OR REPLACE VIEW reading_progress AS SELECT * FROM playback_history;")

    # 11. Seed Default Voice Catalog (Edge Neural + Kokoro Fallback)
    op.execute("""
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
    """)


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS reading_progress CASCADE")
    op.drop_table("playback_history")
    op.drop_index("idx_segment_audio_cache_lru", table_name="segment_audio_cache")
    op.drop_table("segment_audio_cache")
    op.drop_index("idx_synthesis_jobs_claim", table_name="synthesis_jobs")
    op.drop_index(op.f("ix_synthesis_jobs_requested_by"), table_name="synthesis_jobs")
    op.drop_index(op.f("ix_synthesis_jobs_novel_id"), table_name="synthesis_jobs")
    op.drop_index(op.f("ix_synthesis_jobs_chapter_id"), table_name="synthesis_jobs")
    op.drop_table("synthesis_jobs")
    op.drop_index(op.f("ix_character_aliases_novel_id"), table_name="character_aliases")
    op.drop_index(op.f("ix_character_aliases_character_id"), table_name="character_aliases")
    op.drop_table("character_aliases")
    op.drop_index("uq_characters_narrator_per_novel", table_name="characters")
    op.drop_index(op.f("ix_characters_voice_id"), table_name="characters")
    op.drop_index(op.f("ix_characters_novel_id"), table_name="characters")
    op.drop_table("characters")
    op.drop_index(op.f("ix_chapters_novel_id"), table_name="chapters")
    op.drop_table("chapters")
    op.drop_index(op.f("ix_novels_added_by"), table_name="novels")
    op.drop_table("novels")
    op.drop_table("voices")
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
