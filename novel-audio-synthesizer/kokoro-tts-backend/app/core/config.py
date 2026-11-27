"""Application configuration using Pydantic Settings."""

from pydantic import ConfigDict
from pydantic_settings import BaseSettings
from pathlib import Path
import os


class Settings(BaseSettings):
    """Central configuration. Override via environment variables."""

    # --- Paths ---
    base_dir: Path = Path(__file__).resolve().parent.parent.parent  # backend/
    models_dir: Path = Path("models_cache")
    output_dir: Path = Path(os.getenv("AUDIO_OUTPUT_DIR", "output"))
    chapters_dir: Path = Path(os.getenv("CHAPTERS_DIR", "chapters"))
    kokoro_model_path: str = "models_cache/kokoro-v1.0.onnx"
    kokoro_voices_path: str = "models_cache/voices-v1.0.bin"
    mongo_uri: str = "mongodb://localhost:27017/synctone"
    worker_lock_timeout_sec: int = 300

    # --- LLM (Ollama) ---
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2:1b"

    # --- Audio ---
    sample_rate: int = 24000
    inter_speaker_pause_ms: int = 150
    default_audio_format: str = "mp3"

    # --- Server ---
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True

    # --- SpaCy ---
    spacy_model: str = "en_core_web_sm"

    model_config = ConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def AUDIO_OUTPUT_DIR(self) -> Path:
        return self.output_dir

    def resolve_path(self, relative: Path | str) -> Path:
        """Resolve a path against backend base directory (or shared repo output if present)."""
        p = Path(relative)
        if p.is_absolute():
            return p
        candidate = self.base_dir / p
        if str(p) == "output" and not candidate.exists():
            parent_output = self.base_dir.parent / "output"
            if parent_output.exists():
                return parent_output
        return candidate


settings = Settings()

# Ensure required directories exist
for d in [settings.models_dir, settings.output_dir, settings.chapters_dir]:
    resolved = settings.resolve_path(d)
    resolved.mkdir(parents=True, exist_ok=True)
