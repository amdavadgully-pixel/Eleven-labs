"""Catalog of built-in voices, with display metadata.

Voice ids follow the Kokoro convention: first letter = language/accent,
second letter = gender (f/m), then the name.
"""
from __future__ import annotations

LANGS = {
    "a": ("en-us", "English (US)", "American"),
    "b": ("en-gb", "English (UK)", "British"),
    "e": ("es", "Spanish", "Spanish"),
    "f": ("fr-fr", "French", "French"),
    "h": ("hi", "Hindi", "Indian"),
    "i": ("it", "Italian", "Italian"),
    "j": ("ja", "Japanese", "Japanese"),
    "p": ("pt-br", "Portuguese (BR)", "Brazilian"),
    "z": ("cmn", "Mandarin Chinese", "Chinese"),
}

LANGUAGE_OPTIONS = [{"code": v[0], "label": v[1]} for v in LANGS.values()]

# Hand-written character notes + a rough quality tier (higher = better) used
# to sort the library so the strongest voices come first.
NOTES: dict[str, tuple[str, int, list[str]]] = {
    "af_heart": ("Warm, expressive and natural. The flagship narrator.", 10, ["narration", "audiobook", "warm"]),
    "af_bella": ("Bright, energetic and friendly.", 9, ["commercial", "youthful", "upbeat"]),
    "af_nicole": ("Soft and breathy, close-mic intimacy.", 7, ["asmr", "calm", "whisper"]),
    "af_aoede": ("Smooth, balanced storyteller.", 6, ["narration", "smooth"]),
    "af_kore": ("Clear and confident.", 6, ["explainer", "clear"]),
    "af_sarah": ("Mature and composed.", 6, ["corporate", "e-learning"]),
    "af_alloy": ("Neutral, versatile everyday voice.", 5, ["neutral", "assistant"]),
    "af_nova": ("Crisp and modern.", 5, ["tech", "assistant"]),
    "af_sky": ("Light and airy.", 5, ["gentle", "youthful"]),
    "af_jessica": ("Casual and conversational.", 4, ["conversational"]),
    "af_river": ("Relaxed and even.", 4, ["calm"]),
    "am_michael": ("Deep, trustworthy narrator.", 8, ["narration", "documentary", "deep"]),
    "am_fenrir": ("Strong and dramatic.", 8, ["trailer", "dramatic", "deep"]),
    "am_puck": ("Playful and animated.", 7, ["characters", "playful"]),
    "am_echo": ("Steady and measured.", 5, ["corporate"]),
    "am_eric": ("Confident presenter.", 5, ["presenter", "commercial"]),
    "am_liam": ("Young and casual.", 5, ["youthful", "conversational"]),
    "am_onyx": ("Low and resonant.", 5, ["deep", "serious"]),
    "am_adam": ("Plain, direct delivery.", 4, ["neutral"]),
    "am_santa": ("Jolly, festive character voice.", 4, ["characters", "festive"]),
    "bf_emma": ("Polished British narrator.", 8, ["narration", "audiobook", "british"]),
    "bf_isabella": ("Elegant and articulate.", 6, ["elegant", "british"]),
    "bf_alice": ("Bright British voice.", 5, ["british", "friendly"]),
    "bf_lily": ("Gentle and soft-spoken.", 5, ["gentle", "british"]),
    "bm_george": ("Classic, distinguished British gentleman.", 7, ["documentary", "british", "deep"]),
    "bm_fable": ("Storybook British narrator.", 7, ["storytelling", "british"]),
    "bm_lewis": ("Warm, grounded British voice.", 6, ["british", "warm"]),
    "bm_daniel": ("Calm British newsreader.", 5, ["news", "british"]),
}

PREVIEW_TEXT = {
    "en-us": "Hi! This is my voice. I can narrate your videos, audiobooks and podcasts with natural expression.",
    "en-gb": "Hello there. This is my voice, ready to narrate your stories, documentaries and lessons.",
    "es": "Hola, esta es mi voz. Puedo narrar tus videos, audiolibros y podcasts con naturalidad.",
    "fr-fr": "Bonjour, voici ma voix. Je peux raconter vos vidéos, livres audio et podcasts.",
    "hi": "नमस्ते, यह मेरी आवाज़ है। मैं आपके वीडियो और कहानियाँ सुना सकती हूँ।",
    "it": "Ciao, questa è la mia voce. Posso narrare i tuoi video, audiolibri e podcast.",
    "ja": "こんにちは。これは私の声です。動画やオーディオブックのナレーションができます。",
    "pt-br": "Olá, esta é a minha voz. Posso narrar seus vídeos, audiolivros e podcasts.",
    "cmn": "你好，这是我的声音。我可以为你的视频、有声书和播客配音。",
}

# OpenAI-style voice names mapped to the closest built-in voice, for the
# /v1/audio/speech compatibility endpoint.
OPENAI_ALIASES = {
    "alloy": "af_alloy", "echo": "am_echo", "fable": "bm_fable", "onyx": "am_onyx",
    "nova": "af_nova", "shimmer": "af_bella", "ash": "am_michael", "coral": "af_heart",
    "sage": "af_sarah", "ballad": "bm_george", "verse": "am_puck",
}


def lang_for_voice(voice_id: str) -> str:
    return LANGS.get(voice_id[:1], LANGS["a"])[0]


def describe(voice_id: str) -> dict:
    prefix, gender = voice_id[:1], voice_id[1:2]
    lang = LANGS.get(prefix, LANGS["a"])
    raw_name = voice_id.split("_", 1)[-1]
    note, tier, tags = NOTES.get(voice_id, ("", 3, []))
    if not note:
        note = f"{lang[2]} {'female' if gender == 'f' else 'male'} voice."
    return {
        "id": voice_id,
        "name": raw_name.replace("_", " ").title(),
        "gender": "female" if gender == "f" else "male",
        "language": lang[0],
        "language_label": lang[1],
        "accent": lang[2],
        "description": note,
        "tags": tags,
        "tier": tier,
        "kind": "builtin",
    }
