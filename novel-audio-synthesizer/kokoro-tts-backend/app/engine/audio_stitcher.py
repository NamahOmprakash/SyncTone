"""Audio Stitcher — Gapless concatenation & timeline alignment.

Concatenates per-segment PCM audio with inter-speaker pauses,
builds a PlaybackManifest with precise timestamps, and exports
to Opus format via ffmpeg.
"""

import numpy as np
import subprocess
import struct
import wave
from pathlib import Path
from typing import Optional

from ..models.schemas import (
    PlaybackManifest,
    TimelineEntry,
    AudioFormat,
)
from ..core.config import settings
from ..core.logger import get_logger

logger = get_logger(__name__)


def _check_ffmpeg() -> bool:
    """Check if ffmpeg is available on the system."""
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            timeout=5,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


class AudioStitcher:
    """Concatenates segment audio and builds timeline manifests."""

    def __init__(
        self,
        sample_rate: Optional[int] = None,
        inter_speaker_pause_ms: Optional[int] = None,
    ):
        self.sample_rate = sample_rate or settings.sample_rate
        self.pause_ms = inter_speaker_pause_ms or settings.inter_speaker_pause_ms
        self._has_ffmpeg = _check_ffmpeg()
        if not self._has_ffmpeg:
            logger.warning(
                "ffmpeg not found — audio will be exported as WAV only. "
                "Install ffmpeg for Opus/MP3 encoding."
            )

    def stitch(
        self,
        segments: list[dict],
        output_dir: Path,
        chapter_id: str,
        output_format: AudioFormat = AudioFormat.OPUS,
    ) -> PlaybackManifest:
        """Stitch segment audio into a single file with timeline.

        Args:
            segments: List of dicts with keys:
                - segment_id: int
                - voice_id: str
                - speaker_name: str
                - pcm_samples: np.ndarray (float32)
            output_dir: Directory to write audio files.
            chapter_id: Unique chapter identifier.
            output_format: Target audio format.

        Returns:
            PlaybackManifest with timeline and audio URL.
        """
        output_dir.mkdir(parents=True, exist_ok=True)

        timeline: list[TimelineEntry] = []
        all_samples: list[np.ndarray] = []
        total_samples = 0
        prev_voice: Optional[str] = None
        current_ms = 0

        for seg in segments:
            pcm = seg["pcm_samples"]

            # Insert pause between different speakers
            if prev_voice is not None and seg["voice_id"] != prev_voice:
                pause_n = int(round(self.sample_rate * self.pause_ms / 1000))
                pause_samples = np.zeros(pause_n, dtype=np.float32)
                all_samples.append(pause_samples)
                total_samples += pause_n

            start_ms = int(round(total_samples * 1000 / self.sample_rate))
            total_samples += len(pcm)
            end_ms = int(round(total_samples * 1000 / self.sample_rate))
            duration_ms = end_ms - start_ms

            timeline.append(
                TimelineEntry(
                    segment_id=seg["segment_id"],
                    start_ms=start_ms,
                    end_ms=end_ms,
                    speaker_name=seg.get("speaker_name", ""),
                    voice_id=seg["voice_id"],
                )
            )

            all_samples.append(pcm)
            current_ms = end_ms
            prev_voice = seg["voice_id"]

        # Concatenate all samples
        if all_samples:
            combined = np.concatenate(all_samples)
        else:
            combined = np.zeros(self.sample_rate, dtype=np.float32)  # 1s silence

        # Write WAV first (always needed as intermediate)
        wav_path = output_dir / f"{chapter_id}.wav"
        self._write_wav(combined, wav_path)

        # Encode to target format
        audio_url = f"/static/audio/{chapter_id}.wav"
        final_format = AudioFormat.WAV

        if output_format != AudioFormat.WAV and self._has_ffmpeg:
            encoded_path = self._encode(wav_path, output_dir, chapter_id, output_format)
            if encoded_path:
                audio_url = f"/static/audio/{encoded_path.name}"
                final_format = output_format
                # Clean up intermediate WAV
                # wav_path.unlink()  # Keep WAV for debugging

        logger.info(
            f"Stitched {len(segments)} segments → {current_ms}ms total, "
            f"format: {final_format.value}"
        )

        return PlaybackManifest(
            chapter_id=chapter_id,
            audio_stream_url=audio_url,
            audio_format=final_format,
            total_duration_ms=current_ms,
            timeline=timeline,
        )

    def _write_wav(self, samples: np.ndarray, path: Path) -> None:
        """Write float32 PCM samples to a WAV file."""
        # Convert float32 [-1.0, 1.0] to int16
        int16_samples = np.clip(samples * 32767, -32768, 32767).astype(np.int16)

        with wave.open(str(path), "wb") as wf:
            wf.setnchannels(1)  # Mono
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(self.sample_rate)
            wf.writeframes(int16_samples.tobytes())

        logger.debug(f"Wrote WAV: {path} ({path.stat().st_size / 1024:.1f} KB)")

    def _encode(
        self,
        wav_path: Path,
        output_dir: Path,
        chapter_id: str,
        fmt: AudioFormat,
    ) -> Optional[Path]:
        """Encode WAV to target format using ffmpeg."""
        ext = fmt.value
        output_path = output_dir / f"{chapter_id}.{ext}"

        codec_args = {
            AudioFormat.OPUS: ["-c:a", "libopus", "-b:a", "64k"],
            AudioFormat.MP3: ["-c:a", "libmp3lame", "-q:a", "2"],
        }

        args = codec_args.get(fmt, [])

        try:
            cmd = [
                "ffmpeg", "-y",
                "-i", str(wav_path),
                *args,
                str(output_path),
            ]
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=120,
            )

            if result.returncode == 0:
                logger.info(
                    f"Encoded {ext}: {output_path} "
                    f"({output_path.stat().st_size / 1024:.1f} KB)"
                )
                return output_path
            else:
                logger.error(
                    f"ffmpeg encoding failed: {result.stderr.decode()[:500]}"
                )
        except Exception as e:
            logger.error(f"ffmpeg encoding error: {e}")

        return None
