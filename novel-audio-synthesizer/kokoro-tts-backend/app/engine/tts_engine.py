"""TTS Synthesis Engine — Kokoro-TTS wrapper.

Generates per-segment audio using the Kokoro multi-speaker TTS model.
Uses kokoro-tts (PyTorch-based) for inference.
"""

import asyncio
import numpy as np
from typing import Optional
from pathlib import Path

from ..core.config import settings
from ..core.logger import get_logger

logger = get_logger(__name__)

EDGE_TO_KOKORO_MAP = {
    "en-GB-RyanNeural": "bm_george",
    "en-GB-ArthurNeural": "bm_lewis",
    "en-GB-SoniaNeural": "af_sarah",
    "en-GB-LibbyNeural": "bf_emma",
    "en-GB-ThomasNeural": "am_adam",
    "en-GB-AlfieNeural": "bm_daniel",
    "en-GB-NoahNeural": "am_michael",
    "en-GB-OliverNeural": "bm_daniel",
}
KOKORO_TO_EDGE_MAP = {
    "bm_george": "en-GB-RyanNeural",
    "bm_fable": "en-GB-RyanNeural",
    "bm_lewis": "en-GB-RyanNeural",
    "bm_daniel": "en-GB-ThomasNeural",
    "bf_emma": "en-GB-LibbyNeural",
    "bf_isabella": "en-GB-SoniaNeural",
    "am_adam": "en-US-GuyNeural",
    "am_michael": "en-US-AndrewNeural",
    "am_onyx": "en-US-RogerNeural",
    "am_puck": "en-US-SteffanNeural",
    "af_heart": "en-US-AriaNeural",
    "af_bella": "en-US-AvaNeural",
    "af_nicole": "en-US-EmmaNeural",
    "af_sarah": "en-GB-SoniaNeural",
    "af_sky": "en-GB-MaisieNeural",
}
VALID_KOKORO_VOICES = {
    "af_heart", "af_bella", "af_nicole", "af_sky", "af_sarah",
    "am_adam", "am_michael", "am_onyx", "am_puck",
    "bm_george", "bm_lewis", "bf_emma", "bf_isabella", "bm_daniel", "bm_fable",
}


def resolve_kokoro_voice(voice_id: str) -> str:
    if not voice_id:
        return "bm_george"
    if voice_id in VALID_KOKORO_VOICES:
        return voice_id
    return EDGE_TO_KOKORO_MAP.get(voice_id, "bm_george")


def resolve_edge_voice(voice_id: str) -> str:
    raw = str(voice_id or "").strip()
    if raw.startswith("en-") and raw.endswith("Neural"):
        return raw
    return KOKORO_TO_EDGE_MAP.get(raw, "en-GB-RyanNeural")


async def synthesize_with_edge_tts(
    text: str,
    voice_id: str,
    speed: float = 1.0,
    sample_rate: int = 24000,
) -> tuple[np.ndarray, int]:
    """Synthesize real neural speech using edge-tts and decode to 24kHz mono float32 PCM via ffmpeg."""
    import subprocess
    import edge_tts

    clean_text = (text or "").strip()
    if not clean_text:
        silence = np.zeros(int(sample_rate * 0.1), dtype=np.float32)
        return silence, 100

    edge_voice = resolve_edge_voice(voice_id)
    clamped_speed = max(0.5, min(2.0, float(speed or 1.0)))
    rate_pct = int(round((clamped_speed - 1.0) * 100))
    rate_str = f"+{rate_pct}%" if rate_pct >= 0 else f"{rate_pct}%"

    last_err: Optional[Exception] = None
    mp3_bytes = b""
    for attempt in range(2):
        try:
            communicate = edge_tts.Communicate(clean_text, edge_voice, rate=rate_str)
            chunks = []
            async for chunk in communicate.stream():
                if chunk.get("type") == "audio" and chunk.get("data"):
                    chunks.append(chunk["data"])
            mp3_bytes = b"".join(chunks)
            if mp3_bytes:
                break
        except Exception as err:
            last_err = err
            if attempt == 0:
                await asyncio.sleep(0.35)

    if not mp3_bytes:
        raise RuntimeError(f"Edge TTS produced no audio bytes for voice '{edge_voice}': {last_err}")

    def _decode_mp3_to_pcm() -> tuple[np.ndarray, int]:
        proc = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i", "pipe:0",
                "-f", "f32le",
                "-acodec", "pcm_f32le",
                "-ac", "1",
                "-ar", str(sample_rate),
                "pipe:1",
            ],
            input=mp3_bytes,
            capture_output=True,
            timeout=60,
        )
        if proc.returncode != 0 or not proc.stdout:
            stderr_msg = proc.stderr.decode(errors="ignore")[:300]
            raise RuntimeError(f"ffmpeg failed decoding Edge TTS audio: {stderr_msg}")
        pcm = np.frombuffer(proc.stdout, dtype=np.float32).copy()
        if pcm.size == 0:
            raise RuntimeError("Decoded Edge TTS PCM buffer is empty")
        dur_ms = int(round(pcm.size / sample_rate * 1000))
        return pcm, dur_ms

    return await asyncio.to_thread(_decode_mp3_to_pcm)



class TTSEngine:
    """Wraps Kokoro-TTS for multi-voice synthesis."""

    def __init__(
        self,
        model_path: Optional[str] = None,
        voices_path: Optional[str] = None,
    ):
        self._model_path = model_path or settings.kokoro_model_path
        self._voices_path = voices_path or settings.kokoro_voices_path
        self._model = None
        self._sample_rate = settings.sample_rate
        self._initialized = False

    @property
    def sample_rate(self) -> int:
        return self._sample_rate

    def _ensure_initialized(self):
        """Lazy-load the Kokoro model on first use."""
        if self._initialized:
            return

        model_file = settings.resolve_path(self._model_path)
        voices_file = settings.resolve_path(self._voices_path)

        if not model_file.exists():
            raise FileNotFoundError(
                f"Kokoro model not found at {model_file}. "
                f"Please download it to the models_cache/ directory. "
                f"The application will prompt for model installation on first run."
            )

        if not voices_file.exists():
            raise FileNotFoundError(
                f"Kokoro voices file not found at {voices_file}. "
                f"Please download it to the models_cache/ directory."
            )

        try:
            try:
                import os, shutil, uuid, espeakng_loader
                from kokoro_onnx import Kokoro, EspeakConfig
                orig_dp = espeakng_loader.get_data_path()
                if len(orig_dp) > 130:
                    short_dp = "/tmp/espeak-ng-data"
                    if os.path.islink(short_dp):
                        os.unlink(short_dp)
                    if not os.path.exists(short_dp):
                        tmp_dp = f"/tmp/espeak-ng-data.{uuid.uuid4().hex}"
                        shutil.copytree(orig_dp, tmp_dp, symlinks=True)
                        try:
                            os.replace(tmp_dp, short_dp)
                        except OSError:
                            shutil.rmtree(tmp_dp, ignore_errors=True)
                    orig_dp = short_dp
                self._model = Kokoro(str(model_file), str(voices_file), espeak_config=EspeakConfig(data_path=orig_dp))
            except ImportError:
                from kokoro import KPipeline
                self._model = KPipeline(lang_code='a')
            self._initialized = True
            logger.info("Kokoro TTS engine initialized successfully")
        except ImportError:
            raise ImportError(
                "kokoro or kokoro-onnx not installed. Run: pip install kokoro or pip install kokoro-onnx"
            )
        except Exception as e:
            raise RuntimeError(f"Failed to initialize Kokoro TTS: {e}")

    async def synthesize_segment(
        self,
        text: str,
        voice_id: str,
        speed: float = 1.0,
    ) -> tuple[np.ndarray, int]:
        """Synthesize a text segment with a given voice.

        Args:
            text: The text to synthesize.
            voice_id: Kokoro voice tag (e.g., 'af_heart', 'am_adam').
            speed: Playback speed multiplier (default 1.0).

        Returns:
            Tuple of (pcm_samples as float32 numpy array, duration_ms).
        """
        def _run_synthesis_sync() -> tuple[np.ndarray, int]:
            self._ensure_initialized()
            kokoro_voice = resolve_kokoro_voice(voice_id)
            lang = "en-gb" if kokoro_voice.startswith("b") else "en-us"
            if hasattr(self._model, 'create'):
                samples, sr = self._model.create(
                    text=text,
                    voice=kokoro_voice,
                    speed=speed,
                    lang=lang,
                )
            elif callable(self._model):
                generator = self._model(text, voice=kokoro_voice, speed=speed)
                all_samples = []
                sr = self._sample_rate
                for _, _, audio in generator:
                    all_samples.append(audio)
                samples = np.concatenate(all_samples) if all_samples else np.zeros(0, dtype=np.float32)
            else:
                raise RuntimeError("Unsupported Kokoro model interface")

            if samples.dtype != np.float32:
                samples = samples.astype(np.float32)

            if sr != self._sample_rate:
                logger.warning(
                    f"Model sample rate ({sr}) differs from config ({self._sample_rate})"
                )
                self._sample_rate = sr

            duration_ms = int(len(samples) / sr * 1000)
            logger.debug(
                f"Synthesized {len(text)} chars with voice '{voice_id}' → "
                f"{duration_ms}ms ({len(samples)} samples @ {sr}Hz)"
            )
            return samples, duration_ms

        if not text.strip():
            silence = np.zeros(int(self._sample_rate * 0.1), dtype=np.float32)
            return silence, 100

        try:
            return await asyncio.to_thread(_run_synthesis_sync)
        except Exception as e:
            logger.error(f"TTS synthesis failed for voice '{voice_id}': {e}")
            raise RuntimeError(f"TTS synthesis failed for voice '{voice_id}': {e}") from e

    async def check_model_available(self) -> dict:
        """Check if the TTS model files exist and return status."""
        model_file = settings.resolve_path(self._model_path)
        voices_file = settings.resolve_path(self._voices_path)

        return {
            "model_exists": model_file.exists(),
            "voices_exists": voices_file.exists(),
            "model_path": str(model_file),
            "voices_path": str(voices_file),
            "initialized": self._initialized,
        }
