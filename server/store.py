"""Tiny JSON/filesystem persistence: history, custom voices, pronunciations."""
from __future__ import annotations

import json
import re
import shutil
import threading
import time
import uuid
from pathlib import Path

import numpy as np
import soundfile as sf

from . import config

_lock = threading.Lock()


def _path(name: str) -> Path:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    return config.DATA_DIR / name


def _read(name: str, default):
    p = _path(name)
    if not p.exists():
        return default
    try:
        return json.loads(p.read_text("utf-8"))
    except json.JSONDecodeError:
        return default


def _write(name: str, value) -> None:
    p = _path(name)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), "utf-8")
    tmp.replace(p)


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def _safe_id(i: str) -> str:
    if not re.fullmatch(r"[a-f0-9]{6,32}", i or ""):
        raise KeyError(i)
    return i


# ---------------------------------------------------------------- custom voices
def custom_voices() -> list[dict]:
    return _read("voices.json", [])


def get_custom(vid: str) -> dict | None:
    return next((v for v in custom_voices() if v["id"] == vid), None)


def save_custom(voice: dict) -> dict:
    with _lock:
        voices = [v for v in custom_voices() if v["id"] != voice.get("id")]
        voice = {**voice, "id": voice.get("id") or new_id(), "kind": "custom",
                 "created": voice.get("created") or time.time()}
        voices.append(voice)
        _write("voices.json", voices)
    return voice


def delete_custom(vid: str) -> bool:
    with _lock:
        voices = custom_voices()
        kept = [v for v in voices if v["id"] != vid]
        _write("voices.json", kept)
    return len(kept) != len(voices)


# ---------------------------------------------------------------- pronunciations
def pronunciations() -> list[dict]:
    return _read("pronunciations.json", [])


def set_pronunciations(rules: list[dict]) -> list[dict]:
    clean = []
    for r in rules:
        term, repl = str(r.get("term", "")).strip(), str(r.get("replacement", "")).strip()
        if term and repl:
            clean.append({"term": term, "replacement": repl,
                          "type": "ipa" if r.get("type") == "ipa" else "alias",
                          "case_sensitive": bool(r.get("case_sensitive"))})
    with _lock:
        _write("pronunciations.json", clean)
    return clean


# ---------------------------------------------------------------- history
def _hist_dir() -> Path:
    d = _path("history")
    d.mkdir(exist_ok=True)
    return d


def save_history(audio: np.ndarray, meta: dict) -> dict:
    hid = new_id()
    d = _hist_dir() / hid
    d.mkdir()
    sf.write(d / "audio.wav", audio, config.SAMPLE_RATE, subtype="PCM_16")
    meta = {**meta, "id": hid, "created": time.time()}
    (d / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), "utf-8")
    return meta


def list_history(limit: int = 200) -> list[dict]:
    items = []
    for d in _hist_dir().iterdir():
        mp = d / "meta.json"
        if mp.exists():
            try:
                m = json.loads(mp.read_text("utf-8"))
            except json.JSONDecodeError:
                continue
            m.pop("segments", None)
            items.append(m)
    items.sort(key=lambda m: m.get("created", 0), reverse=True)
    return items[:limit]


def get_history(hid: str) -> dict:
    mp = _hist_dir() / _safe_id(hid) / "meta.json"
    if not mp.exists():
        raise KeyError(hid)
    return json.loads(mp.read_text("utf-8"))


def history_audio(hid: str) -> np.ndarray:
    p = _hist_dir() / _safe_id(hid) / "audio.wav"
    if not p.exists():
        raise KeyError(hid)
    data, _ = sf.read(p, dtype="float32")
    return data


def delete_history(hid: str) -> None:
    d = _hist_dir() / _safe_id(hid)
    if d.exists():
        shutil.rmtree(d)
