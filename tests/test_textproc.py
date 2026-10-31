from server.textproc import (Pause, Speech, apply_pronunciations, detect_speakers, normalize,
                             parse_duration, parse_script, split_sentences)


def test_split_sentences_keeps_abbreviations():
    s = split_sentences("Dr. Smith arrived. He said hi! Did Mr. Jones? Yes.")
    assert s == ["Dr. Smith arrived.", "He said hi!", "Did Mr. Jones?", "Yes."]


def test_split_long_sentence():
    s = split_sentences(("word, " * 120).strip())
    assert len(s) > 1 and all(len(x) <= 381 for x in s)


def test_normalize_english():
    assert normalize("$12.50", "en-us") == "12 dollars and 50 cents"
    assert normalize("20% off", "en-us") == "20 percent off"
    assert normalize("$3M raise", "en-us") == "3 million dollars raise"
    assert "Doctor" in normalize("Dr. Who", "en-us")
    assert normalize("$12.50", "es") == "$12.50"  # non-English untouched


def test_durations():
    assert parse_duration("1.5s") == 1.5
    assert parse_duration("300ms") == 0.3
    assert parse_duration("999") == 30.0


def test_tags_and_pauses():
    items = parse_script('Hello. [pause 2s] World <break time="500ms"/> again.', voice="af_heart")
    kinds = [type(i).__name__ for i in items]
    assert kinds == ["Speech", "Pause", "Speech", "Pause", "Speech"]
    assert items[1].seconds == 2 and items[3].seconds == 0.5


def test_inline_voice_and_speed_scope_is_line():
    items = parse_script("A one. [voice bf_emma] [speed 1.3] B two.\nC three.", voice="af_heart")
    sp = [i for i in items if isinstance(i, Speech)]
    assert [(i.voice, i.speed) for i in sp] == [("af_heart", 1.0), ("bf_emma", 1.3), ("af_heart", 1.0)]


def test_dialogue_cast():
    text = "Host: Hi there.\nGuest: Hello!\nHost: Welcome."
    assert detect_speakers(text) == ["Host", "Guest"]
    items = parse_script(text, voice="af_heart", dialogue=True, cast={"host": "am_michael", "Guest": "bf_emma"})
    assert [(i.speaker, i.voice) for i in items] == [("Host", "am_michael"), ("Guest", "bf_emma"), ("Host", "am_michael")]


def test_speaker_prefix_is_text_in_tts_mode():
    items = parse_script("Note: this is spoken.", voice="af_heart")
    assert items[0].text.startswith("Note:")


def test_paragraph_pause_and_trailing_gap():
    items = parse_script("One.\n\nTwo.", voice="af_heart", paragraph_pause=1.2)
    assert items[0].gap_after == 1.2 and items[-1].gap_after == 0.0


def test_pronunciations():
    text, ipa = apply_pronunciations("Use SQL and kokoro", [
        {"term": "SQL", "replacement": "sequel", "type": "alias"},
        {"term": "Kokoro", "replacement": "/kˈOkəɹO/", "type": "ipa"},
    ])
    assert text == "Use sequel and ⟦0⟧" and ipa == {0: "kˈOkəɹO"}


def test_case_sensitive_rule():
    text, _ = apply_pronunciations("US us", [{"term": "US", "replacement": "U.S.", "case_sensitive": True}])
    assert text == "U.S. us"
