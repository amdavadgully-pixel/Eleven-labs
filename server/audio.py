"""Audio assembly, mastering and export."""
from __future__ import annotations

import io
import shutil
import subprocess

import numpy as np
import soundfile as sf

SR = 24000

FORMATS = {
    "mp3": ("audio/mpeg", ["-c:a", "libmp3lame", "-b:a", "192k"]),
    "wav": ("audio/wav", None),
    "flac": ("audio/flac", None),
    "ogg": ("audio/ogg", ["-c:a", "libopus", "-b:a", "96k"]),
    "opus": ("audio/ogg", ["-c:a", "libopus", "-b:a", "96k"]),
    "aac": ("audio/aac", ["-c:a", "aac", "-b:a", "160k", "-f", "adts"]),
    "pcm": ("audio/pcm", None),
}


def fade(x: np.ndarray, ms: float = 6.0) -> np.ndarray:
    n = min(len(x) // 2, int(SR * ms / 1000))
    if n > 1:
        x = x.copy()
        ramp = np.linspace(0.0, 1.0, n, dtype=np.float32)
        x[:n] *= ramp
        x[-n:] *= ramp[::-1]
    return x


def silence(seconds: float) -> np.ndarray:
    return np.zeros(int(max(0.0, seconds) * SR), dtype=np.float32)


def loudness_lufs(x: np.ndarray) -> float:
    try:
        import pyloudnorm as pyln

        if len(x) < SR * 0.5:
            x = np.pad(x, (0, int(SR * 0.5) - len(x)))
        return float(pyln.Meter(SR).integrated_loudness(x.astype(np.float64)))
    except Exception:  # fall back to RMS approximation
        rms = np.sqrt(np.mean(np.square(x)) + 1e-12)
        return 20 * np.log10(rms) - 0.7


def master(x: np.ndarray, target_lufs: float | None = -16.0, ceiling_db: float = -1.0,
           polish: bool = True) -> np.ndarray:
    """Broadcast-style finishing: DC removal, gentle compression, loudness
    normalisation to a LUFS target, and a soft peak limiter."""
    if len(x) == 0:
        return x
    x = x.astype(np.float32) - float(np.mean(x))
    if polish:
        x = _compress(x)
    if target_lufs is not None:
        lufs = loudness_lufs(x)
        if np.isfinite(lufs):
            x = x * np.float32(10 ** ((target_lufs - lufs) / 20))
    ceiling = 10 ** (ceiling_db / 20)
    peak = float(np.max(np.abs(x)) + 1e-9)
    if peak > ceiling:  # soft knee limiter via tanh above 70% of ceiling
        knee = 0.7 * ceiling
        over = np.abs(x) > knee
        sign = np.sign(x[over])
        mag = np.abs(x[over]) - knee
        x[over] = sign * (knee + (ceiling - knee) * np.tanh(mag / (ceiling - knee)))
    return x.astype(np.float32)


def _compress(x: np.ndarray, threshold_db=-20.0, ratio=2.5, win_ms=15.0) -> np.ndarray:
    """Envelope-follower compressor that evens out loud/soft sentences."""
    win = max(1, int(SR * win_ms / 1000))
    env = np.sqrt(_moving_avg(np.square(x), win) + 1e-10)
    env_db = 20 * np.log10(env)
    over = np.maximum(0.0, env_db - threshold_db)
    gain_db = -over * (1 - 1 / ratio)
    # smooth the gain so it never pumps
    sm = max(1, int(SR * 0.05))
    gain_db = _moving_avg(gain_db, sm)
    return (x * (10 ** (gain_db / 20))).astype(np.float32)


def _moving_avg(x: np.ndarray, n: int) -> np.ndarray:
    """Centered moving average in O(len(x)) via cumulative sums."""
    if n <= 1 or len(x) == 0:
        return x
    c = np.concatenate([[0.0], np.cumsum(x, dtype=np.float64)])
    half = n // 2
    idx = np.arange(len(x))
    lo, hi = np.clip(idx - half, 0, len(x)), np.clip(idx - half + n, 0, len(x))
    return ((c[hi] - c[lo]) / np.maximum(hi - lo, 1)).astype(np.float32)


def encode(x: np.ndarray, fmt: str = "mp3", sample_rate: int = SR) -> tuple[bytes, str]:
    fmt = fmt.lower()
    if fmt not in FORMATS:
        raise ValueError(f"Unsupported format: {fmt}")
    mime, ff = FORMATS[fmt]
    x = np.clip(x, -1.0, 1.0)
    if sample_rate != SR:
        x = resample(x, sample_rate)
    if fmt == "pcm":
        return (x * 32767).astype("<i2").tobytes(), mime
    if ff is None:
        buf = io.BytesIO()
        sf.write(buf, x, sample_rate, format=fmt.upper(), subtype="PCM_16")
        return buf.getvalue(), mime
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg is required for compressed formats")
    wav = io.BytesIO()
    sf.write(wav, x, sample_rate, format="WAV", subtype="PCM_16")
    out_fmt = [] if "-f" in ff else ["-f", "mp3" if fmt == "mp3" else "ogg"]
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0", *ff, *out_fmt, "pipe:1"],
        input=wav.getvalue(), capture_output=True, check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode(errors="replace")[:500])
    return proc.stdout, mime


def resample(x: np.ndarray, rate: int) -> np.ndarray:
    if rate == SR:
        return x
    try:
        from scipy.signal import resample_poly
        from math import gcd

        g = gcd(rate, SR)
        return resample_poly(x, rate // g, SR // g).astype(np.float32)
    except ImportError:
        n = int(len(x) * rate / SR)
        return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)


# ---------------------------------------------------------------- captions
def _ts(t: float, sep: str) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"


def captions(segments: list[dict], fmt: str = "srt", max_chars: int = 84) -> str:
    """Build SRT/VTT from sentence segments; long sentences are split into
    readable cues with word-proportional timing."""
    cues = []
    for seg in segments:
        words = seg["text"].split()
        if not words:
            continue
        lines, cur = [], []
        for w in words:
            if cur and len(" ".join(cur + [w])) > max_chars:
                lines.append(cur)
                cur = []
            cur.append(w)
        lines.append(cur)
        total = sum(len(w) + 1 for w in words)
        t, dur = seg["start"], seg["end"] - seg["start"]
        for ln in lines:
            share = sum(len(w) + 1 for w in ln) / total
            cues.append((t, t + dur * share, " ".join(ln)))
            t += dur * share
    if fmt == "vtt":
        body = "\n".join(f"{_ts(a, '.')} --> {_ts(b, '.')}\n{txt}\n" for a, b, txt in cues)
        return "WEBVTT\n\n" + body
    return "\n".join(f"{i}\n{_ts(a, ',')} --> {_ts(b, ',')}\n{txt}\n" for i, (a, b, txt) in enumerate(cues, 1))
