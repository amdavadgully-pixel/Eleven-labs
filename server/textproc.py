"""Script parsing, text normalisation and sentence splitting.

Supported markup (works in every mode):

    [pause 1.5s]  [pause 300ms]  <break time="1s"/>   -> silence
    [speed 1.2]                                        -> speed for rest of line
    [voice bf_emma]                                    -> voice for rest of line
    blank line                                         -> paragraph pause

Dialogue mode additionally treats ``Name: text`` (or ``[Name]: text``) at
the start of a line as a speaker change. Speakers are mapped to voices
through the ``cast`` dictionary.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

IPA_MARK = "⟦{}⟧"  # ⟦n⟧ placeholder for an IPA pronunciation
IPA_RE = re.compile(r"⟦(\d+)⟧")


@dataclass
class Speech:
    text: str  # what the listener reads in captions
    spoken: str  # what the engine pronounces (normalised, aliases applied)
    voice: str
    speed: float
    lang: str | None
    speaker: str | None = None
    ipa: dict[int, str] = field(default_factory=dict)
    gap_after: float = 0.0  # natural pause after this sentence (seconds)


@dataclass
class Pause:
    seconds: float


Item = Speech | Pause

# ---------------------------------------------------------------- tags
TAG_RE = re.compile(
    r"\[(?P<kind>pause|break|speed|voice)\s*(?P<arg>[^\]]*)\]"
    r"|<break\s+time\s*=\s*[\"'](?P<ssml>[\d.]+\s*(?:ms|s)?)[\"']\s*/?>",
    re.IGNORECASE,
)
SPEAKER_RE = re.compile(r"^\s*\[?(?P<name>[^\W\d_][\w .'\-]{0,40}?)\]?\s*:\s+(?P<rest>.+)$")
MAX_PAUSE = 30.0


def parse_duration(arg: str) -> float:
    m = re.match(r"\s*([\d.]+)\s*(ms|s)?\s*$", arg or "", re.IGNORECASE)
    if not m:
        return 0.5
    value = float(m.group(1))
    if (m.group(2) or "s").lower() == "ms":
        value /= 1000.0
    return max(0.0, min(MAX_PAUSE, value))


def detect_speakers(text: str) -> list[str]:
    """Speaker names in order of first appearance (for dialogue casting)."""
    seen: list[str] = []
    for line in text.splitlines():
        m = SPEAKER_RE.match(line)
        if m:
            name = m.group("name").strip()
            if name and name not in seen:
                seen.append(name)
    return seen


# ---------------------------------------------------------------- normalisation
ABBREVIATIONS = {
    "Mr.": "Mister", "Mrs.": "Missus", "Ms.": "Miz", "Dr.": "Doctor", "Prof.": "Professor",
    "St.": "Saint", "Sr.": "Senior", "Jr.": "Junior", "vs.": "versus", "etc.": "et cetera",
    "e.g.": "for example", "i.e.": "that is", "approx.": "approximately", "No.": "Number",
}
_SCALES = {"k": "thousand", "m": "million", "b": "billion", "bn": "billion", "t": "trillion"}
CURRENCY = {"$": ("dollar", "dollars", "cent", "cents"), "£": ("pound", "pounds", "penny", "pence"),
            "€": ("euro", "euros", "cent", "cents"), "₹": ("rupee", "rupees", "paisa", "paise")}
_CUR_RE = re.compile(r"([$£€₹])\s?(\d[\d,]*)(?:\.(\d{1,2}))?\s?([kKmMbBtT]n?\b)?")
_EMOJI_RE = re.compile("[\U0001F000-\U0001FAFF☀-➿️]")


def _currency(m: re.Match) -> str:
    sym, whole, frac, scale = m.group(1), m.group(2).replace(",", ""), m.group(3), m.group(4)
    one, many, sub_one, sub_many = CURRENCY[sym]
    if scale:
        num = whole + (f".{frac}" if frac else "")
        return f"{num} {_SCALES[scale.lower()]} {many}"
    out = f"{whole} {one if whole == '1' else many}"
    if frac and int(frac):
        cents = int(frac.ljust(2, "0"))
        out += f" and {cents} {sub_one if cents == 1 else sub_many}"
    return out


def normalize(text: str, lang: str | None) -> str:
    """Make written text speakable. English-specific rules only for English."""
    text = unicodedata.normalize("NFC", text)
    text = _EMOJI_RE.sub("", text)
    text = re.sub(r"(\*\*|__|`|~~)", "", text)  # markdown emphasis
    text = re.sub(r"^\s*#{1,6}\s+", "", text)  # markdown headings
    text = re.sub(r"https?://(www\.)?", "", text)
    text = text.replace("—", ", ").replace("–", " to ")
    if lang is None or lang.startswith("en"):
        for k, v in ABBREVIATIONS.items():
            text = re.sub(r"(?<!\w)" + re.escape(k), v, text)
        text = _CUR_RE.sub(_currency, text)
        text = re.sub(r"(\d)\s?%", r"\1 percent", text)
        text = re.sub(r"\s&\s", " and ", text)
        text = re.sub(r"(\w)@(\w)", r"\1 at \2", text)
        text = re.sub(r"(\w)\.(com|org|net|io|ai|dev|co)\b", r"\1 dot \2", text)
        text = re.sub(r"(\d{1,2}):(\d{2})\s?([ap])\.?m\.?\b",
                      lambda m: f"{int(m.group(1))} {m.group(2) if m.group(2) != '00' else ''} {m.group(3).upper()} M",
                      text, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", text).strip()


# ---------------------------------------------------------------- pronunciation
def apply_pronunciations(text: str, rules: list[dict]) -> tuple[str, dict[int, str]]:
    """Apply alias/IPA rules. IPA terms become ⟦n⟧ placeholders."""
    ipa: dict[int, str] = {}
    for rule in rules or []:
        term = (rule.get("term") or "").strip()
        repl = (rule.get("replacement") or "").strip()
        if not term or not repl:
            continue
        flags = 0 if rule.get("case_sensitive") else re.IGNORECASE
        pattern = re.compile(r"(?<!\w)" + re.escape(term) + r"(?!\w)", flags)
        if rule.get("type") == "ipa":
            idx = len(ipa)
            new = pattern.sub(IPA_MARK.format(idx), text)
            if new != text:
                ipa[idx] = repl.strip("/[] ")
                text = new
        else:
            text = pattern.sub(repl, text)
    return text, ipa


# ---------------------------------------------------------------- sentences
_ABBR_PROTECT = re.compile(r"\b(Mr|Mrs|Ms|Dr|Prof|St|Sr|Jr|vs|etc|e\.g|i\.e|No|approx)\.", re.IGNORECASE)
_SENT_SPLIT = re.compile(r"(?<=[.!?…])[\"'”’)\]]*\s+(?=[\"'“‘(\[]?[A-Z0-9À-ɏЀ-ӿ])"
                         r"|(?<=[。！？।])")
MAX_SENTENCE = 380


def split_sentences(text: str) -> list[str]:
    protected = _ABBR_PROTECT.sub(lambda m: m.group(0)[:-1] + "․", text)
    parts = [p.strip().replace("․", ".") for p in _SENT_SPLIT.split(protected)]
    out: list[str] = []
    for p in parts:
        if not p:
            continue
        while len(p) > MAX_SENTENCE:  # break very long sentences at clauses
            cut = max(p.rfind(c, 0, MAX_SENTENCE) for c in (";", ",", ":", " "))
            cut = cut if cut > 40 else MAX_SENTENCE
            out.append(p[: cut + 1].strip())
            p = p[cut + 1 :].strip()
        if p:
            out.append(p)
    return out


def natural_gap(sentence: str) -> float:
    end = sentence.rstrip("\"'”’)] ")[-1:] if sentence.strip() else ""
    return {"?": 0.38, "!": 0.34, ".": 0.32, "…": 0.5, ":": 0.3, ";": 0.25, ",": 0.15}.get(end, 0.28)


# ---------------------------------------------------------------- parse
def parse_script(
    text: str,
    voice: str,
    speed: float = 1.0,
    lang: str | None = None,
    dialogue: bool = False,
    cast: dict[str, str] | None = None,
    pronunciations: list[dict] | None = None,
    paragraph_pause: float = 0.75,
    pacing: float = 1.0,
) -> list[Item]:
    cast = {k.strip().lower(): v for k, v in (cast or {}).items()}
    items: list[Item] = []
    current_speaker_voice = voice
    current_speaker: str | None = None
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")

    for raw in lines:
        line = raw.strip()
        if not line:
            if items and isinstance(items[-1], Speech):
                items[-1].gap_after = max(items[-1].gap_after, paragraph_pause)
            continue

        if dialogue:
            m = SPEAKER_RE.match(line)
            if m and not TAG_RE.match(line):
                current_speaker = m.group("name").strip()
                current_speaker_voice = cast.get(current_speaker.lower(), voice)
                line = m.group("rest").strip()
                if items and isinstance(items[-1], Speech):  # turn-taking breath
                    items[-1].gap_after = max(items[-1].gap_after, 0.45 * pacing)

        line_voice, line_speed = current_speaker_voice, speed
        pos = 0
        for m in list(TAG_RE.finditer(line)) + [None]:
            chunk = line[pos : m.start()] if m else line[pos:]
            _emit(items, chunk, line_voice, line_speed, lang, current_speaker, pronunciations, pacing)
            if m is None:
                break
            pos = m.end()
            kind = (m.group("kind") or "pause").lower()
            arg = m.group("ssml") or m.group("arg") or ""
            if kind in ("pause", "break"):
                items.append(Pause(parse_duration(arg)))
            elif kind == "speed":
                try:
                    line_speed = max(0.5, min(2.0, float(arg)))
                except ValueError:
                    pass
            elif kind == "voice" and arg.strip():
                line_voice = arg.strip()

        # end of a line = small paragraph-ish gap (single newline)
        if items and isinstance(items[-1], Speech):
            items[-1].gap_after = max(items[-1].gap_after, 0.45 * pacing)

    if items and isinstance(items[-1], Speech):
        items[-1].gap_after = 0.0
    return items


def _guess_lang(voice: str) -> str | None:
    from .voices import LANGS
    m = re.match(r"^([a-z])[fm]_", voice or "")
    return LANGS[m.group(1)][0] if m and m.group(1) in LANGS else None


def _emit(items, chunk, voice, speed, lang, speaker, pronunciations, pacing):
    chunk = chunk.strip()
    if not chunk:
        return
    for sent in split_sentences(chunk):
        if not re.search(r"\w", sent):
            continue
        spoken, ipa = apply_pronunciations(sent, pronunciations or [])
        spoken = normalize(spoken, lang or _guess_lang(voice))
        if not spoken:
            continue
        items.append(Speech(text=sent, spoken=spoken, voice=voice, speed=speed, lang=lang,
                            speaker=speaker, ipa=ipa, gap_after=natural_gap(sent) * pacing))
