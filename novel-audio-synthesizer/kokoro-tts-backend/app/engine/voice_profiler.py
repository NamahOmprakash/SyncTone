"""Voice Profiler & Embedding Mapper.

Maps characters to distinct TTS voices from a predefined palette
using keyword heuristics and deterministic hash fallback.
"""

import re
import zlib
import json
from pathlib import Path
from typing import Optional

from ..models.schemas import Segment, SegmentType
from ..core.config import settings
from ..core.logger import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Voice Palette — Kokoro voice tags
# ---------------------------------------------------------------------------

VOICE_PALETTE: dict[str, str] = {
    "narrator":          "af_heart",    # Neutral American female
    "young_male":        "am_adam",     # Young American male
    "deep_male":         "am_onyx",     # Deep American male
    "calm_female":       "af_sky",      # Calm American female
    "energetic_female":  "af_bella",    # Energetic American female
    "british_male":      "bm_george",   # British male
}

VOICE_PALETTE_LIST = list(VOICE_PALETTE.values())

# ---------------------------------------------------------------------------
# Keyword → Archetype mapping
# ---------------------------------------------------------------------------

KEYWORD_MAP: dict[str, str] = {
    # Male archetypes
    "captain": "deep_male",
    "commander": "deep_male",
    "general": "deep_male",
    "king": "deep_male",
    "lord": "deep_male",
    "beast": "deep_male",
    "giant": "deep_male",
    "warrior": "deep_male",
    "knight": "deep_male",
    "man": "young_male",
    "boy": "young_male",
    "prince": "young_male",
    "lad": "young_male",
    "sir": "british_male",
    "gentleman": "british_male",
    "butler": "british_male",
    # Female archetypes
    "lady": "calm_female",
    "woman": "calm_female",
    "queen": "calm_female",
    "mother": "calm_female",
    "maiden": "calm_female",
    "girl": "energetic_female",
    "princess": "energetic_female",
    "child": "energetic_female",
    "lass": "energetic_female",
}


class VoiceProfiler:
    """Maps characters to TTS voice IDs with persistence."""

    def __init__(self, persist_path: Optional[Path] = None):
        self._registry: dict[str, str] = {}  # character_id -> voice_id
        self._persist_path = persist_path
        if persist_path and persist_path.exists():
            self._load()

    def _load(self):
        """Load voice assignments from disk."""
        try:
            with open(self._persist_path, "r") as f:
                self._registry = json.load(f)
            logger.info(f"Loaded {len(self._registry)} voice assignments")
        except Exception as e:
            logger.warning(f"Failed to load voice registry: {e}")

    def _save(self):
        """Persist voice assignments to disk."""
        if self._persist_path:
            try:
                self._persist_path.parent.mkdir(parents=True, exist_ok=True)
                with open(self._persist_path, "w") as f:
                    json.dump(self._registry, f, indent=2)
            except Exception as e:
                logger.warning(f"Failed to save voice registry: {e}")

    def resolve_character_voice(
        self, name: str, context_snippet: str = ""
    ) -> str:
        """Resolve a character name to a voice ID.

        Priority:
        1. Existing assignment in registry
        2. Narrator special case
        3. Keyword-based heuristic
        4. Deterministic CRC32 hash fallback

        Args:
            name: Character name.
            context_snippet: Optional text context for keyword scanning.

        Returns:
            A Kokoro voice ID string.
        """
        char_id = name.lower().replace(" ", "_").strip()

        # 1. Check existing assignment
        if char_id in self._registry:
            return self._registry[char_id]

        # 2. Narrator special case
        if char_id in ("", "narrator", "narration", "unresolved"):
            voice_id = VOICE_PALETTE["narrator"]
            self._registry[char_id] = voice_id
            self._save()
            return voice_id

        # 3. Keyword scan (sorted by length descending with word-boundary matching)
        combined = f"{name} {context_snippet}".lower()
        sorted_keywords = sorted(KEYWORD_MAP.items(), key=lambda kv: len(kv[0]), reverse=True)
        for keyword, archetype in sorted_keywords:
            if re.search(rf"\b{re.escape(keyword)}\b", combined, re.IGNORECASE):
                voice_id = VOICE_PALETTE[archetype]
                self._registry[char_id] = voice_id
                self._save()
                logger.info(
                    f"Voice for '{name}' → {voice_id} (keyword: '{keyword}')"
                )
                return voice_id

        # 4. Deterministic hash fallback
        idx = zlib.crc32(char_id.encode()) % len(VOICE_PALETTE_LIST)
        voice_id = VOICE_PALETTE_LIST[idx]
        self._registry[char_id] = voice_id
        self._save()
        logger.info(f"Voice for '{name}' → {voice_id} (hash fallback)")
        return voice_id

    def assign_voice(
        self, character_id: str, voice_id: str
    ) -> None:
        """Manually assign a voice to a character (from frontend roster)."""
        self._registry[character_id] = voice_id
        self._save()
        logger.info(f"Manual voice assignment: '{character_id}' → {voice_id}")

    def apply_voices_to_segments(
        self, segments: list[Segment]
    ) -> list[Segment]:
        """Apply voice IDs to all segments based on their speaker."""
        for seg in segments:
            voice_id = self.resolve_character_voice(
                seg.speaker_name,
                seg.text[:100],  # First 100 chars as context
            )
            seg.assigned_voice_id = voice_id
        return segments

    def get_all_assignments(self) -> dict[str, str]:
        """Return the full character → voice mapping."""
        return dict(self._registry)

    @staticmethod
    def get_available_voices() -> dict[str, str]:
        """Return all available voice IDs with their archetype labels."""
        return dict(VOICE_PALETTE)
