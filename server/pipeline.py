"""End-to-end render: script -> sentences -> neural TTS -> mastered audio."""
from __future__ import annotations

import threading
import time
import traceback
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

import numpy as np

from . import audio, config, store
from .engine import engine
from .textproc import Pause, Speech, parse_script

engine.custom_lookup = store.get_custom


@dataclass
class RenderRequest:
    text: str
    voice: str = "af_heart"
    speed: float = 1.0
    language: str | None = None
    mode: str = "tts"  # "tts" | "dialogue"
    cast: dict[str, str] = field(default_factory=dict)
    use_pronunciations: bool = True
    paragraph_pause: float = 0.75
    pacing: float = 1.0  # multiplier on natural pauses between sentences
    target_lufs: float | None = -16.0
    polish: bool = True
    save: bool = True
    title: str | None = None


class _SentenceCache:
    """LRU of rendered sentences, so editing one paragraph of a long script
    only re-synthesises what changed."""

    def __init__(self, max_items=400):
        self.max, self.data, self.lock = max_items, OrderedDict(), threading.Lock()
        self.hits = self.misses = 0

    def get(self, key):
        with self.lock:
            if key in self.data:
                self.data.move_to_end(key)
                self.hits += 1
                return self.data[key]
            self.misses += 1
            return None

    def put(self, key, value):
        with self.lock:
            self.data[key] = value
            self.data.move_to_end(key)
            while len(self.data) > self.max:
                self.data.popitem(last=False)


cache = _SentenceCache()


def plan(req: RenderRequest):
    if not req.text or not req.text.strip():
        raise ValueError("Text is empty")
    if len(req.text) > config.MAX_CHARS:
        raise ValueError(f"Text exceeds {config.MAX_CHARS} characters")
    items = parse_script(
        req.text, voice=req.voice, speed=req.speed, lang=req.language or None,
        dialogue=req.mode == "dialogue", cast=req.cast,
        pronunciations=store.pronunciations() if req.use_pronunciations else [],
        paragraph_pause=req.paragraph_pause, pacing=req.pacing,
    )
    for v in {i.voice for i in items if isinstance(i, Speech)}:
        engine.resolve(v)  # fail fast on unknown voices
    if not any(isinstance(i, Speech) for i in items):
        raise ValueError("Nothing speakable in the text")
    return items


def render(req: RenderRequest, progress=lambda done, total: None):
    items = plan(req)
    total = sum(isinstance(i, Speech) for i in items)
    chunks, segments, t, done = [], [], 0.0, 0
    t0 = time.time()
    for it in items:
        if isinstance(it, Pause):
            chunks.append(audio.silence(it.seconds))
            t += it.seconds
            continue
        key = (it.spoken, it.voice, round(it.speed, 3), it.lang, tuple(sorted(it.ipa.items())))
        wav = cache.get(key)
        if wav is None:
            wav = audio.fade(engine.synth(it))
            cache.put(key, wav)
        dur = len(wav) / audio.SR
        segments.append({"start": round(t, 3), "end": round(t + dur, 3), "text": it.text,
                         "speaker": it.speaker, "voice": it.voice})
        chunks.append(wav)
        t += dur
        if it.gap_after:
            chunks.append(audio.silence(it.gap_after))
            t += it.gap_after
        done += 1
        progress(done, total)
    out = np.concatenate(chunks) if chunks else np.zeros(0, np.float32)
    # A tiny lead-in/out so players never clip the first phoneme.
    out = np.concatenate([audio.silence(0.08), out, audio.silence(0.25)])
    segments = [{**s, "start": s["start"] + 0.08, "end": s["end"] + 0.08} for s in segments]
    out = audio.master(out, req.target_lufs, polish=req.polish)
    elapsed = time.time() - t0
    meta = {
        "title": req.title or _title(req.text), "text": req.text, "voice": req.voice,
        "mode": req.mode, "cast": req.cast, "speed": req.speed, "language": req.language,
        "duration": round(len(out) / audio.SR, 2), "characters": len(req.text),
        "sentences": total, "render_seconds": round(elapsed, 2), "segments": segments,
    }
    return out, meta


def _title(text: str) -> str:
    first = " ".join(text.strip().split())[:60]
    return first + ("…" if len(text.strip()) > 60 else "")


# ---------------------------------------------------------------- jobs
class Jobs:
    def __init__(self):
        self.pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="render")
        self.jobs: dict[str, dict] = {}
        self.lock = threading.Lock()

    def submit(self, req: RenderRequest) -> dict:
        plan(req)  # validate synchronously so errors surface immediately
        jid = store.new_id()
        job = {"id": jid, "status": "queued", "done": 0, "total": 0, "created": time.time()}
        with self.lock:
            self.jobs[jid] = job
            self._gc()
        self.pool.submit(self._run, jid, req)
        return job

    def _run(self, jid: str, req: RenderRequest):
        job = self.jobs[jid]
        job["status"] = "running"

        def progress(done, total):
            job["done"], job["total"] = done, total

        try:
            out, meta = render(req, progress)
            if req.save:
                meta = store.save_history(out, meta)
            job.update(status="done", result=meta)
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            job.update(status="error", error=str(e))

    def get(self, jid: str) -> dict | None:
        return self.jobs.get(jid)

    def _gc(self):
        cutoff = time.time() - 3600
        for k in [k for k, j in self.jobs.items() if j["created"] < cutoff]:
            del self.jobs[k]


jobs = Jobs()
