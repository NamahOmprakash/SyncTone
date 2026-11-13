#!/usr/bin/env python3
"""
Idempotent downloader and verifier for sahilmahendrakar/Paradee-8M-v1.2.
Downloads `onnx/paradee_int8.onnx` (~8.5 MB), `config.json`, and `tokenizer.json` into
`kokoro-tts-backend/models_cache/paradee/` and prints tensor metadata.
"""

import json
import os
import ssl
import subprocess
import sys
import urllib.request
from pathlib import Path

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except Exception:
    SSL_CONTEXT = ssl.create_default_context()

HF_BASE_URL = "https://huggingface.co/sahilmahendrakar/Paradee-8M-v1.2/resolve/main"
FILES = [
    ("onnx/paradee_int8.onnx", "paradee_int8.onnx"),
    ("config.json", "config.json"),
    ("tokenizer.json", "tokenizer.json"),
    ("README.md", "README.md"),
]


def resolve_target_dir() -> Path:
    script_dir = Path(__file__).resolve().parent
    candidates = [
        script_dir.parent.parent.parent / "kokoro-tts-backend" / "models_cache" / "paradee",
        script_dir.parent.parent / "models_cache" / "paradee",
    ]
    for candidate in candidates:
        if candidate.parent.exists():
            return candidate
    return candidates[0]


def download_file(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 100:
        print(f"[setupParadeeModel] Cached: {dest} ({dest.stat().st_size} bytes)")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp_dest = dest.with_suffix(dest.suffix + ".tmp")
    print(f"[setupParadeeModel] Downloading {url} -> {dest} ...")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "SyncTone-Paradee-Setup/1.0"})
        with urllib.request.urlopen(req, timeout=120, context=SSL_CONTEXT) as resp, open(tmp_dest, "wb") as out:
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                out.write(chunk)
    except Exception:
        subprocess.run(["curl", "-fSL", "-o", str(tmp_dest), url], check=True)
    tmp_dest.replace(dest)
    print(f"[setupParadeeModel] Downloaded {dest.name} ({dest.stat().st_size} bytes)")


def main() -> int:
    target_dir = resolve_target_dir()
    if len(sys.argv) > 1:
        target_dir = Path(sys.argv[1]).resolve()

    for remote_rel, local_name in FILES:
        url = f"{HF_BASE_URL}/{remote_rel}"
        download_file(url, target_dir / local_name)

    config_path = target_dir / "config.json"
    onnx_path = target_dir / "paradee_int8.onnx"

    with open(config_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    print(f"[setupParadeeModel] config.json: {json.dumps(cfg, indent=2)}")

    try:
        import onnxruntime as ort
        sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
        inputs = [(i.name, i.type, i.shape) for i in sess.get_inputs()]
        outputs = [(o.name, o.type, o.shape) for o in sess.get_outputs()]
        print(f"[setupParadeeModel] ONNX Inputs:  {inputs}")
        print(f"[setupParadeeModel] ONNX Outputs: {outputs}")
    except Exception as exc:
        print(f"[setupParadeeModel] Warning: Could not inspect ONNX session: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
