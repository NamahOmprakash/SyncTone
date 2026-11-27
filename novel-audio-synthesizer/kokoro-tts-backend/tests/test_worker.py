"""Comprehensive tests for HeadlessWorker (claiming, retries, stale recovery, idempotency, real synthesis)."""

import os
import sys
import uuid
import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.models import (
    Chapter,
    ChapterSynthesisJobTarget,
    Novel,
    NovelProfileJobTarget,
    SynthesisJob,
    User,
)
from app.worker import HeadlessWorker


def _pg_db_url() -> str:
    raw = os.getenv(
        "DATABASE_URL",
        "postgresql://synctone_user:synctone_pass@localhost:5432/synctone",
    )
    if raw.startswith("postgres://"):
        raw = raw.replace("postgres://", "postgresql://", 1)
    return raw


@pytest.fixture
def pg_session():
    engine = create_engine(_pg_db_url(), pool_pre_ping=True)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = Session()
    try:
        yield db
    finally:
        db.rollback()
        db.close()
        engine.dispose()


def _create_chapter_fixture(db, *, status: str = "draft", max_attempts: int = 3):
    suffix = uuid.uuid4().hex[:8]
    user = User(
        id=uuid.uuid4(),
        username=f"pyworker_u_{suffix}",
        email=f"pyworker_{suffix}@example.com",
        password_hash="hashed_pw",
        role="writer",
    )
    novel = Novel(
        id=uuid.uuid4(),
        added_by=user.id,
        title=f"Worker Test Novel {suffix}",
        synopsis="Test synopsis",
        channel="community",
        status="draft",
    )
    chapter = Chapter(
        id=uuid.uuid4(),
        novel_id=novel.id,
        chapter_number=1,
        title="Chapter 1: Worker Test",
        status=status,
    )
    job = SynthesisJob(
        id=uuid.uuid4(),
        requested_by=user.id,
        job_type="synthesize_chapter",
        status="queued",
        progress_pct=0.0,
        attempts=0,
        max_attempts=max_attempts,
    )
    target = ChapterSynthesisJobTarget(job_id=job.id, chapter_id=chapter.id)
    db.add_all([user, novel, chapter, job, target])
    db.commit()
    return user, novel, chapter, job


def _cleanup_fixture(db, user_id: uuid.UUID, mongo_chapter_id: str | None = None, output_dir: Path | None = None):
    try:
        db.rollback()
        u = db.get(User, user_id)
        if u is not None:
            db.delete(u)
            db.commit()
    except Exception:
        db.rollback()
    if mongo_chapter_id and output_dir:
        for ext in ("mp3", "wav", "opus"):
            p = output_dir / f"{mongo_chapter_id}.{ext}"
            if p.exists():
                p.unlink(missing_ok=True)


class TestHeadlessWorkerLifecycle:
    def test_recover_stale_processing_jobs_requeues_or_fails(self, pg_session):
        user, novel, chapter, job = _create_chapter_fixture(pg_session, max_attempts=3)
        try:
            # Put job in stale processing state (10 minutes ago)
            job.status = "processing"
            job.worker_id = "crashed-worker"
            job.attempts = 1
            job.locked_at = datetime.now(timezone.utc) - timedelta(seconds=600)
            pg_session.commit()

            worker = HeadlessWorker(worker_id="recovery-worker", stale_lock_timeout_sec=60)
            reclaimed = worker.recover_stale_jobs(pg_session)
            assert reclaimed >= 1

            pg_session.refresh(job)
            assert job.status == "queued"
            assert job.worker_id is None
            assert job.locked_at is None
            assert "timeout" in (job.error_message or "").lower()

            # Now test stale job that already exhausted max_attempts -> permanently failed
            job.status = "processing"
            job.worker_id = "crashed-worker"
            job.attempts = 3
            job.locked_at = datetime.now(timezone.utc) - timedelta(seconds=600)
            pg_session.commit()

            worker.recover_stale_jobs(pg_session)
            pg_session.refresh(job)
            pg_session.refresh(chapter)
            assert job.status == "failed"
            assert job.locked_at is None
            assert chapter.status == "failed"
        finally:
            _cleanup_fixture(pg_session, user.id)

    def test_transient_failure_requeues_with_backoff_then_fails_at_max_attempts(self, pg_session, tmp_path):
        user, novel, chapter, job = _create_chapter_fixture(pg_session, max_attempts=2)
        try:
            worker = HeadlessWorker(worker_id="retry-worker", output_dir=tmp_path)

            # Force synthesis error (never fake audio!)
            async def boom(*_args, **_kwargs):
                raise RuntimeError("Simulated transient TTS failure")

            worker.get_chapter_segments = AsyncMock(
                return_value=[{"segment_id": 0, "text": "Hello world.", "voice_id": "af_heart", "speaker_name": "Narrator"}]
            )
            worker.synthesize_segment_audio = boom

            # Attempt 1 (< max_attempts=2): should requeue with run_after in the future
            job.status = "processing"
            job.attempts = 1
            job.worker_id = worker.worker_id
            job.locked_at = datetime.now(timezone.utc)
            pg_session.commit()

            asyncio.run(worker.process_job(job, pg_session))
            pg_session.refresh(job)
            pg_session.refresh(chapter)
            assert job.status == "queued"
            assert job.worker_id is None
            assert job.locked_at is None
            assert job.run_after > datetime.now(timezone.utc) - timedelta(seconds=1)
            assert "Simulated transient TTS failure" in (job.error_message or "")
            assert chapter.status != "completed"

            # Attempt 2 (== max_attempts=2): should transition permanently to failed
            job.status = "processing"
            job.attempts = 2
            job.worker_id = worker.worker_id
            job.locked_at = datetime.now(timezone.utc)
            pg_session.commit()

            asyncio.run(worker.process_job(job, pg_session))
            pg_session.refresh(job)
            pg_session.refresh(chapter)
            assert job.status == "failed"
            assert job.locked_at is None
            assert chapter.status == "failed"
        finally:
            _cleanup_fixture(pg_session, user.id, str(chapter.id), tmp_path)

    def test_successful_synthesis_persists_audio_and_completes_job(self, pg_session, tmp_path):
        user, novel, chapter, job = _create_chapter_fixture(pg_session)
        try:
            worker = HeadlessWorker(worker_id="synth-worker", output_dir=tmp_path, chapters_dir=tmp_path / "chapters")
            worker.get_chapter_segments = AsyncMock(
                return_value=[
                    {
                        "segment_id": 0,
                        "text": "The detective looked at the fog.",
                        "voice_id": "bm_george",
                        "speaker_name": "Narrator",
                    },
                    {
                        "segment_id": 1,
                        "text": "Elementary!",
                        "voice_id": "en-GB-ThomasNeural",
                        "speaker_name": "Holmes",
                    },
                ]
            )

            async def fake_real_pcm(text: str, voice_id: str, speed: float = 1.0):
                # Produce distinct non-silent tone PCM for test verification of pipeline stitching
                sr = 24000
                t = np.linspace(0, 0.25, int(sr * 0.25), dtype=np.float32)
                pcm = 0.2 * np.sin(2 * np.pi * 440.0 * t).astype(np.float32)
                return pcm, 250

            worker.synthesize_segment_audio = fake_real_pcm

            job.status = "processing"
            job.attempts = 1
            job.worker_id = worker.worker_id
            job.locked_at = datetime.now(timezone.utc)
            pg_session.commit()

            asyncio.run(worker.process_job(job, pg_session))
            pg_session.refresh(job)
            pg_session.refresh(chapter)

            assert job.status == "completed"
            assert job.progress_pct == 100.0
            assert job.completed_at is not None
            assert job.locked_at is None
            assert job.worker_id is None

            assert chapter.status == "completed"
            assert chapter.total_duration_ms > 0
            assert chapter.swift_audio_object is not None

            # Verify actual audio file exists on disk and is non-empty
            audio_files = list(tmp_path.glob(f"{chapter.id}.*"))
            assert any(p.stat().st_size > 100 for p in audio_files), f"Expected non-empty audio file, found {audio_files}"
        finally:
            _cleanup_fixture(pg_session, user.id, str(chapter.id), tmp_path)

    def test_idempotent_skip_when_audio_already_persisted(self, pg_session, tmp_path):
        user, novel, chapter, job = _create_chapter_fixture(pg_session, status="completed")
        try:
            existing_audio = tmp_path / f"{chapter.id}.mp3"
            existing_audio.write_bytes(b"ID3" + b"\xff" * 2048)
            chapter.swift_audio_object = f"{chapter.id}.mp3"
            chapter.total_duration_ms = 1234
            pg_session.commit()

            worker = HeadlessWorker(worker_id="idem-worker", output_dir=tmp_path)
            synth_mock = AsyncMock(side_effect=AssertionError("Should not re-synthesize already completed chapter!"))
            worker.synthesize_segment_audio = synth_mock

            job.status = "processing"
            job.attempts = 1
            job.worker_id = worker.worker_id
            job.locked_at = datetime.now(timezone.utc)
            pg_session.commit()

            asyncio.run(worker.process_job(job, pg_session))
            pg_session.refresh(job)
            assert job.status == "completed"
            assert job.progress_pct == 100.0
            synth_mock.assert_not_called()
        finally:
            _cleanup_fixture(pg_session, user.id, str(chapter.id), tmp_path)

    def test_concurrent_duplicate_job_does_not_double_synthesize(self, pg_session, tmp_path):
        user, novel, chapter, job1 = _create_chapter_fixture(pg_session)
        try:
            # Second job for the exact same chapter
            job2 = SynthesisJob(
                id=uuid.uuid4(),
                requested_by=user.id,
                job_type="synthesize_chapter",
                status="processing",
                attempts=1,
                worker_id="other-active-worker",
                locked_at=datetime.now(timezone.utc),
            )
            target2 = ChapterSynthesisJobTarget(job_id=job2.id, chapter_id=chapter.id)
            pg_session.add_all([job2, target2])

            job1.status = "processing"
            job1.attempts = 1
            job1.worker_id = "worker-a"
            job1.locked_at = datetime.now(timezone.utc)
            pg_session.commit()

            worker = HeadlessWorker(worker_id="worker-a", output_dir=tmp_path)
            synth_mock = AsyncMock(side_effect=AssertionError("Should defer when another active job owns the chapter!"))
            worker.synthesize_segment_audio = synth_mock

            asyncio.run(worker.process_job(job1, pg_session))
            pg_session.refresh(job1)
            assert job1.status == "queued"
            assert job1.attempts == 0
            assert job1.locked_at is None
            synth_mock.assert_not_called()
        finally:
            _cleanup_fixture(pg_session, user.id, str(chapter.id), tmp_path)

    def test_handles_profile_novel_job(self, pg_session, tmp_path):
        user, novel, chapter, _ = _create_chapter_fixture(pg_session)
        try:
            pjob = SynthesisJob(
                id=uuid.uuid4(),
                requested_by=user.id,
                job_type="profile_novel",
                status="processing",
                attempts=1,
                worker_id="profile-worker",
                locked_at=datetime.now(timezone.utc),
            )
            ptarget = NovelProfileJobTarget(job_id=pjob.id, novel_id=novel.id)
            pg_session.add_all([pjob, ptarget])
            pg_session.commit()

            worker = HeadlessWorker(worker_id="profile-worker", output_dir=tmp_path)
            asyncio.run(worker.process_job(pjob, pg_session))

            pg_session.refresh(pjob)
            pg_session.refresh(novel)
            assert pjob.status == "completed"
            assert pjob.progress_pct == 100.0
            assert pjob.locked_at is None
            assert novel.status == "published"
        finally:
            _cleanup_fixture(pg_session, user.id, str(chapter.id), tmp_path)

    def test_end_to_end_mongo_segments_and_real_tts_synthesis(self, pg_session, tmp_path):
        """Real Postgres + real MongoDB + real edge-tts neural synthesis (no audio mocking)."""
        from pymongo import MongoClient

        mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/synctone")
        mclient = MongoClient(mongo_uri, serverSelectionTimeoutMS=3000)
        mdb = mclient.get_default_database() if mclient.get_default_database() is not None else mclient["synctone"]

        user, novel, chapter, job = _create_chapter_fixture(pg_session)
        ch_str = str(chapter.id)
        try:
            mdb["chapters"].insert_one(
                {
                    "pg_chapter_id": ch_str,
                    "novel_id": str(novel.id),
                    "chapter_number": 1,
                    "title": chapter.title,
                    "raw_text": 'Holmes looked up. "This is a real synthesis test," said Holmes.',
                    "segments": [
                        {
                            "segment_id": 0,
                            "order": 0,
                            "type": "narration",
                            "speaker_name": "Narrator",
                            "character_id": "narrator",
                            "voice_id": "en-GB-RyanNeural",
                            "text": "Holmes looked up.",
                        },
                        {
                            "segment_id": 1,
                            "order": 1,
                            "type": "dialogue",
                            "speaker_name": "Holmes",
                            "character_id": "holmes",
                            "voice_id": "en-GB-ThomasNeural",
                            "text": "This is a real synthesis test.",
                        },
                    ],
                    "manifest": {"total_duration_ms": 0, "audio_url": f"/api/stream/{ch_str}", "timeline": []},
                }
            )

            worker = HeadlessWorker(worker_id="e2e-real-worker", output_dir=tmp_path, chapters_dir=tmp_path / "chapters")
            claimed = worker.claim_next_job(pg_session)
            assert claimed is not None
            # Claim might grab older unrelated queued jobs if DB has leftovers; find our exact job if needed
            while claimed is not None and claimed.id != job.id:
                claimed.status = "queued"
                claimed.locked_at = None
                claimed.worker_id = None
                claimed.attempts = max(0, claimed.attempts - 1)
                pg_session.commit()
                break
            if claimed is None or claimed.id != job.id:
                job.status = "processing"
                job.attempts = 1
                job.worker_id = worker.worker_id
                job.locked_at = datetime.now(timezone.utc)
                pg_session.commit()
                claimed = job

            asyncio.run(worker.process_job(claimed, pg_session))

            pg_session.refresh(claimed)
            pg_session.refresh(chapter)
            assert claimed.status == "completed"
            assert chapter.status == "completed"
            assert chapter.total_duration_ms > 500

            mp3_file = tmp_path / f"{ch_str}.mp3"
            assert mp3_file.exists() and mp3_file.stat().st_size > 3000

            mongo_doc = mdb["chapters"].find_one({"pg_chapter_id": ch_str})
            assert mongo_doc is not None
            assert mongo_doc["manifest"]["total_duration_ms"] == chapter.total_duration_ms
            assert len(mongo_doc["manifest"]["timeline"]) == 2
        finally:
            mdb["chapters"].delete_many({"pg_chapter_id": ch_str})
            mclient.close()
            _cleanup_fixture(pg_session, user.id, ch_str, tmp_path)
