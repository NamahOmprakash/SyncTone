"""SQLAlchemy 2.0 ORM models for SyncTone PostgreSQL relational core."""

import uuid
from datetime import datetime
from typing import Optional, List

from sqlalchemy import (
    String,
    Text,
    Boolean,
    Integer,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    DateTime,
    UniqueConstraint,
    CheckConstraint,
    Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.base import Base


# ==============================================================================
# 1. Users Table (Authentication & RBAC)
# ==============================================================================
class User(Base):
    """Registered user accounts with role-based access control."""
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="reader",
        server_default="reader",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint("role IN ('reader', 'writer', 'admin')", name="chk_users_role"),
    )

    # Relationships
    novels: Mapped[List["Novel"]] = relationship("Novel", back_populates="uploader", cascade="all, delete-orphan")
    synthesis_jobs: Mapped[List["SynthesisJob"]] = relationship("SynthesisJob", back_populates="requester")
    playback_history: Mapped[List["PlaybackHistory"]] = relationship("PlaybackHistory", back_populates="user", cascade="all, delete-orphan")


# ==============================================================================
# 2. Voices Table (Kokoro-82M Voice Catalog)
# ==============================================================================
class Voice(Base):
    """Neural voice models and acoustic profile metadata."""
    __tablename__ = "voices"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    gender: Mapped[str] = mapped_column(String(10), nullable=False)
    age_band: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="adult",
        server_default="adult",
    )
    language: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="en-us",
        server_default="en-us",
    )
    reserved_narrator: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint("gender IN ('male', 'female')", name="chk_voices_gender"),
        CheckConstraint("age_band IN ('child', 'young', 'teen', 'adult', 'elder', 'elderly')", name="chk_voices_age_band"),
    )

    # Relationships
    characters: Mapped[List["Character"]] = relationship("Character", back_populates="voice")


# ==============================================================================
# 3. Novels Table (Catalog & Portfolio Metadata)
# ==============================================================================
class Novel(Base):
    """Novels ingested into the library catalog."""
    __tablename__ = "novels"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    added_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    synopsis: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    channel: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="verified",
        server_default="verified",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="draft",
        server_default="draft",
    )
    global_tone: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    portfolio_source: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="ai",
        server_default="ai",
    )
    cover_object: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint("channel IN ('verified', 'community')", name="chk_novels_channel"),
        CheckConstraint("status IN ('draft', 'profiling', 'published', 'archived')", name="chk_novels_status"),
        CheckConstraint("portfolio_source IN ('manual', 'ai')", name="chk_novels_portfolio_source"),
    )

    # Relationships
    uploader: Mapped["User"] = relationship("User", back_populates="novels")
    chapters: Mapped[List["Chapter"]] = relationship("Chapter", back_populates="novel", cascade="all, delete-orphan")
    characters: Mapped[List["Character"]] = relationship("Character", back_populates="novel", cascade="all, delete-orphan")
    profile_job_targets: Mapped[List["NovelProfileJobTarget"]] = relationship("NovelProfileJobTarget", back_populates="novel", cascade="all, delete-orphan")
    playback_history: Mapped[List["PlaybackHistory"]] = relationship("PlaybackHistory", back_populates="novel", cascade="all, delete-orphan")


# ==============================================================================
# 4. Chapters Table (Metadata & Swift Audio Reference)
# ==============================================================================
class Chapter(Base):
    """Chapter metadata, audio versioning, and Swift audio object pointer."""
    __tablename__ = "chapters"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    novel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("novels.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chapter_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="", server_default="")
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="draft",
        server_default="draft",
    )
    audio_version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )
    swift_audio_object: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    total_duration_ms: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("novel_id", "chapter_number", name="uq_chapters_novel_chapter_number"),
        CheckConstraint("chapter_number > 0", name="chk_chapters_chapter_number"),
        CheckConstraint(
            "status IN ('draft', 'parsed', 'synthesizing', 'completed', 'outdated', 'failed')",
            name="chk_chapters_status",
        ),
    )

    # Relationships
    novel: Mapped["Novel"] = relationship("Novel", back_populates="chapters")
    synthesis_job_targets: Mapped[List["ChapterSynthesisJobTarget"]] = relationship("ChapterSynthesisJobTarget", back_populates="chapter", cascade="all, delete-orphan")
    playback_positions: Mapped[List["PlaybackPosition"]] = relationship("PlaybackPosition", back_populates="chapter", cascade="all, delete-orphan")


# ==============================================================================
# 5. Characters Table (Grounded Character Cast Portfolio)
# ==============================================================================
class Character(Base):
    """Discovered or manually specified character personas and assigned voices."""
    __tablename__ = "characters"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    novel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("novels.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    canonical_name: Mapped[str] = mapped_column(String(100), nullable=False)
    gender: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="unknown",
        server_default="unknown",
    )
    age_band: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="adult",
        server_default="adult",
    )
    temperament: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    sample_quote: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    voice_id: Mapped[Optional[str]] = mapped_column(
        String(64),
        ForeignKey("voices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    speed_multiplier: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=1.0,
        server_default="1.0",
    )
    is_narrator: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )
    needs_review: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )
    source: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="ai",
        server_default="ai",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("novel_id", "canonical_name", name="uq_characters_novel_canonical_name"),
        CheckConstraint("gender IN ('male', 'female', 'unknown')", name="chk_characters_gender"),
        CheckConstraint("age_band IN ('child', 'young', 'teen', 'adult', 'elder', 'elderly')", name="chk_characters_age_band"),
        CheckConstraint("source IN ('manual', 'ai')", name="chk_characters_source"),
        CheckConstraint("speed_multiplier >= 0.5 AND speed_multiplier <= 2.0", name="chk_characters_speed_multiplier"),
        # Partial unique index: at most one narrator per novel
        Index(
            "uq_characters_narrator_per_novel",
            "novel_id",
            unique=True,
            postgresql_where=(is_narrator.is_(True)),
        ),
    )

    # Relationships
    novel: Mapped["Novel"] = relationship("Novel", back_populates="characters")
    voice: Mapped[Optional["Voice"]] = relationship("Voice", back_populates="characters")
    aliases: Mapped[List["CharacterAlias"]] = relationship("CharacterAlias", back_populates="character", cascade="all, delete-orphan")


# ==============================================================================
# 6. Character Aliases Table (Normalization for Attribution Resolution - 4NF)
# ==============================================================================
class CharacterAlias(Base):
    """Maps name variations (e.g., 'Harry', 'Potter', 'Mr Potter') to canonical character (Strict 4NF)."""
    __tablename__ = "character_aliases"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    character_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("characters.id", ondelete="CASCADE", name="fk_character_aliases_character"),
        nullable=False,
        index=True,
    )
    alias: Mapped[str] = mapped_column(String(100), nullable=False)

    __table_args__ = (
        UniqueConstraint("character_id", "alias", name="uq_character_aliases_character_alias"),
    )

    # Relationships
    character: Mapped["Character"] = relationship("Character", back_populates="aliases")

    @property
    def novel_id(self) -> Optional[uuid.UUID]:
        return self.character.novel_id if self.character else None


# ==============================================================================
# 7. Synthesis Jobs Table (PostgreSQL Task Queue with SKIP LOCKED)
# ==============================================================================
class SynthesisJob(Base):
    """Task queue broker table for asynchronous AI profiling and TTS chapter synthesis (Strict BCNF/3NF)."""
    __tablename__ = "synthesis_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    requested_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    job_type: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="queued",
        server_default="queued",
    )
    progress_pct: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=0.0,
        server_default="0.0",
    )
    attempts: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    max_attempts: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=3,
        server_default="3",
    )
    run_after: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    worker_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    locked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint("job_type IN ('profile_novel', 'synthesize_chapter')", name="chk_synthesis_jobs_job_type"),
        CheckConstraint("status IN ('queued', 'processing', 'completed', 'failed')", name="chk_jobs_status"),
        # Composite index powering high-concurrency FOR UPDATE SKIP LOCKED job claims
        Index("idx_synthesis_jobs_claim", "status", "run_after", "attempts"),
    )

    # Relationships
    requester: Mapped[Optional["User"]] = relationship("User", back_populates="synthesis_jobs")
    novel_target: Mapped[Optional["NovelProfileJobTarget"]] = relationship(
        "NovelProfileJobTarget", back_populates="job", uselist=False, cascade="all, delete-orphan"
    )
    chapter_target: Mapped[Optional["ChapterSynthesisJobTarget"]] = relationship(
        "ChapterSynthesisJobTarget", back_populates="job", uselist=False, cascade="all, delete-orphan"
    )

    @property
    def novel_id(self) -> Optional[uuid.UUID]:
        if self.novel_target:
            return self.novel_target.novel_id
        if self.chapter_target and self.chapter_target.chapter:
            return self.chapter_target.chapter.novel_id
        return None

    @property
    def chapter_id(self) -> Optional[uuid.UUID]:
        if self.chapter_target:
            return self.chapter_target.chapter_id
        return None


class NovelProfileJobTarget(Base):
    """Job target relation for novel profiling jobs (Strict BCNF/3NF)."""
    __tablename__ = "novel_profile_job_targets"

    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("synthesis_jobs.id", ondelete="CASCADE"),
        primary_key=True,
    )
    novel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("novels.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    job: Mapped["SynthesisJob"] = relationship("SynthesisJob", back_populates="novel_target")
    novel: Mapped["Novel"] = relationship("Novel", back_populates="profile_job_targets")


class ChapterSynthesisJobTarget(Base):
    """Job target relation for chapter TTS synthesis jobs (Strict BCNF/3NF)."""
    __tablename__ = "chapter_synthesis_job_targets"

    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("synthesis_jobs.id", ondelete="CASCADE"),
        primary_key=True,
    )
    chapter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chapters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    job: Mapped["SynthesisJob"] = relationship("SynthesisJob", back_populates="chapter_target")
    chapter: Mapped["Chapter"] = relationship("Chapter", back_populates="synthesis_job_targets")


# ==============================================================================
# 8. Segment Audio Cache Table (LRU Lookup for Synthesized PCM Chunks)
# ==============================================================================
class SegmentAudioCache(Base):
    """Metadata index for cached raw PCM audio buffers on local worker volume."""
    __tablename__ = "segment_audio_cache"

    text_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    voice_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    local_pcm_path: Mapped[str] = mapped_column(String(512), nullable=False)
    n_samples: Mapped[int] = mapped_column(Integer, nullable=False)
    sample_rate: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=24000,
        server_default="24000",
    )
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        Index("idx_segment_audio_cache_lru", "last_used_at"),
    )


# ==============================================================================
# 9. Playback History Table (User Resume Progress Bookmark - 4NF)
# ==============================================================================
class PlaybackHistory(Base):
    """Persistent playback state bookmark tracked per user per novel (Strict 4NF)."""
    __tablename__ = "playback_history"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    novel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("novels.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    @property
    def updated_at(self) -> Optional[datetime]:
        return self.position.updated_at if self.position else None

    __table_args__ = (
        # Unique constraint on (user_id, novel_id) guarantees clean atomic upserts
        UniqueConstraint("user_id", "novel_id", name="uq_playback_history_user_novel"),
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="playback_history")
    novel: Mapped["Novel"] = relationship("Novel", back_populates="playback_history")
    position: Mapped[Optional["PlaybackPosition"]] = relationship(
        "PlaybackPosition", back_populates="history", uselist=False, cascade="all, delete-orphan"
    )

    @property
    def chapter_id(self) -> Optional[uuid.UUID]:
        return self.position.chapter_id if self.position else None

    @property
    def segment_order(self) -> int:
        return self.position.segment_order if self.position else 0

    @property
    def position_ms(self) -> int:
        return self.position.position_ms if self.position else 0


class PlaybackPosition(Base):
    """Fine-grained playback position offset scoped to a bookmark (Strict 4NF)."""
    __tablename__ = "playback_positions"

    history_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("playback_history.id", ondelete="CASCADE"),
        primary_key=True,
    )
    chapter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chapters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    segment_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    position_ms: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    history: Mapped["PlaybackHistory"] = relationship("PlaybackHistory", back_populates="position")
    chapter: Mapped["Chapter"] = relationship("Chapter", back_populates="playback_positions")
