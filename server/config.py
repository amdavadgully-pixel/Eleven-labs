"""Runtime configuration, read from environment variables."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = Path(os.environ.get("VF_MODELS_DIR", ROOT / "models"))
DATA_DIR = Path(os.environ.get("VF_DATA_DIR", ROOT / "data"))
WEB_DIR = ROOT / "web"

MODEL_PATH = Path(os.environ.get("VF_MODEL_PATH", MODELS_DIR / "kokoro-v1.0.onnx"))
VOICES_PATH = Path(os.environ.get("VF_VOICES_PATH", MODELS_DIR / "voices-v1.0.bin"))

# Hard limit per request, to keep a single job from hogging the engine.
MAX_CHARS = int(os.environ.get("VF_MAX_CHARS", "200000"))
# Optional API key for the /v1 compatibility endpoints (and /api). Empty = open.
API_KEY = os.environ.get("VF_API_KEY", "")

SAMPLE_RATE = 24000
