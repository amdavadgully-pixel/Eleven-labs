"""HTTP API + static web UI."""
from __future__ import annotations

import hashlib
import re
from dataclasses import fields

import numpy as np

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import __version__, audio, config, store
from .engine import VoiceError, engine
from .pipeline import RenderRequest, cache, jobs, plan, render
from .textproc import Speech, detect_speakers
from .voices import LANGUAGE_OPTIONS, OPENAI_ALIASES, PREVIEW_TEXT, lang_for_voice

app = FastAPI(title="VoiceForge", version=__version__)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(VoiceError)
async def _voice_err(_, exc):
    return JSONResponse({"detail": str(exc)}, status_code=400)


@app.exception_handler(ValueError)
async def _value_err(_, exc):
    return JSONResponse({"detail": str(exc)}, status_code=400)


def require_key(xi_api_key: str | None = Header(None), authorization: str | None = Header(None)):
    if not config.API_KEY:
        return
    bearer = (authorization or "").removeprefix("Bearer ").strip()
    if config.API_KEY not in (xi_api_key, bearer):
        raise HTTPException(401, "Invalid API key")


# ================================================================ app API
class GenerateBody(BaseModel):
    text: str
    voice: str = "af_heart"
    speed: float = Field(1.0, ge=0.5, le=2.0)
    language: str | None = None
    mode: str = "tts"
    cast: dict[str, str] = {}
    use_pronunciations: bool = True
    paragraph_pause: float = Field(0.75, ge=0, le=5)
    pacing: float = Field(1.0, ge=0, le=3)
    target_lufs: float | None = -16.0
    polish: bool = True
    save: bool = True
    title: str | None = None

    def to_req(self) -> RenderRequest:
        names = {f.name for f in fields(RenderRequest)}
        return RenderRequest(**{k: v for k, v in self.model_dump().items() if k in names})


@app.get("/api/health")
def health():
    return {"ok": True, "version": __version__, "model_ready": engine.ready,
            "cache": {"items": len(cache.data), "hits": cache.hits, "misses": cache.misses}}


@app.get("/api/voices")
def voices():
    return {"builtin": engine.builtin_catalog(), "custom": store.custom_voices(),
            "languages": LANGUAGE_OPTIONS}


class CustomVoiceBody(BaseModel):
    id: str | None = None
    name: str
    formula: str
    description: str = ""
    speed: float = 1.0


@app.post("/api/custom-voices")
def create_custom(body: CustomVoiceBody):
    terms = engine.parse_formula(body.formula)
    formula = "+".join(f"{v}*{w:.3f}" for v, w in terms)
    lead = max(terms, key=lambda t: t[1])[0]
    return store.save_custom({**body.model_dump(), "formula": formula, "language": lang_for_voice(lead),
                              "components": [{"voice": v, "weight": round(w, 3)} for v, w in terms]})


@app.delete("/api/custom-voices/{vid}")
def delete_custom(vid: str):
    if not store.delete_custom(vid):
        raise HTTPException(404, "Not found")
    return {"ok": True}


@app.get("/api/preview")
def preview(voice: str, text: str | None = None):
    _, lang, canon = engine.resolve(voice)
    sample = (text or PREVIEW_TEXT.get(lang, PREVIEW_TEXT["en-us"]))[:300]
    key = hashlib.sha1(f"{canon}|{sample}".encode()).hexdigest()[:16]
    pdir = config.DATA_DIR / "previews"
    pdir.mkdir(parents=True, exist_ok=True)
    path = pdir / f"{key}.mp3"
    if not path.exists():
        out, _ = render(RenderRequest(text=sample, voice=voice, use_pronunciations=False, save=False))
        data, _ = audio.encode(out, "mp3")
        path.write_bytes(data)
    return FileResponse(path, media_type="audio/mpeg", headers={"Cache-Control": "max-age=86400"})


class SpeakersBody(BaseModel):
    text: str


@app.post("/api/speakers")
def speakers(body: SpeakersBody):
    return {"speakers": detect_speakers(body.text)}


@app.post("/api/analyze")
def analyze(body: GenerateBody):
    """Dry-run: how the script will be split, voiced and paced."""
    items = plan(body.to_req())
    sp = [i for i in items if isinstance(i, Speech)]
    est = sum(len(i.spoken) / (14.5 * i.speed) + i.gap_after for i in sp)
    est += sum(getattr(i, "seconds", 0) for i in items if not isinstance(i, Speech))
    return {"sentences": len(sp), "estimated_seconds": round(est, 1),
            "voices": sorted({i.voice for i in sp}), "characters": len(body.text)}


@app.post("/api/generate")
def generate(body: GenerateBody):
    return jobs.submit(body.to_req())


@app.get("/api/jobs/{jid}")
def job(jid: str):
    j = jobs.get(jid)
    if not j:
        raise HTTPException(404, "Job not found")
    return j


@app.post("/api/tts")
def tts_sync(body: GenerateBody, format: str = "mp3"):
    out, meta = render(body.to_req())
    if body.save:
        meta = store.save_history(out, meta)
    data, mime = audio.encode(out, format)
    return Response(data, media_type=mime, headers={"X-History-Id": meta.get("id", "")})


@app.get("/api/history")
def history():
    return store.list_history()


def _hist(hid):
    try:
        return store.get_history(hid)
    except KeyError:
        raise HTTPException(404, "Not found") from None


@app.get("/api/history/{hid}")
def history_item(hid: str):
    return _hist(hid)


@app.delete("/api/history/{hid}")
def history_delete(hid: str):
    _hist(hid)
    store.delete_history(hid)
    return {"ok": True}


@app.get("/api/history/{hid}/audio")
def history_audio(hid: str, format: str = "mp3", download: bool = False):
    meta = _hist(hid)
    data, mime = audio.encode(store.history_audio(hid), format)
    ext = "ogg" if format == "opus" else format
    headers = {"Cache-Control": "max-age=3600"}
    if download:
        headers["Content-Disposition"] = f'attachment; filename="{_slug(meta["title"])}.{ext}"'
    return Response(data, media_type=mime, headers=headers)


@app.get("/api/history/{hid}/captions")
def history_captions(hid: str, format: str = "srt"):
    meta = _hist(hid)
    if format == "json":
        return meta["segments"]
    body = audio.captions(meta["segments"], "vtt" if format == "vtt" else "srt")
    return Response(body, media_type="text/vtt" if format == "vtt" else "application/x-subrip",
                    headers={"Content-Disposition": f'attachment; filename="{_slug(meta["title"])}.{format}"'})


@app.get("/api/pronunciations")
def get_pron():
    return store.pronunciations()


@app.put("/api/pronunciations")
def put_pron(rules: list[dict]):
    return store.set_pronunciations(rules)


def _slug(s: str) -> str:
    return re.sub(r"[^\w\-]+", "-", s.lower()).strip("-")[:50] or "voiceover"


# ================================================================ compatibility APIs
def _voice_lookup(voice_id: str) -> str:
    if voice_id in OPENAI_ALIASES:
        return OPENAI_ALIASES[voice_id]
    if store.get_custom(voice_id):
        return f"custom:{voice_id}"
    return voice_id


def _parse_output_format(of: str | None) -> tuple[str, int]:
    of = (of or "mp3_44100_128").lower()
    m = re.match(r"(mp3|pcm|opus|wav|flac)_(\d+)", of)
    if not m:
        return "mp3", 44100
    return m.group(1), int(m.group(2))


@app.get("/v1/models", dependencies=[Depends(require_key)])
def v1_models():
    return [{"model_id": "voiceforge_v1", "name": "VoiceForge v1 (Kokoro 82M)", "can_do_text_to_speech": True,
             "languages": [{"language_id": l["code"], "name": l["label"]} for l in LANGUAGE_OPTIONS]}]


@app.get("/v1/voices", dependencies=[Depends(require_key)])
def v1_voices():
    out = [{"voice_id": v["id"], "name": v["name"], "category": "premade", "description": v["description"],
            "labels": {"gender": v["gender"], "accent": v["accent"], "language": v["language"]},
            "preview_url": f"/api/preview?voice={v['id']}"} for v in engine.builtin_catalog()]
    out += [{"voice_id": v["id"], "name": v["name"], "category": "generated", "description": v.get("description", ""),
             "labels": {"formula": v["formula"]}, "preview_url": f"/api/preview?voice=custom:{v['id']}"}
            for v in store.custom_voices()]
    return {"voices": out}


class ELBody(BaseModel):
    text: str
    model_id: str | None = None
    language_code: str | None = None
    voice_settings: dict | None = None


def _el_req(voice_id: str, body: ELBody) -> RenderRequest:
    speed = float((body.voice_settings or {}).get("speed", 1.0))
    return RenderRequest(text=body.text, voice=_voice_lookup(voice_id), speed=speed,
                         language=body.language_code, save=False)


@app.post("/v1/text-to-speech/{voice_id}", dependencies=[Depends(require_key)])
def v1_tts(voice_id: str, body: ELBody, output_format: str | None = None):
    fmt, rate = _parse_output_format(output_format)
    out, _ = render(_el_req(voice_id, body))
    data, mime = audio.encode(out, fmt, rate)
    return Response(data, media_type=mime)


@app.post("/v1/text-to-speech/{voice_id}/stream", dependencies=[Depends(require_key)])
def v1_tts_stream(voice_id: str, body: ELBody, output_format: str | None = None):
    fmt, rate = _parse_output_format(output_format)
    req = _el_req(voice_id, body)
    items = plan(req)
    mime = audio.FORMATS.get(fmt, ("audio/mpeg",))[0]

    def gen():
        pending = []
        for it in items:
            if isinstance(it, Speech):
                wav = audio.fade(engine.synth(it))
                pending.append(wav)
                pending.append(audio.silence(it.gap_after))
            else:
                pending.append(audio.silence(it.seconds))
            if isinstance(it, Speech):
                chunk = audio.master(np.concatenate(pending), req.target_lufs, polish=True)
                pending = []
                yield audio.encode(chunk, fmt, rate)[0]

    return StreamingResponse(gen(), media_type=mime)


class OpenAIBody(BaseModel):
    input: str
    voice: str = "alloy"
    model: str | None = None
    response_format: str = "mp3"
    speed: float = 1.0


@app.post("/v1/audio/speech", dependencies=[Depends(require_key)])
def v1_openai_speech(body: OpenAIBody):
    out, _ = render(RenderRequest(text=body.input, voice=_voice_lookup(body.voice),
                                  speed=max(0.5, min(2.0, body.speed)), save=False))
    data, mime = audio.encode(out, body.response_format)
    return Response(data, media_type=mime)


# ================================================================ web UI
@app.middleware("http")
async def no_cache_html(request: Request, call_next):
    resp = await call_next(request)
    if request.url.path in ("/", "/index.html"):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


app.mount("/", StaticFiles(directory=config.WEB_DIR, html=True), name="web")
