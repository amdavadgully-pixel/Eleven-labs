"""Neural TTS engine wrapper (Kokoro-82M, ONNX runtime).

Adds on top of the raw model:
  * voice blending: "af_heart*0.7+bf_emma*0.3" mixes style embeddings
  * saved custom voices ("custom:<id>")
  * inline IPA pronunciations
  * thread-safe, lazily loaded singleton
"""
from __future__ import annotations

import re
import threading

import numpy as np

from . import config
from .textproc import IPA_RE, Speech
from .voices import LANGS, describe, lang_for_voice

_TERM_RE = re.compile(r"^\s*([a-z]{2}_[a-z_]+)\s*(?:[*:]\s*([\d.]+)\s*%?)?\s*$")


class VoiceError(ValueError):
    pass


class Engine:
    def __init__(self, model_path=config.MODEL_PATH, voices_path=config.VOICES_PATH):
        self.model_path, self.voices_path = model_path, voices_path
        self._kokoro = None
        self._load_lock = threading.Lock()
        self.lock = threading.Lock()  # one inference at a time; ONNX uses all cores
        self.custom_lookup = lambda _id: None  # injected by the store

    # ------------------------------------------------------------ loading
    @property
    def kokoro(self):
        if self._kokoro is None:
            with self._load_lock:
                if self._kokoro is None:
                    if not self.model_path.exists() or not self.voices_path.exists():
                        raise RuntimeError(
                            "Model files missing. Run scripts/download_models.sh first."
                        )
                    from kokoro_onnx import Kokoro

                    self._kokoro = Kokoro(str(self.model_path), str(self.voices_path))
        return self._kokoro

    @property
    def ready(self) -> bool:
        return self.model_path.exists() and self.voices_path.exists()

    def builtin_ids(self) -> list[str]:
        ids = sorted(self.kokoro.get_voices())
        return [v for v in ids if v[:1] in LANGS]

    def builtin_catalog(self) -> list[dict]:
        cat = [describe(v) for v in self.builtin_ids()]
        return sorted(cat, key=lambda v: (-v["tier"], v["language"] != "en-us", v["name"]))

    # ------------------------------------------------------------ voices
    def parse_formula(self, formula: str) -> list[tuple[str, float]]:
        terms = []
        for part in formula.split("+"):
            m = _TERM_RE.match(part)
            if not m:
                raise VoiceError(f"Bad voice term: {part!r}")
            terms.append((m.group(1), float(m.group(2)) if m.group(2) else 1.0))
        total = sum(w for _, w in terms)
        if total <= 0:
            raise VoiceError("Voice weights must be positive")
        known = set(self.builtin_ids())
        for vid, _ in terms:
            if vid not in known:
                raise VoiceError(f"Unknown voice: {vid}")
        return [(v, w / total) for v, w in terms]

    def resolve(self, spec: str) -> tuple[np.ndarray, str, str]:
        """Return (style embedding, language, canonical formula) for a voice spec."""
        spec = (spec or "af_heart").strip()
        if spec.startswith("custom:"):
            custom = self.custom_lookup(spec.split(":", 1)[1])
            if not custom:
                raise VoiceError(f"Unknown custom voice: {spec}")
            spec = custom["formula"]
        terms = self.parse_formula(spec)
        style = sum(self.kokoro.get_voice_style(v) * w for v, w in terms)
        lead = max(terms, key=lambda t: t[1])[0]
        return style.astype(np.float32), lang_for_voice(lead), spec

    # ------------------------------------------------------------ synthesis
    def synth(self, item: Speech) -> np.ndarray:
        style, voice_lang, _ = self.resolve(item.voice)
        lang = item.lang or voice_lang
        speed = float(max(0.5, min(2.0, item.speed)))
        with self.lock:
            k = self.kokoro
            if item.ipa and IPA_RE.search(item.spoken):
                phonemes = self._phonemize_with_ipa(item.spoken, item.ipa, lang)
                audio, _ = k.create(phonemes, voice=style, speed=speed, lang=lang, is_phonemes=True)
            else:
                audio, _ = k.create(item.spoken, voice=style, speed=speed, lang=lang)
        return np.asarray(audio, dtype=np.float32)

    def _phonemize_with_ipa(self, text: str, ipa: dict[int, str], lang: str) -> str:
        out, pos = [], 0
        tok = self.kokoro.tokenizer
        for m in IPA_RE.finditer(text):
            before = text[pos : m.start()]
            if before.strip():
                out.append(tok.phonemize(before, lang))
            out.append(tok.known(ipa.get(int(m.group(1)), "")))
            pos = m.end()
        tail = text[pos:]
        if tail.strip():
            out.append(tok.phonemize(tail, lang))
        return " ".join(p for p in out if p)


engine = Engine()
