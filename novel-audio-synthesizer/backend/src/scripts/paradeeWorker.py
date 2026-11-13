#!/usr/bin/env python3
"""
Paradee-8M-v1.2 ONNX Inference Worker for SyncTone.
Supports both single-shot WAV output (`--out <path.wav>`) and persistent
JSON-lines daemon mode (`--daemon`) over stdin/stdout for sub-50ms warm synthesis.
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
import onnxruntime as ort
import soundfile as sf
from phonemizer.backend import EspeakBackend
from phonemizer.backend.espeak.wrapper import EspeakWrapper

SAMPLE_RATE = 24000

# Exact eSpeak-to-Misaki phoneme conversion rules from sahilmahendrakar/paradee (web/misaki.js)
E2M_RULES = [
    ("ʔˌn̩", "ʔn"),
    ("ʔn̩", "ʔn"),
    ("aɪ", "I"),
    ("aʊ", "W"),
    ("dʒ", "ʤ"),
    ("eɪ", "A"),
    ("e", "A"),
    ("tʃ", "ʧ"),
    ("ɔɪ", "Y"),
    ("ʲo", "jo"),
    ("ʲə", "jə"),
    ("ʲ", ""),
    ("ɚ", "əɹ"),
    ("r", "ɹ"),
    ("x", "k"),
    ("ç", "k"),
    ("ɬ", "l"),
    ("\u0303", ""),
]


def to_misaki(ps: str, british: bool = False) -> str:
    if british:
        ps = ps.replace("eə", "ɛː")
    for src, dst in E2M_RULES:
        ps = ps.replace(src, dst)
    ps = re.sub(r"(\S)\u0329", r"ᵊ\1", ps).replace("\u0329", "")
    ps = re.sub(r"əl(?=[\s;:,.!?—…\"“”()]|$)", "ᵊl", ps)
    if british:
        ps = re.sub(r"ɐ(?!n?(?:[\s;:,.!?—…\"“”()]|$))", "ə", ps)
        ps = ps.replace("iə", "ɪə").replace("əʊ", "Q")
        ps = re.sub(r"(^|\s)ðɪ(?=\s|$)", r"\1ði", ps)
    else:
        ps = re.sub(r"ɐ(?![\s;:,.!?—…\"“”()]|$)", "ə", ps)
        ps = (
            ps.replace("oʊ", "O")
            .replace("ɜːɹ", "ɜɹ")
            .replace("ɜː", "ɜɹ")
            .replace("ɪə", "iə")
            .replace("ː", "")
        )
    ps = ps.replace("o", "ɔ")
    return ps.replace("ɾ", "T").replace("ʔ", "t")


def ensure_short_espeak_data_path() -> str:
    orig_dp = espeakng_loader.get_data_path()
    if len(orig_dp) > 130:
        short_dp = "/tmp/espeak-ng-data"
        if os.path.islink(short_dp):
            os.unlink(short_dp)
        if not os.path.exists(short_dp):
            shutil.copytree(orig_dp, short_dp, symlinks=True)
        return short_dp
    return orig_dp


class ParadeeSynthesizer:
    def __init__(self, onnx_path: str, config_path: str):
        with open(config_path, "r", encoding="utf-8") as f:
            self.cfg = json.load(f)

        self.vocab = self.cfg.get("vocab", {})
        self.voices = self.cfg.get("voices", ["af_heart", "bf_isabella", "am_puck", "bm_fable"])
        self.sample_rate = int(self.cfg.get("sample_rate", SAMPLE_RATE))

        data_path = ensure_short_espeak_data_path()
        EspeakWrapper.set_library(espeakng_loader.get_library_path())
        if hasattr(EspeakWrapper, "set_data_path"):
            EspeakWrapper.set_data_path(data_path)
        else:
            os.environ["ESPEAK_DATA_PATH"] = data_path

        self.backends = {
            "en-us": EspeakBackend("en-us", preserve_punctuation=True, with_stress=True),
            "en-gb": EspeakBackend("en-gb", preserve_punctuation=True, with_stress=True),
        }

        sess_opts = ort.SessionOptions()
        sess_opts.intra_op_num_threads = 2
        self.session = ort.InferenceSession(
            str(onnx_path), sess_options=sess_opts, providers=["CPUExecutionProvider"]
        )

    def resolve_voice_index(self, voice_name: str) -> tuple[int, bool]:
        v = (voice_name or "bm_fable").strip()
        if v not in self.voices:
            if v.startswith("bf") or v in ("en-GB-LibbyNeural", "en-GB-SoniaNeural", "bf_emma"):
                v = "bf_isabella"
            elif v.startswith("af"):
                v = "af_heart"
            elif v.startswith("am"):
                v = "am_puck"
            else:
                v = "bm_fable"
        idx = self.voices.index(v) if v in self.voices else 0
        is_british = v.startswith("b")
        return idx, is_british

    def phonemize_chunk(self, text_chunk: str, is_british: bool) -> list[int]:
        lang = "en-gb" if is_british else "en-us"
        backend = self.backends[lang]
        raw_ps = backend.phonemize([text_chunk], strip=True)[0]
        misaki_ps = to_misaki(raw_ps, british=is_british)
        token_ids = [self.vocab[ch] for ch in misaki_ps if ch in self.vocab]
        # Pad with 0 at each end, max 512 tokens total
        token_ids = token_ids[:510]
        return [0] + token_ids + [0]

    def synthesize(self, text: str, voice: str = "bm_fable", speed: float = 1.0) -> np.ndarray:
        cleaned = (text or "").strip()
        if not cleaned or not re.search(r"[A-Za-z0-9]", cleaned):
            return np.zeros(int(self.sample_rate * 0.15), dtype=np.float32)

        voice_idx, is_british = self.resolve_voice_index(voice)
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", cleaned) if s.strip()]
        if not sentences:
            sentences = [cleaned]

        chunks = []
        curr = ""
        for s in sentences:
            if len(curr) + len(s) + 1 <= 280:
                curr = f"{curr} {s}".strip() if curr else s
            else:
                if curr:
                    chunks.append(curr)
                curr = s[:280]
        if curr:
            chunks.append(curr)

        waveforms = []
        speed_arr = np.array([float(speed or 1.0)], dtype=np.float32)
        voice_arr = np.array([int(voice_idx)], dtype=np.int64)

        for chunk in chunks:
            ids = self.phonemize_chunk(chunk, is_british)
            if len(ids) <= 2:
                continue
            input_ids = np.array([ids], dtype=np.int64)
            outputs = self.session.run(
                None,
                {
                    "input_ids": input_ids,
                    "speed": speed_arr,
                    "voice": voice_arr,
                },
            )
            wav = np.squeeze(outputs[0]).astype(np.float32)
            if wav.ndim == 1 and wav.size > 0:
                waveforms.append(wav)

        if not waveforms:
            return np.zeros(int(self.sample_rate * 0.2), dtype=np.float32)

        return np.concatenate(waveforms)


def float32_to_pcm16_bytes(samples: np.ndarray) -> bytes:
    clipped = np.clip(samples, -1.0, 1.0)
    pcm16 = (clipped * 32767.0).astype(np.int16)
    return pcm16.tobytes()


def main() -> int:
    parser = argparse.ArgumentParser(description="Paradee-8M-v1.2 ONNX Worker")
    parser.add_argument("--model", required=True, help="Path to paradee_int8.onnx")
    parser.add_argument("--config", required=True, help="Path to config.json")
    parser.add_argument("--daemon", action="store_true", help="Run persistent JSONL worker")
    parser.add_argument("--text", default="", help="Text to synthesize in single-shot mode")
    parser.add_argument("--voice", default="bm_fable", help="Voice ID (bm_fable, bf_isabella, am_puck, af_heart)")
    parser.add_argument("--speed", type=float, default=1.0, help="Speech speed multiplier")
    parser.add_argument("--out", default="", help="Output WAV file path in single-shot mode")
    args = parser.parse_args()

    synth = ParadeeSynthesizer(args.model, args.config)

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
                voice = req.get("voice", "bm_fable")
                speed = float(req.get("speed", 1.0))
                out_wav = req.get("out_wav")

                samples = synth.synthesize(text, voice=voice, speed=speed)
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

    samples = synth.synthesize(args.text, voice=args.voice, speed=args.speed)
    if args.out:
        sf.write(args.out, samples, synth.sample_rate, subtype="PCM_16")
    else:
        sys.stdout.buffer.write(float32_to_pcm16_bytes(samples))
    return 0


if __name__ == "__main__":
    sys.exit(main())
