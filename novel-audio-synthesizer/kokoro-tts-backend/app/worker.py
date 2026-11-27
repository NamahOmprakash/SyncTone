"""Headless Python Background Worker Daemon for SyncTone Synthesis & Profiling.

Claims queued jobs from PostgreSQL using FOR UPDATE SKIP LOCKED, recovers stale
processing locks, loads chapter segments from MongoDB (with parsed/disk fallback),
synthesizes real multi-voice audio via Kokoro ONNX or Edge Neural TTS, persists
stitched audio + timeline manifests, and retries transient failures with backoff.
"""

import asyncio
import json
import os
import signal
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import numpy as np

# Ensure backend root is always on sys.path for direct script execution
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logger import get_logger
from app.db.models import (
    Chapter,
    ChapterSynthesisJobTarget,
    Character,
    Novel,
    NovelProfileJobTarget,
    SynthesisJob,
)
from app.db.session import SessionLocal
from app.models.schemas import AudioFormat

logger = get_logger("synctone.worker")

try:
    from app.engine.audio_stitcher import AudioStitcher
    from app.engine.tts_engine import TTSEngine, synthesize_with_edge_tts
except ImportError as e:
    TTSEngine = None
    AudioStitcher = None
    synthesize_with_edge_tts = None
    logger.warning(f"Audio/TTS engine dependencies not fully installed ({e}).")

RUNNING = True


def handle_shutdown(signum, frame):
    """Graceful shutdown handler."""
    global RUNNING
    logger.info(f"Received signal {signum}. Shutting down worker gracefully...")
    RUNNING = False


if threading_main := (__name__ == "__main__"):
    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)


def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class HeadlessWorker:
    """Worker daemon that claims, recovers, retries, and executes synthesis & profiling jobs."""

    def __init__(
        self,
        worker_id: str = "worker-1",
        output_dir: Optional[Path | str] = None,
        chapters_dir: Optional[Path | str] = None,
        stale_lock_timeout_sec: Optional[int] = None,
        retry_backoff_base_sec: float = 2.0,
    ):
        self.worker_id = worker_id
        self.tts = TTSEngine() if TTSEngine is not None else None
        self.stitcher = AudioStitcher() if AudioStitcher is not None else None
        self.output_dir = (
            Path(output_dir)
            if output_dir is not None
            else Path(settings.resolve_path(settings.output_dir))
        )
        self.chapters_dir = (
            Path(chapters_dir)
            if chapters_dir is not None
            else Path(settings.resolve_path(settings.chapters_dir))
        )
        self.stale_lock_timeout_sec = (
            stale_lock_timeout_sec
            if stale_lock_timeout_sec is not None
            else int(os.getenv("WORKER_LOCK_TIMEOUT_SEC", str(settings.worker_lock_timeout_sec)))
        )
        self.retry_backoff_base_sec = float(retry_backoff_base_sec)

    def recover_stale_jobs(self, db: Session) -> int:
        """Reclaim jobs stuck in 'processing' beyond stale_lock_timeout_sec."""
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(seconds=self.stale_lock_timeout_sec)
        stale_stmt = (
            select(SynthesisJob)
            .where(
                SynthesisJob.status == "processing",
                SynthesisJob.locked_at.isnot(None),
                SynthesisJob.locked_at < cutoff,
            )
            .with_for_update(skip_locked=True)
        )
        stale_jobs = db.execute(stale_stmt).scalars().all()
        reclaimed = 0
        for job in stale_jobs:
            if job.attempts < job.max_attempts:
                job.status = "queued"
                job.worker_id = None
                job.locked_at = None
                job.run_after = now
                job.error_message = (
                    f"Reclaimed after worker lock timeout ({self.stale_lock_timeout_sec}s)"
                )
            else:
                job.status = "failed"
                job.worker_id = None
                job.locked_at = None
                job.error_message = (
                    f"Failed: exceeded max_attempts ({job.max_attempts}) after worker lock timeout"
                )
                if job.chapter_id:
                    ch = db.get(Chapter, job.chapter_id)
                    if ch is not None and ch.status != "completed":
                        ch.status = "failed"
            reclaimed += 1
        if reclaimed > 0:
            db.commit()
            logger.warning(f"[{self.worker_id}] Reclaimed {reclaimed} stale processing job(s)")
        return reclaimed

    def claim_next_job(self, db: Session) -> Optional[SynthesisJob]:
        """Recover stale locks and atomically claim the next queued job with SKIP LOCKED."""
        try:
            self.recover_stale_jobs(db)
        except Exception as rec_err:
            logger.warning(f"[{self.worker_id}] Stale job recovery warning: {rec_err}")
            db.rollback()

        now = datetime.now(timezone.utc)
        stmt = (
            select(SynthesisJob)
            .where(
                SynthesisJob.status == "queued",
                SynthesisJob.job_type.in_(["synthesize_chapter", "profile_novel"]),
                SynthesisJob.run_after <= now,
                SynthesisJob.attempts < SynthesisJob.max_attempts,
            )
            .order_by(SynthesisJob.created_at.asc())
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        job = db.execute(stmt).scalars().first()
        if job:
            job.status = "processing"
            job.worker_id = self.worker_id
            job.locked_at = now
            job.attempts += 1
            db.commit()
            db.refresh(job)
            logger.info(
                f"[{self.worker_id}] Claimed job {job.id} (type: {job.job_type}, attempt: {job.attempts}/{job.max_attempts})"
            )
        return job

    def _find_persisted_audio(self, chapter_id: str) -> Optional[Path]:
        for ext in ("mp3", "opus", "wav"):
            candidate = self.output_dir / f"{chapter_id}.{ext}"
            if candidate.exists() and candidate.stat().st_size > 128:
                return candidate
        return None

    def _load_segments_sync(self, chapter_id: str) -> list[dict]:
        """Load chapter segments from MongoDB or disk fallback, enriched with PG voice roster."""
        segments: list[dict] = []
        raw_text: str = ""
        title: str = "Chapter"
        novel_id: Optional[str] = None

        mongo_uri = os.getenv("MONGO_URI", settings.mongo_uri)
        try:
            from pymongo import MongoClient

            mclient = MongoClient(mongo_uri, serverSelectionTimeoutMS=2500)
            try:
                mdb = mclient.get_default_database()
                if mdb is None:
                    mdb = mclient["synctone"]
            except Exception:
                mdb = mclient["synctone"]

            doc = mdb["chapters"].find_one({"pg_chapter_id": str(chapter_id)})
            if doc:
                segments = list(doc.get("segments") or [])
                raw_text = str(doc.get("raw_text") or "")
                title = str(doc.get("title") or title)
                novel_id = str(doc.get("novel_id") or "") or None
            mclient.close()
        except Exception as mongo_err:
            logger.warning(f"[{self.worker_id}] MongoDB segment lookup skipped/failed for {chapter_id}: {mongo_err}")

        if not segments:
            parsed_path = self.chapters_dir / str(chapter_id) / "parsed.json"
            if parsed_path.exists():
                try:
                    parsed_data = json.loads(parsed_path.read_text(encoding="utf-8"))
                    segments = list(parsed_data.get("segments") or [])
                except Exception:
                    pass

        if not segments:
            raw_path = self.chapters_dir / str(chapter_id) / "raw.txt"
            if not raw_text and raw_path.exists():
                raw_text = raw_path.read_text(encoding="utf-8")
            if raw_text.strip():
                from app.engine.text_parser import parse_chapter

                parsed_chapter = parse_chapter(raw_text, title=title, chapter_id=str(chapter_id))
                segments = [s.model_dump() for s in parsed_chapter.segments]

        # Overlay latest PostgreSQL character voice assignments so user overrides always take effect
        try:
            with SessionLocal() as voice_db:
                ch_uuid = chapter_id if hasattr(chapter_id, "hex") else chapter_id
                ch_row = voice_db.get(Chapter, ch_uuid)
                if ch_row is not None:
                    novel_id = str(ch_row.novel_id)
                if novel_id:
                    chars = voice_db.execute(
                        select(Character).where(Character.novel_id == novel_id)
                    ).scalars().all()
                    narrator_voice = next(
                        (c.voice_id for c in chars if c.is_narrator and c.voice_id),
                        None,
                    )
                    by_id = {str(c.id).lower(): c.voice_id for c in chars if c.voice_id}
                    by_name = {
                        c.canonical_name.strip().lower(): c.voice_id
                        for c in chars
                        if c.canonical_name and c.voice_id
                    }
                    for seg in segments:
                        if not isinstance(seg, dict):
                            continue
                        cid = str(seg.get("character_id") or seg.get("speaker_id") or "").strip().lower()
                        sname = str(seg.get("speaker_name") or "").strip().lower()
                        override = by_id.get(cid) or by_name.get(sname)
                        if not override and (seg.get("type") == "narration" or cid == "narrator") and narrator_voice:
                            override = narrator_voice
                        if override:
                            seg["assigned_voice_id"] = override
                            seg["voice_id"] = override
        except Exception as pg_err:
            logger.debug(f"[{self.worker_id}] PG voice overlay skipped: {pg_err}")

        return segments

    async def get_chapter_segments(self, chapter_id: str) -> list[dict]:
        """Default segment loader backed by MongoDB and disk checkpoints."""
        return await asyncio.to_thread(self._load_segments_sync, str(chapter_id))

    async def synthesize_segment_audio(
        self,
        text: str,
        voice_id: str,
        speed: float = 1.0,
    ) -> tuple[np.ndarray, int]:
        """Synthesize real neural speech for one segment (Kokoro ONNX first, then Edge TTS).

        Never returns mocked silent audio in production.
        """
        if self.tts is not None:
            model_status = await self.tts.check_model_available()
            if model_status.get("model_exists") and model_status.get("voices_exists"):
                samples, duration_ms = await self.tts.synthesize_segment(
                    text=text,
                    voice_id=voice_id,
                    speed=speed,
                )
                if samples is not None and len(samples) > 0:
                    return samples, duration_ms

        if synthesize_with_edge_tts is not None:
            return await synthesize_with_edge_tts(
                text=text,
                voice_id=voice_id,
                speed=speed,
                sample_rate=self.stitcher.sample_rate if self.stitcher else settings.sample_rate,
            )

        raise RuntimeError(
            "No real TTS synthesis engine available (Kokoro ONNX weights missing and Edge TTS unavailable)"
        )

    def _persist_mongo_and_disk_manifest(
        self,
        chapter_id: str,
        manifest,
        engine_label: str,
        segments: list[dict],
    ) -> None:
        manifest_payload = {
            "chapter_id": str(chapter_id),
            "audio_url": f"/api/stream/{chapter_id}",
            "audio_stream_url": f"/api/stream/{chapter_id}",
            "audio_format": manifest.audio_format.value,
            "engine": engine_label,
            "studio_engine": engine_label,
            "total_duration_ms": int(manifest.total_duration_ms),
            "timeline": [t.model_dump() for t in manifest.timeline],
        }

        chapter_dir = self.chapters_dir / str(chapter_id)
        chapter_dir.mkdir(parents=True, exist_ok=True)
        (chapter_dir / "manifest.json").write_text(
            json.dumps(manifest_payload, indent=2),
            encoding="utf-8",
        )

        mongo_uri = os.getenv("MONGO_URI", settings.mongo_uri)
        try:
            from pymongo import MongoClient

            mclient = MongoClient(mongo_uri, serverSelectionTimeoutMS=2500)
            try:
                mdb = mclient.get_default_database()
                if mdb is None:
                    mdb = mclient["synctone"]
            except Exception:
                mdb = mclient["synctone"]

            mdb["chapters"].update_one(
                {"pg_chapter_id": str(chapter_id)},
                {
                    "$set": {
                        "manifest": manifest_payload,
                        "total_duration_ms": int(manifest.total_duration_ms),
                        "status": "completed",
                        "segments": segments,
                    }
                },
            )
            mclient.close()
        except Exception as mongo_err:
            logger.warning(f"[{self.worker_id}] MongoDB manifest update warning for {chapter_id}: {mongo_err}")

    def _handle_failure(
        self,
        db: Session,
        job: SynthesisJob,
        target_chapter_id,
        err: Exception,
    ) -> None:
        """Apply retry with exponential backoff or mark permanently failed at max_attempts."""
        db.rollback()
        refreshed_job = db.get(SynthesisJob, job.id)
        if refreshed_job is None:
            return

        now = datetime.now(timezone.utc)
        err_msg = str(err)[:2000]
        if refreshed_job.attempts < refreshed_job.max_attempts:
            delay_sec = min(60.0, self.retry_backoff_base_sec ** max(1, refreshed_job.attempts))
            refreshed_job.status = "queued"
            refreshed_job.worker_id = None
            refreshed_job.locked_at = None
            refreshed_job.run_after = now + timedelta(seconds=delay_sec)
            refreshed_job.error_message = err_msg
            if target_chapter_id is not None:
                ch = db.get(Chapter, target_chapter_id)
                if ch is not None and ch.status == "synthesizing":
                    ch.status = "draft"
            logger.warning(
                f"[{self.worker_id}] Job {refreshed_job.id} failed attempt {refreshed_job.attempts}/{refreshed_job.max_attempts}; retrying in {delay_sec:.1f}s: {err_msg}"
            )
        else:
            refreshed_job.status = "failed"
            refreshed_job.worker_id = None
            refreshed_job.locked_at = None
            refreshed_job.error_message = err_msg
            if target_chapter_id is not None:
                ch = db.get(Chapter, target_chapter_id)
                if ch is not None and ch.status != "completed":
                    ch.status = "failed"
            logger.error(
                f"[{self.worker_id}] Job {refreshed_job.id} permanently failed after {refreshed_job.attempts} attempts: {err_msg}"
            )
        db.commit()

    async def process_job(self, job: SynthesisJob, db: Session) -> None:
        """Execute a claimed job (profile_novel or synthesize_chapter) with safety guarantees."""
        target_chapter_id = None
        try:
            if job.job_type == "profile_novel":
                novel_id = job.novel_id
                if not novel_id:
                    target = await asyncio.to_thread(
                        db.scalar,
                        select(NovelProfileJobTarget).where(NovelProfileJobTarget.job_id == job.id),
                    )
                    novel_id = target.novel_id if target else None
                if not novel_id:
                    raise ValueError(f"Profiling job {job.id} has no target novel_id")

                def _complete_profile():
                    novel = db.get(Novel, novel_id)
                    if novel is None:
                        raise ValueError(f"Target novel {novel_id} no longer exists")
                    if novel.status in ("draft", "profiling"):
                        novel.status = "published"
                    job_row = db.get(SynthesisJob, job.id)
                    if job_row is not None:
                        job_row.progress_pct = 100.0
                        job_row.status = "completed"
                        job_row.worker_id = None
                        job_row.locked_at = None
                        job_row.completed_at = datetime.now(timezone.utc)
                        job_row.error_message = None
                    db.commit()

                await asyncio.to_thread(_complete_profile)
                logger.info(f"[{self.worker_id}] Completed profile_novel job {job.id} for novel {novel_id}")
                return

            target_chapter_id = job.chapter_id
            if not target_chapter_id:
                target = await asyncio.to_thread(
                    db.scalar,
                    select(ChapterSynthesisJobTarget).where(ChapterSynthesisJobTarget.job_id == job.id),
                )
                target_chapter_id = target.chapter_id if target else None

            if not target_chapter_id:
                raise ValueError(f"Synthesis job {job.id} has no target chapter_id")

            # Concurrency protection: check if another active worker already holds a fresh lock on this chapter
            def _check_duplicate_and_idempotency():
                now = datetime.now(timezone.utc)
                stale_cutoff = now - timedelta(seconds=self.stale_lock_timeout_sec)
                other_active = db.execute(
                    select(SynthesisJob)
                    .join(ChapterSynthesisJobTarget, ChapterSynthesisJobTarget.job_id == SynthesisJob.id)
                    .where(
                        ChapterSynthesisJobTarget.chapter_id == target_chapter_id,
                        SynthesisJob.id != job.id,
                        SynthesisJob.status == "processing",
                        SynthesisJob.locked_at.isnot(None),
                        SynthesisJob.locked_at >= stale_cutoff,
                    )
                    .limit(1)
                ).scalars().first()
                if other_active is not None:
                    jrow = db.get(SynthesisJob, job.id)
                    if jrow is not None:
                        jrow.status = "queued"
                        jrow.attempts = max(0, jrow.attempts - 1)
                        jrow.worker_id = None
                        jrow.locked_at = None
                        jrow.run_after = now + timedelta(seconds=5)
                        db.commit()
                    return "yield"

                chapter = db.get(Chapter, target_chapter_id)
                if chapter is None:
                    raise ValueError(f"Target chapter {target_chapter_id} not found")

                persisted = self._find_persisted_audio(str(target_chapter_id))
                if chapter.status == "completed" and persisted is not None:
                    jrow = db.get(SynthesisJob, job.id)
                    if jrow is not None:
                        jrow.progress_pct = 100.0
                        jrow.status = "completed"
                        jrow.worker_id = None
                        jrow.locked_at = None
                        jrow.completed_at = now
                        jrow.error_message = None
                        db.commit()
                    return "already_completed"

                chapter.status = "synthesizing"
                jrow = db.get(SynthesisJob, job.id)
                if jrow is not None:
                    jrow.progress_pct = 15.0
                db.commit()
                return "proceed"

            gate_result = await asyncio.to_thread(_check_duplicate_and_idempotency)
            if gate_result == "yield":
                logger.info(
                    f"[{self.worker_id}] Yielded duplicate job {job.id}; another active job owns chapter {target_chapter_id}"
                )
                return
            if gate_result == "already_completed":
                logger.info(
                    f"[{self.worker_id}] Idempotent skip for job {job.id}; audio already persisted for chapter {target_chapter_id}"
                )
                return

            if self.stitcher is None:
                raise RuntimeError("AudioStitcher is unavailable in Python worker")

            segments = await self.get_chapter_segments(str(target_chapter_id))
            speakable = [
                s
                for s in (segments or [])
                if (s.get("type") if isinstance(s, dict) else getattr(s, "type", "")) != "image"
                and str(s.get("text", "") if isinstance(s, dict) else getattr(s, "text", "")).strip()
            ]
            if not speakable:
                raise ValueError(f"No synthesizable text segments found for chapter {target_chapter_id}")

            stitched_inputs = []
            total = len(speakable)
            used_kokoro = False
            for idx, seg in enumerate(speakable):
                seg_id = seg.get("segment_id", idx) if isinstance(seg, dict) else getattr(seg, "segment_id", idx)
                seg_text = seg.get("text", "") if isinstance(seg, dict) else getattr(seg, "text", "")
                voice_id = (
                    (seg.get("assigned_voice_id") or seg.get("voice_id"))
                    if isinstance(seg, dict)
                    else (getattr(seg, "assigned_voice_id", None) or getattr(seg, "voice_id", None))
                ) or "af_heart"
                speaker_name = (
                    (seg.get("speaker_name") or "Narrator")
                    if isinstance(seg, dict)
                    else (getattr(seg, "speaker_name", None) or "Narrator")
                )

                samples, _duration_ms = await self.synthesize_segment_audio(
                    text=seg_text,
                    voice_id=voice_id,
                )
                if samples is None or len(samples) == 0:
                    raise RuntimeError(f"TTS returned empty audio for segment {seg_id}")
                if self.tts is not None:
                    ms = await self.tts.check_model_available()
                    if ms.get("model_exists") and ms.get("voices_exists"):
                        used_kokoro = True

                stitched_inputs.append(
                    {
                        "segment_id": seg_id,
                        "voice_id": voice_id,
                        "speaker_name": speaker_name,
                        "pcm_samples": samples,
                    }
                )
                if isinstance(seg, dict):
                    seg["assigned_voice_id"] = voice_id
                    seg["voice_id"] = voice_id

                def _update_pct(pct: float):
                    jrow = db.get(SynthesisJob, job.id)
                    if jrow is not None:
                        jrow.progress_pct = pct
                        db.commit()

                await asyncio.to_thread(_update_pct, 15.0 + (70.0 * (idx + 1) / total))

            self.output_dir.mkdir(parents=True, exist_ok=True)
            target_format = AudioFormat.MP3 if self.stitcher._has_ffmpeg else AudioFormat.WAV
            manifest = await asyncio.to_thread(
                self.stitcher.stitch,
                stitched_inputs,
                self.output_dir,
                str(target_chapter_id),
                target_format,
            )

            expected_filename = Path(manifest.audio_stream_url).name
            persisted_path = self.output_dir / expected_filename
            if not persisted_path.exists() or persisted_path.stat().st_size <= 128:
                raise IOError(f"Persisted audio verification failed at {persisted_path}")

            engine_label = "kokoro-tts" if used_kokoro else "msedge-tts"
            await asyncio.to_thread(
                self._persist_mongo_and_disk_manifest,
                str(target_chapter_id),
                manifest,
                engine_label,
                segments,
            )

            def _complete_job_and_chapter():
                chapter = db.get(Chapter, target_chapter_id)
                if chapter is not None:
                    chapter.status = "completed"
                    chapter.swift_audio_object = expected_filename
                    chapter.total_duration_ms = int(manifest.total_duration_ms)
                jrow = db.get(SynthesisJob, job.id)
                if jrow is not None:
                    jrow.progress_pct = 100.0
                    jrow.status = "completed"
                    jrow.completed_at = datetime.now(timezone.utc)
                    jrow.worker_id = None
                    jrow.locked_at = None
                    jrow.error_message = None
                db.commit()

            await asyncio.to_thread(_complete_job_and_chapter)
            logger.info(
                f"[{self.worker_id}] Completed job {job.id} -> {expected_filename} ({manifest.total_duration_ms}ms)"
            )
        except Exception as err:
            try:
                await asyncio.to_thread(self._handle_failure, db, job, target_chapter_id, err)
            except Exception as handle_err:
                logger.error(f"[{self.worker_id}] Failure handler error for job {job.id}: {handle_err}")
                try:
                    await asyncio.to_thread(db.rollback)
                except Exception:
                    pass

    async def run(self, poll_interval_sec: float = 3.0):
        """Main daemon loop."""
        logger.info(f"[{self.worker_id}] Headless Worker started. Polling interval: {poll_interval_sec}s")
        while RUNNING:
            with SessionLocal() as db:
                try:
                    job = self.claim_next_job(db)
                    if job:
                        await self.process_job(job, db)
                    else:
                        await asyncio.sleep(poll_interval_sec)
                except Exception as e:
                    logger.error(f"[{self.worker_id}] Error in worker loop: {e}")
                    await asyncio.sleep(poll_interval_sec)

        logger.info(f"[{self.worker_id}] Headless Worker stopped cleanly.")


def main():
    worker_id = os.getenv("WORKER_ID", f"worker-{os.getpid()}")
    interval = float(os.getenv("WORKER_POLL_INTERVAL_SEC", "3.0"))
    daemon = HeadlessWorker(worker_id=worker_id)
    asyncio.run(daemon.run(poll_interval_sec=interval))


if __name__ == "__main__":
    main()
