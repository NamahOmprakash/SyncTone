"""Application configuration using Pydantic Settings."""

from pydantic_settings import BaseSettings
from pathlib import Path
import os


class Settings(BaseSettings):
    """Central configuration. Override via environment variables prefixed with NAS_."""

    # --- Paths ---
    base_dir: Path = Path(__file__).resolve().parent.parent.parent  # backend/
    models_dir: Path = Path("models_cache")
    output_dir: Path = Path("output")
    chapters_dir: Path = Path("chapters")
    kokoro_model_path: str = "models_cache/kokoro-v1.0.pth"
    kokoro_voices_path: str = "models_cache/voices-v1.0.bin"

    # --- LLM (Ollama) ---
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2:1b"

    # --- Audio ---
    sample_rate: int = 24000
    inter_speaker_pause_ms: int = 150
    default_audio_format: str = "opus"

    # --- Server ---
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True

    # --- SpaCy ---
    spacy_model: str = "en_core_web_sm"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

    def resolve_path(self, relative: Path | str) -> Path:
        """Resolve a relative path against the backend base directory."""
        return self.base_dir / relative


settings = Settings()

# Ensure required directories exist
for d in [settings.models_dir, settings.output_dir, settings.chapters_dir]:
    resolved = settings.resolve_path(d)
    resolved.mkdir(parents=True, exist_ok=True)
