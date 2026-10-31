"""End-to-end tests; skipped when the model files are not downloaded."""
import time

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.engine import engine

pytestmark = pytest.mark.skipif(not engine.ready, reason="model files not downloaded")
c = TestClient(app)


def _wait(job):
    for _ in range(600):
        job = c.get(f"/api/jobs/{job['id']}").json()
        if job["status"] in ("done", "error"):
            return job
        time.sleep(0.2)
    raise TimeoutError


def test_voices():
    v = c.get("/api/voices").json()
    assert len(v["builtin"]) > 40 and v["builtin"][0]["id"] == "af_heart"


def test_generate_dialogue_and_downloads():
    job = c.post("/api/generate", json={
        "text": "A: Hi there. [pause 200ms]\nB: Hello!", "mode": "dialogue",
        "cast": {"A": "af_heart", "B": "am_michael*0.5+bm_george*0.5"}}).json()
    job = _wait(job)
    assert job["status"] == "done", job
    meta = job["result"]
    assert [s["speaker"] for s in meta["segments"]] == ["A", "B"]
    assert c.get(f"/api/history/{meta['id']}/audio?format=mp3").status_code == 200
    assert "-->" in c.get(f"/api/history/{meta['id']}/captions?format=srt").text
    assert c.delete(f"/api/history/{meta['id']}").status_code == 200


def test_unknown_voice_rejected():
    r = c.post("/api/generate", json={"text": "x", "voice": "zz_nope"})
    assert r.status_code == 400


def test_compat_endpoints():
    assert c.get("/v1/voices").status_code == 200
    r = c.post("/v1/text-to-speech/bf_emma?output_format=pcm_16000", json={"text": "Hi."})
    assert r.status_code == 200 and len(r.content) > 1000
    r = c.post("/v1/audio/speech", json={"input": "Hi.", "voice": "nova", "response_format": "wav"})
    assert r.status_code == 200 and r.content[:4] == b"RIFF"


def test_custom_voice_roundtrip():
    v = c.post("/api/custom-voices", json={"name": "T", "formula": "af_heart:3+af_bella:1"}).json()
    assert v["formula"] == "af_heart*0.750+af_bella*0.250"
    r = c.post("/api/tts?format=wav", json={"text": "Test.", "voice": f"custom:{v['id']}", "save": False})
    assert r.status_code == 200
    assert c.delete(f"/api/custom-voices/{v['id']}").status_code == 200
