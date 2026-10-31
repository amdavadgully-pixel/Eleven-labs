import numpy as np

from server import audio


def test_master_hits_target_and_ceiling():
    x = (np.sin(np.linspace(0, 2000, 24000 * 3)) * 0.05).astype(np.float32)
    y = audio.master(x, -16.0)
    assert abs(audio.loudness_lufs(y) - (-16.0)) < 1.0
    assert np.max(np.abs(y)) <= 10 ** (-1 / 20) + 1e-4


def test_captions_srt_and_vtt():
    segs = [{"start": 0.0, "end": 1.5, "text": "Hello world."}, {"start": 2.0, "end": 3.0, "text": "Bye."}]
    srt = audio.captions(segs, "srt")
    assert "00:00:00,000 --> 00:00:01,500" in srt and "Bye." in srt
    assert audio.captions(segs, "vtt").startswith("WEBVTT")


def test_encode_formats():
    x = np.zeros(2400, np.float32)
    for fmt in ("wav", "mp3", "flac", "pcm"):
        data, _ = audio.encode(x, fmt)
        assert len(data) > 0
