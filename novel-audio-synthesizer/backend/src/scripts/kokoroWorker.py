#!/usr/bin/env python3
"""
Kokoro-TTS ONNX Inference Worker for SyncTone.
Supports both single-shot WAV output (`--out <path.wav>`) and persistent
JSON-lines daemon mode (`--daemon`) over stdin/stdout for low-latency neural synthesis.
"""

import argparse
import base64
import json
import os
import re
import shutil
import sys
from pathlib import Path

import espeakng_loader
import numpy as np
import soundfile as sf
from kokoro_onnx import EspeakConfig, Kokoro

SAMPLE_RATE = 24000

# Voice remapping for deprecated / legacy voice requests
VOICE_ALIASES = {
    "am_george": "bm_lewis",
    "en-GB-ArthurNeural": "bm_lewis",
    "en-GB-AlfieNeural": "bm_daniel",
    "en-GB-NoahNeural": "am_michael",
    "en-GB-OliverNeural": "bm_george",
    "en-GB-RyanNeural": "bm_george",
    "en-GB-ThomasNeural": "am_adam",
    "en-GB-LibbyNeural": "bf_emma",
    "en-GB-SoniaNeural": "af_sarah",
}


def ensure_short_espeak_data_path() -> str:
    orig_dp = espeakng_loader.get_data_path()
    if len(orig_dp) > 130:
        short_dp = "/tmp/espeak-ng-data"
        if os.path.islink(short_dp):
            try:
                os.unlink(short_dp)
            except OSError:
                pass
        if not os.path.exists(short_dp):
            shutil.copytree(orig_dp, short_dp, symlinks=True)
        return short_dp
    return orig_dp


class KokoroSynthesizer:
    def __init__(self, model_path: str, voices_path: str):
        self.model_path = model_path
        self.voices_path = voices_path
        self.sample_rate = SAMPLE_RATE

        data_path = ensure_short_espeak_data_path()
        espeak_cfg = EspeakConfig(data_path=data_path)
        self.kokoro = Kokoro(model_path, voices_path, espeak_config=espeak_cfg)

        # Discover available voices from voices.bin
        self.voices = []
        try:
            v_data = np.load(voices_path)
            keys = list(v_data.files) if hasattr(v_data, "files") else list(v_data.keys())
            self.voices = [k for k in keys if k.startswith(("af_", "am_", "bf_", "bm_"))]
        except Exception:
            self.voices = [
                "af_heart", "af_bella", "af_nicole", "af_sarah", "af_sky", "af_alloy", "af_aoede", "af_jessica", "af_kore", "af_nova", "af_river",
                "am_adam", "am_michael", "am_onyx", "am_puck", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_santa",
                "bf_emma", "bf_isabella", "bf_alice", "bf_lily",
                "bm_george", "bm_daniel", "bm_fable", "bm_lewis",
            ]

    def resolve_voice_and_lang(self, voice_name: str, lang: str = "") -> tuple[str, str]:
        v = (voice_name or "bm_george").strip()
        if v in VOICE_ALIASES:
            v = VOICE_ALIASES[v]

        if v not in self.voices:
            # Fallback based on prefix
            if v.startswith("bf"):
                v = "bf_emma"
            elif v.startswith("bm"):
                v = "bm_george"
            elif v.startswith("af"):
                v = "af_heart"
            elif v.startswith("am"):
                v = "am_adam"
            else:
                v = "bm_george"

        resolved_lang = lang
        if not resolved_lang:
            resolved_lang = "en-gb" if v.startswith("b") else "en-us"

        return v, resolved_lang

    def synthesize(self, text: str, voice: str = "bm_george", speed: float = 1.0, lang: str = "") -> np.ndarray:
        cleaned = (text or "").strip()
        if not cleaned or not re.search(r"[A-Za-z0-9]", cleaned):
            return np.zeros(int(self.sample_rate * 0.15), dtype=np.float32)

        v, l = self.resolve_voice_and_lang(voice, lang)
        effective_speed = float(speed or 1.0)

        # Split long text into sentence chunks to stay well under Kokoro's 510 phoneme window
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", cleaned) if s.strip()]
        if not sentences:
            sentences = [cleaned]

        chunks = []
        curr = ""
        for s in sentences:
            if len(curr) + len(s) + 1 <= 320:
                curr = f"{curr} {s}".strip() if curr else s
            else:
                if curr:
                    chunks.append(curr)
                curr = s[:320]
        if curr:
            chunks.append(curr)

        all_samples = []
        for c in chunks:
            if not re.search(r"[A-Za-z0-9]", c):
                continue
            try:
                samples, _ = self.kokoro.create(c, voice=v, speed=effective_speed, lang=l)
                if len(samples) > 0:
                    all_samples.append(samples)
            except Exception:
                continue

        if not all_samples:
            return np.zeros(int(self.sample_rate * 0.2), dtype=np.float32)

        return np.concatenate(all_samples)


def float32_to_pcm16_bytes(samples: np.ndarray) -> bytes:
    clipped = np.clip(samples, -1.0, 1.0)
    pcm16 = (clipped * 32767.0).astype(np.int16)
    return pcm16.tobytes()


def main() -> int:
    parser = argparse.ArgumentParser(description="Kokoro-TTS ONNX Inference Worker")
    parser.add_argument("--model", required=True, help="Path to kokoro onnx model")
    parser.add_argument("--voices", required=True, help="Path to voices.bin")
    parser.add_argument("--daemon", action="store_true", help="Run persistent JSONL worker")
    parser.add_argument("--text", default="", help="Text to synthesize in single-shot mode")
    parser.add_argument("--voice", default="bm_george", help="Voice ID")
    parser.add_argument("--speed", type=float, default=1.0, help="Speech speed multiplier")
    parser.add_argument("--lang", default="", help="Language code (en-us or en-gb)")
    parser.add_argument("--out", default="", help="Output WAV file path in single-shot mode")
    args = parser.parse_args()

    synth = KokoroSynthesizer(args.model, args.voices)

    if args.daemon:
        sys.stdout.write(json.dumps({"status": "ready", "voices": synth.voices}) + "\n")
        sys.stdout.flush()
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                req = json.loads(line)
                req_id = req.get("id")
                text = req.get("text", "")
                voice = req.get("voice", "bm_george")
                speed = float(req.get("speed", 1.0))
                lang = req.get("lang", "")
                out_wav = req.get("out_wav")

                samples = synth.synthesize(text, voice=voice, speed=speed, lang=lang)
                if out_wav:
                    sf.write(out_wav, samples, synth.sample_rate, subtype="PCM_16")
                    resp = {
                        "id": req_id,
                        "ok": True,
                        "out_wav": out_wav,
                        "samples": int(samples.size),
                        "sample_rate": synth.sample_rate,
                    }
                else:
                    pcm_bytes = float32_to_pcm16_bytes(samples)
                    resp = {
                        "id": req_id,
                        "ok": True,
                        "pcm_b64": base64.b64encode(pcm_bytes).decode("ascii"),
                        "samples": int(samples.size),
                        "sample_rate": synth.sample_rate,
                    }
            except Exception as exc:
                resp = {"id": req.get("id") if isinstance(req, dict) else None, "ok": False, "error": str(exc)}
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()
        return 0

    samples = synth.synthesize(args.text, voice=args.voice, speed=args.speed, lang=args.lang)
    if args.out:
        sf.write(args.out, samples, synth.sample_rate, subtype="PCM_16")
    else:
        sys.stdout.buffer.write(float32_to_pcm16_bytes(samples))
    return 0


if __name__ == "__main__":
    sys.exit(main())
