/* VoiceForge Studio front-end (no build step). */
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem("vf:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("vf:" + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtTime = (s) => { s = Math.max(0, s || 0); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`; };

  async function api(path, opts = {}) {
    const init = { ...opts };
    if (opts.json !== undefined) { init.method = init.method || "POST"; init.headers = { "Content-Type": "application/json" }; init.body = JSON.stringify(opts.json); }
    const r = await fetch(path, init);
    if (!r.ok) {
      let msg = r.statusText;
      try { const j = await r.json(); msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); } catch { /* not json */ }
      throw new Error(msg);
    }
    return r.headers.get("content-type")?.includes("json") ? r.json() : r;
  }

  let toastTimer;
  function toast(msg, err = false) {
    const t = $("#toast");
    t.textContent = msg; t.className = "toast" + (err ? " err" : "");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), err ? 5000 : 2600);
  }

  // ------------------------------------------------------------ theme + nav
  const root = document.documentElement;
  const savedTheme = store.get("theme", null);
  if (savedTheme) root.dataset.theme = savedTheme;
  $("#themeBtn").onclick = () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark"; store.set("theme", root.dataset.theme); drawWave();
  };
  $("#menuBtn").onclick = () => $("#sidebar").classList.toggle("open");

  const TITLES = { tts: "Text to Speech", dialogue: "Dialogue Studio", library: "Voice Library", lab: "Voice Lab", pron: "Pronunciation", history: "History", api: "API" };
  function show(view) {
    $$("nav a").forEach((a) => a.classList.toggle("active", a.dataset.view === view));
    const target = view === "dialogue" ? "tts" : view;
    $$(".view").forEach((v) => v.classList.toggle("hidden", v.id !== "view-" + target));
    $("#viewTitle").textContent = TITLES[view];
    if (view === "dialogue") setMode("dialogue");
    if (view === "tts") setMode("tts");
    if (view === "history") loadHistory();
    if (view === "pron") loadPron();
    if (view === "lab") renderCustom();
    $("#sidebar").classList.remove("open");
    if (location.hash.slice(1) !== view) history.replaceState(null, "", "#" + view);
  }
  $$("nav a").forEach((a) => (a.onclick = () => show(a.dataset.view)));

  // ------------------------------------------------------------ voices
  let VOICES = { builtin: [], custom: [], languages: [] };
  const byId = (id) => {
    if (id?.startsWith("custom:")) { const c = VOICES.custom.find((v) => v.id === id.slice(7)); return c && { ...c, id, language_label: "Custom" }; }
    return VOICES.builtin.find((v) => v.id === id);
  };
  const voiceLabel = (id) => byId(id)?.name || id;

  function fillVoiceSelect(sel, value, { allowBlend = true } = {}) {
    const groups = {};
    VOICES.builtin.forEach((v) => (groups[v.language_label] ||= []).push(v));
    let html = "";
    if (VOICES.custom.length) html += `<optgroup label="My voices">${VOICES.custom.map((v) => `<option value="custom:${esc(v.id)}">${esc(v.name)} · blend</option>`).join("")}</optgroup>`;
    for (const [g, vs] of Object.entries(groups)) {
      html += `<optgroup label="${esc(g)}">${vs.map((v) => `<option value="${v.id}">${esc(v.name)} — ${v.gender === "female" ? "F" : "M"}${v.tier >= 7 ? " ★" : ""} · ${esc(v.description)}</option>`).join("")}</optgroup>`;
    }
    if (allowBlend && value && !byId(value)) html = `<option value="${esc(value)}">Blend: ${esc(value)}</option>` + html;
    sel.innerHTML = html;
    if (value) sel.value = value;
    if (!sel.value && sel.options.length) sel.selectedIndex = 0;
  }

  async function loadVoices() {
    VOICES = await api("/api/voices");
    fillVoiceSelect($("#voice"), store.get("voice", "af_heart"));
    $("#language").innerHTML = `<option value="">Auto-detect from voice</option>` + VOICES.languages.map((l) => `<option value="${l.code}">${esc(l.label)}</option>`).join("");
    $("#language").value = store.get("language", "");
    $("#libLang").innerHTML = `<option value="">All languages</option>` + VOICES.languages.map((l) => `<option value="${l.code}">${esc(l.label)}</option>`).join("");
    updateVoiceDesc(); renderLibrary(); renderCast(); renderMix();
  }
  function updateVoiceDesc() {
    const v = byId($("#voice").value);
    $("#voiceDesc").textContent = v ? `${v.accent || "Custom"} · ${v.description || v.formula || ""}` : "";
  }

  let previewAudio = new Audio();
  function preview(voice, text, btn) {
    previewAudio.pause();
    const url = `/api/preview?voice=${encodeURIComponent(voice)}` + (text ? `&text=${encodeURIComponent(text)}` : "");
    if (btn) { btn.disabled = true; btn.dataset.l = btn.textContent; btn.textContent = "…"; }
    previewAudio = new Audio(url);
    const done = () => { if (btn) { btn.disabled = false; btn.textContent = btn.dataset.l; } };
    previewAudio.oncanplay = done;
    previewAudio.onerror = () => { done(); toast("Preview failed", true); };
    previewAudio.play().catch(done);
  }
  $("#previewVoice").onclick = (e) => preview($("#voice").value, null, e.currentTarget);
  $("#voice").onchange = () => { store.set("voice", $("#voice").value); updateVoiceDesc(); };

  // ------------------------------------------------------------ editor
  const text = $("#text");
  text.value = store.get("text", "");
  const SAMPLES = {
    tts: `Welcome to VoiceForge, a studio-grade voice generator that runs entirely on your own machine.

Type anything, and it speaks with natural rhythm and expression. Need a dramatic beat? [pause 1s] Just add a pause.

You can even switch speakers mid-script. [voice bm_george] Good evening. I'll be taking it from here.`,
    dialogue: `Host: Welcome back to the show! Today we're talking about the future of synthetic voices.
Guest: Thanks for having me. Honestly, it's a wild time to be working in audio.
Host: So what changed? [pause 400ms] Why does it suddenly sound so real?
Guest: Better models, better data, and a lot more care about rhythm and breathing.
Narrator: [speed 0.95] And with that, the conversation was just getting started.`,
  };
  let mode = "tts";
  function setMode(m) {
    mode = m;
    $$(".mode-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
    $("#castPanel").classList.toggle("hidden", m !== "dialogue");
    $("#viewTitle").textContent = m === "dialogue" ? TITLES.dialogue : TITLES.tts;
    $$("nav a").forEach((a) => a.classList.toggle("active", a.dataset.view === (m === "dialogue" ? "dialogue" : "tts")));
    renderCast();
  }
  $$(".mode-tabs button").forEach((b) => (b.onclick = () => show(b.dataset.mode === "dialogue" ? "dialogue" : "tts")));

  function updateCount() {
    const n = text.value.length;
    $("#charCount").textContent = `${n.toLocaleString()} characters`;
    const speed = +$("#speed").value;
    const est = text.value.replace(/\[[^\]]*\]|<[^>]+>/g, "").length / (14.5 * speed);
    $("#estimate").textContent = n ? `≈ ${fmtTime(est)} of audio` : "";
  }
  let saveT;
  text.addEventListener("input", () => { updateCount(); clearTimeout(saveT); saveT = setTimeout(() => { store.set("text", text.value); if (mode === "dialogue") renderCast(); }, 300); });
  $$("[data-insert]").forEach((b) => (b.onclick = () => insertAtCursor(b.dataset.insert)));
  function insertAtCursor(s) {
    const { selectionStart: a, selectionEnd: z, value } = text;
    const pad = a > 0 && !/\s$/.test(value.slice(0, a)) ? " " : "";
    text.value = value.slice(0, a) + pad + s + " " + value.slice(z);
    text.focus(); text.selectionStart = text.selectionEnd = a + pad.length + s.length + 1;
    text.dispatchEvent(new Event("input"));
  }
  $("#sampleBtn").onclick = () => { text.value = SAMPLES[mode]; text.dispatchEvent(new Event("input")); renderCast(); };
  $("#clearBtn").onclick = () => { text.value = ""; text.dispatchEvent(new Event("input")); text.focus(); };
  $("#importFile").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    let s = await f.text();
    if (/\.srt$/i.test(f.name)) s = s.replace(/^\d+\s*$|^[\d:,]+ --> [\d:,]+\s*$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
    text.value = s; text.dispatchEvent(new Event("input")); e.target.value = "";
  };

  // sliders
  const sliders = [["speed", "speedOut", (v) => (+v).toFixed(2) + "×"], ["pacing", "pacingOut", (v) => (+v).toFixed(2) + "×"], ["para", "paraOut", (v) => (+v).toFixed(2) + " s"]];
  for (const [id, out, f] of sliders) {
    const el = $("#" + id);
    el.value = store.get(id, el.value);
    const upd = () => { $("#" + out).textContent = f(el.value); store.set(id, el.value); updateCount(); };
    el.oninput = upd; upd();
  }
  for (const id of ["lufs", "language"]) $("#" + id).addEventListener("change", (e) => store.set(id, e.target.value));
  $("#lufs").value = store.get("lufs", "-16");
  for (const id of ["polish", "usePron"]) { const el = $("#" + id); el.checked = store.get(id, true); el.onchange = () => store.set(id, el.checked); }

  // ------------------------------------------------------------ cast
  const PALETTE = ["#6d5dfc", "#ff6aa2", "#10a37f", "#f5a524", "#0ea5e9", "#a855f7", "#ef4444", "#14b8a6"];
  const DEFAULT_CAST = ["af_heart", "am_michael", "bf_emma", "am_fenrir", "af_bella", "bm_george", "am_puck", "af_nicole"];
  let cast = store.get("cast", {});
  const SPEAKER_RE = /^\s*\[?(\p{L}[\p{L}\p{N} .'\-]{0,40}?)\]?\s*:\s+\S/u;
  function speakers() {
    const out = [];
    for (const line of text.value.split("\n")) { const m = line.match(SPEAKER_RE); if (m && !/^\s*\[(pause|speed|voice|break)/i.test(line) && !out.includes(m[1].trim())) out.push(m[1].trim()); }
    return out;
  }
  function renderCast() {
    if (mode !== "dialogue" || !VOICES.builtin.length) return;
    const sp = speakers();
    const list = $("#castList");
    if (!sp.length) { list.innerHTML = `<div class="muted small">No speakers yet. Try: <code>Alice: Hello there!</code></div>`; return; }
    list.innerHTML = "";
    sp.forEach((name, i) => {
      if (!cast[name]) cast[name] = DEFAULT_CAST[i % DEFAULT_CAST.length];
      const row = document.createElement("div");
      row.className = "cast-row";
      row.innerHTML = `<div class="name" style="--c:${PALETTE[i % PALETTE.length]}" title="${esc(name)}">${esc(name)}</div><select></select><button class="ghost icon" title="Preview">▶</button>`;
      const sel = $("select", row);
      fillVoiceSelect(sel, cast[name]);
      sel.onchange = () => { cast[name] = sel.value; store.set("cast", cast); };
      $("button", row).onclick = (e) => preview(sel.value, null, e.currentTarget);
      list.appendChild(row);
    });
    store.set("cast", cast);
  }

  // ------------------------------------------------------------ generate
  function payload() {
    const lufs = $("#lufs").value;
    const c = {};
    if (mode === "dialogue") speakers().forEach((s) => (c[s] = cast[s] || "af_heart"));
    return {
      text: text.value, voice: $("#voice").value, speed: +$("#speed").value, language: $("#language").value || null,
      mode, cast: c, pacing: +$("#pacing").value, paragraph_pause: +$("#para").value,
      target_lufs: lufs === "" ? null : +lufs, polish: $("#polish").checked, use_pronunciations: $("#usePron").checked,
    };
  }
  let busy = false;
  async function generate() {
    if (busy) return;
    if (!text.value.trim()) { toast("Type some text first", true); text.focus(); return; }
    busy = true;
    const btn = $("#generateBtn"); btn.disabled = true; btn.firstChild.textContent = "Generating… ";
    const prog = $("#progress"); prog.classList.remove("hidden"); $("#progressBar").style.width = "3%"; $("#progressText").textContent = "Preparing…";
    const t0 = performance.now();
    try {
      let job = await api("/api/generate", { json: payload() });
      while (job.status === "queued" || job.status === "running") {
        await new Promise((r) => setTimeout(r, 350));
        job = await api("/api/jobs/" + job.id);
        if (job.total) {
          $("#progressBar").style.width = Math.max(3, (100 * job.done) / job.total) + "%";
          $("#progressText").textContent = `Sentence ${job.done} of ${job.total}`;
        }
      }
      if (job.status === "error") throw new Error(job.error);
      $("#progressBar").style.width = "100%";
      await loadResult(job.result, true);
      toast(`Generated ${fmtTime(job.result.duration)} of audio in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
    } catch (e) {
      toast(e.message || String(e), true);
    } finally {
      busy = false; btn.disabled = false; btn.firstChild.textContent = "Generate speech ";
      setTimeout(() => prog.classList.add("hidden"), 600);
    }
  }
  $("#generateBtn").onclick = generate;
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); generate(); }
    if (e.key === " " && e.target === document.body && current) { e.preventDefault(); togglePlay(); }
  });

  // ------------------------------------------------------------ player
  const audio = $("#audio");
  const canvas = $("#wave");
  let current = null, peaks = null, activeSeg = -1;
  async function loadResult(meta, autoplay = false) {
    if (!meta.segments) meta = await api("/api/history/" + meta.id);
    current = meta;
    $("#player").classList.remove("hidden");
    $("#pTitle").textContent = meta.title;
    const voices = meta.mode === "dialogue" ? Object.values(meta.cast || {}).map(voiceLabel).join(", ") : voiceLabel(meta.voice);
    $("#pMeta").textContent = `${voices} · ${fmtTime(meta.duration)} · ${meta.characters?.toLocaleString()} chars · rendered in ${meta.render_seconds}s`;
    const resp = await fetch(`/api/history/${meta.id}/audio?format=wav`);
    const buf = await resp.arrayBuffer();
    audio.src = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      peaks = decoded.getChannelData(0); ctx.close();
    } catch { peaks = null; }
    $("#tDur").textContent = fmtTime(meta.duration);
    renderTranscript(); drawWave();
    if (autoplay) audio.play().catch(() => {});
  }
  function renderTranscript() {
    const tr = $("#transcript"); tr.innerHTML = "";
    let last = null;
    const spkColor = {};
    current.segments.forEach((s, i) => {
      if (current.mode === "dialogue" && s.speaker && s.speaker !== last) {
        if (last !== null) tr.appendChild(document.createElement("br"));
        spkColor[s.speaker] ||= PALETTE[Object.keys(spkColor).length % PALETTE.length];
        const b = document.createElement("span"); b.className = "spk"; b.style.color = spkColor[s.speaker]; b.textContent = s.speaker + ":";
        tr.appendChild(b);
      }
      last = s.speaker;
      const el = document.createElement("span"); el.textContent = s.text + " "; el.dataset.i = i;
      el.onclick = () => { audio.currentTime = s.start; audio.play(); };
      tr.appendChild(el);
    });
  }
  function togglePlay() { audio.paused ? audio.play() : audio.pause(); }
  $("#playBtn").onclick = togglePlay;
  audio.onplay = () => { $("#playBtn").textContent = "❚❚"; tick(); };
  audio.onpause = audio.onended = () => { $("#playBtn").textContent = "▶"; drawWave(); };
  function tick() {
    drawWave();
    $("#tCur").textContent = fmtTime(audio.currentTime);
    if (current) {
      const t = audio.currentTime;
      const i = current.segments.findIndex((s) => t >= s.start && t < s.end + 0.3);
      if (i !== activeSeg) {
        $$("#transcript span.on").forEach((e) => e.classList.remove("on"));
        const el = $(`#transcript span[data-i="${i}"]`);
        if (el) { el.classList.add("on"); el.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
        activeSeg = i;
      }
    }
    if (!audio.paused) requestAnimationFrame(tick);
  }
  function drawWave() {
    if (!current) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const g = canvas.getContext("2d"); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
    const css = getComputedStyle(root);
    const bar = 3, gap = 2, n = Math.floor(w / (bar + gap));
    const progress = audio.duration ? audio.currentTime / audio.duration : 0;
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, css.getPropertyValue("--brand").trim()); grad.addColorStop(1, css.getPropertyValue("--brand2").trim());
    const dim = css.getPropertyValue("--line").trim();
    for (let i = 0; i < n; i++) {
      let amp = 0.08;
      if (peaks) {
        const a = Math.floor((i / n) * peaks.length), z = Math.floor(((i + 1) / n) * peaks.length);
        let m = 0; for (let j = a; j < z; j += 8) m = Math.max(m, Math.abs(peaks[j]));
        amp = Math.max(0.04, Math.min(1, m * 1.25));
      }
      const bh = amp * (h - 4);
      g.fillStyle = i / n <= progress ? grad : dim;
      g.beginPath(); g.roundRect ? g.roundRect(i * (bar + gap), (h - bh) / 2, bar, bh, 1.5) : g.rect(i * (bar + gap), (h - bh) / 2, bar, bh); g.fill();
    }
  }
  canvas.onclick = (e) => { if (!audio.duration) return; const r = canvas.getBoundingClientRect(); audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration; drawWave(); $("#tCur").textContent = fmtTime(audio.currentTime); };
  addEventListener("resize", drawWave);

  $("#dlBtn").onclick = (e) => { e.stopPropagation(); $("#dlMenu").classList.toggle("hidden"); };
  document.addEventListener("click", () => $("#dlMenu").classList.add("hidden"));
  $$("#dlMenu a").forEach((a) => (a.onclick = () => {
    if (!current) return;
    const url = a.dataset.fmt ? `/api/history/${current.id}/audio?format=${a.dataset.fmt}&download=true` : `/api/history/${current.id}/captions?format=${a.dataset.cap}`;
    const link = document.createElement("a"); link.href = url; link.download = ""; document.body.appendChild(link); link.click(); link.remove();
  }));

  // ------------------------------------------------------------ library
  const gradient = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return [`hsl(${h % 360} 75% 60%)`, `hsl(${(h >> 8) % 360} 70% 45%)`]; };
  function voiceCard(v, { custom = false } = {}) {
    const id = custom ? "custom:" + v.id : v.id;
    const [a1, a2] = gradient(id);
    const el = document.createElement("div");
    el.className = "card vcard";
    const tags = custom ? (v.components || []).map((c) => `${voiceLabel(c.voice)} ${Math.round(c.weight * 100)}%`) : [v.accent, v.gender, ...(v.tags || [])];
    el.innerHTML = `<div class="top"><div class="avatar" style="--a1:${a1};--a2:${a2}">${esc(v.name[0])}</div>
      <div><div class="nm">${esc(v.name)}${!custom && v.tier >= 7 ? " ★" : ""}</div><div class="muted small">${esc(custom ? "Custom blend" : v.language_label)}</div></div></div>
      <div class="small">${esc(v.description || "")}</div>
      <div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
      <div class="acts"><button class="ghost" data-a="p">▶ Preview</button><button class="primary" data-a="u">Use</button>${custom ? '<button class="ghost danger icon" data-a="d" title="Delete">✕</button>' : ""}</div>`;
    $('[data-a="p"]', el).onclick = (e) => preview(id, null, e.currentTarget);
    $('[data-a="u"]', el).onclick = () => { fillVoiceSelect($("#voice"), id); store.set("voice", id); updateVoiceDesc(); show("tts"); toast(`Voice set to ${v.name}`); };
    if (custom) $('[data-a="d"]', el).onclick = async () => { if (!confirm(`Delete ${v.name}?`)) return; await api("/api/custom-voices/" + v.id, { method: "DELETE" }); await loadVoices(); renderCustom(); };
    return el;
  }
  function renderLibrary() {
    const q = $("#libSearch").value.toLowerCase(), lang = $("#libLang").value, gen = $("#libGender").value;
    const grid = $("#libGrid"); grid.innerHTML = "";
    VOICES.custom.filter((v) => !q || v.name.toLowerCase().includes(q)).forEach((v) => grid.appendChild(voiceCard(v, { custom: true })));
    VOICES.builtin
      .filter((v) => (!lang || v.language === lang) && (!gen || v.gender === gen) && (!q || [v.name, v.description, v.accent, v.language_label, ...v.tags].join(" ").toLowerCase().includes(q)))
      .forEach((v) => grid.appendChild(voiceCard(v)));
  }
  ["libSearch", "libLang", "libGender"].forEach((id) => $("#" + id).addEventListener("input", renderLibrary));

  // ------------------------------------------------------------ voice lab
  let mix = store.get("mix", [{ voice: "af_heart", w: 60 }, { voice: "bf_emma", w: 40 }]);
  const formula = () => mix.filter((m) => m.w > 0).map((m) => `${m.voice}*${(m.w / 100).toFixed(2)}`).join("+");
  function renderMix() {
    const box = $("#mixRows"); box.innerHTML = "";
    mix.forEach((m, i) => {
      const row = document.createElement("div"); row.className = "mix-row";
      row.innerHTML = `<select></select><input type="range" min="0" max="100" value="${m.w}" /><span class="small muted">${m.w}%</span><button class="ghost icon danger" title="Remove">✕</button>`;
      const sel = $("select", row);
      sel.innerHTML = VOICES.builtin.map((v) => `<option value="${v.id}">${esc(v.name)} · ${esc(v.accent)} ${v.gender === "female" ? "F" : "M"}</option>`).join("");
      sel.value = m.voice;
      sel.onchange = () => { m.voice = sel.value; sync(); };
      const rng = $("input", row);
      rng.oninput = () => { m.w = +rng.value; $("span", row).textContent = m.w + "%"; sync(); };
      $("button", row).onclick = () => { if (mix.length > 1) { mix.splice(i, 1); renderMix(); } };
      box.appendChild(row);
    });
    sync();
  }
  function sync() { $("#formula").textContent = formula() || "—"; store.set("mix", mix); }
  $("#addMix").onclick = () => { if (mix.length >= 5) return toast("Up to 5 voices", true); mix.push({ voice: VOICES.builtin[mix.length]?.id || "am_michael", w: 30 }); renderMix(); };
  $("#labPreview").onclick = (e) => { if (!formula()) return toast("Give at least one voice a weight", true); preview(formula(), $("#labText").value, e.currentTarget); };
  $("#labSave").onclick = async () => {
    const name = $("#labName").value.trim();
    if (!name) return toast("Name your voice", true);
    try {
      const v = await api("/api/custom-voices", { json: { name, formula: formula(), description: `Blend of ${mix.map((m) => voiceLabel(m.voice)).join(" + ")}` } });
      await loadVoices(); renderCustom(); $("#labName").value = ""; toast(`Saved “${v.name}”`);
    } catch (e) { toast(e.message, true); }
  };
  function renderCustom() {
    const list = $("#customList"); list.innerHTML = "";
    if (!VOICES.custom.length) { list.innerHTML = `<div class="muted small">Saved blends appear here and in every voice picker.</div>`; return; }
    VOICES.custom.forEach((v) => list.appendChild(voiceCard(v, { custom: true })));
  }

  // ------------------------------------------------------------ pronunciation
  let pron = [];
  async function loadPron() { pron = await api("/api/pronunciations"); if (!pron.length) pron = [{ term: "VoiceForge", type: "alias", replacement: "Voice Forge" }]; renderPron(); }
  function renderPron() {
    const body = $("#pronBody"); body.innerHTML = "";
    pron.forEach((r, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><input value="${esc(r.term)}" placeholder="e.g. Nguyen" /></td>
        <td><select><option value="alias">Alias</option><option value="ipa">IPA</option></select></td>
        <td><input value="${esc(r.replacement)}" placeholder="${r.type === "ipa" ? "e.g. wˈɪn" : "e.g. win"}" /></td>
        <td><input type="checkbox" ${r.case_sensitive ? "checked" : ""} title="Case sensitive" /></td>
        <td><button class="ghost icon" title="Test">▶</button></td><td><button class="ghost icon danger" title="Remove">✕</button></td>`;
      const [term, , repl] = $$("input", tr); const type = $("select", tr); const cs = $("input[type=checkbox]", tr);
      type.value = r.type || "alias";
      term.oninput = () => (r.term = term.value); repl.oninput = () => (r.replacement = repl.value);
      type.onchange = () => (r.type = type.value); cs.onchange = () => (r.case_sensitive = cs.checked);
      const [test, del] = $$("button", tr);
      test.onclick = async (e) => { await savePron(true); preview($("#voice").value, `Say ${r.term}. ${r.term}!`, e.currentTarget); };
      del.onclick = () => { pron.splice(i, 1); renderPron(); };
      body.appendChild(tr);
    });
  }
  async function savePron(quiet) {
    pron = await api("/api/pronunciations", { method: "PUT", json: pron.filter((r) => r.term && r.replacement) });
    if (!quiet) { renderPron(); $("#pronMsg").textContent = `Saved ${pron.length} rule${pron.length === 1 ? "" : "s"}`; }
  }
  $("#pronAdd").onclick = () => { pron.push({ term: "", type: "alias", replacement: "" }); renderPron(); };
  $("#pronSave").onclick = () => savePron(false).catch((e) => toast(e.message, true));

  // ------------------------------------------------------------ history
  let HIST = [];
  async function loadHistory() { HIST = await api("/api/history"); renderHistory(); }
  function renderHistory() {
    const q = $("#histSearch").value.toLowerCase();
    const list = $("#histList"); list.innerHTML = "";
    const items = HIST.filter((h) => !q || h.text.toLowerCase().includes(q));
    if (!items.length) { list.innerHTML = `<div class="muted">Nothing here yet. Everything you generate is saved automatically.</div>`; return; }
    for (const h of items) {
      const el = document.createElement("div"); el.className = "litem";
      const when = new Date(h.created * 1000).toLocaleString();
      const who = h.mode === "dialogue" ? `Dialogue · ${Object.keys(h.cast || {}).length} speakers` : voiceLabel(h.voice);
      el.innerHTML = `<button class="play" style="width:38px;height:38px;font-size:13px">▶</button>
        <div class="grow"><div class="t">${esc(h.title)}</div><div class="muted small">${esc(who)} · ${fmtTime(h.duration)} · ${when}</div></div>
        <div class="acts"><button class="ghost small" data-a="r">Reuse text</button><a class="small" href="/api/history/${h.id}/audio?format=mp3&download=true"><button class="ghost small">MP3</button></a><button class="ghost small danger" data-a="d">Delete</button></div>`;
      $(".play", el).onclick = async () => { show(h.mode === "dialogue" ? "dialogue" : "tts"); await loadResult(h, true); $("#player").scrollIntoView({ behavior: "smooth" }); };
      $('[data-a="r"]', el).onclick = () => {
        text.value = h.text; store.set("text", h.text);
        if (h.mode === "dialogue") { Object.assign(cast, h.cast || {}); store.set("cast", cast); }
        else if (h.voice) { fillVoiceSelect($("#voice"), h.voice); store.set("voice", h.voice); }
        show(h.mode === "dialogue" ? "dialogue" : "tts"); updateCount(); updateVoiceDesc();
      };
      $('[data-a="d"]', el).onclick = async () => { await api("/api/history/" + h.id, { method: "DELETE" }); HIST = HIST.filter((x) => x.id !== h.id); renderHistory(); };
      list.appendChild(el);
    }
  }
  $("#histSearch").addEventListener("input", renderHistory);

  // ------------------------------------------------------------ API docs
  const o = location.origin;
  $("#apiEl").textContent = `curl -X POST "${o}/v1/text-to-speech/af_heart?output_format=mp3_44100_128" \\
  -H "Content-Type: application/json" -H "xi-api-key: $VF_API_KEY" \\
  -d '{"text": "Hello world", "voice_settings": {"speed": 1.0}}' -o out.mp3

# streaming (sentence by sentence)
curl -X POST "${o}/v1/text-to-speech/bm_george/stream" -H "Content-Type: application/json" \\
  -d '{"text": "Long text here..."}' -o stream.mp3

curl "${o}/v1/voices"`;
  $("#apiOa").textContent = `curl -X POST "${o}/v1/audio/speech" -H "Content-Type: application/json" \\
  -d '{"model": "tts-1", "input": "Hello world", "voice": "nova", "response_format": "mp3"}' -o out.mp3

# Python (openai SDK)
from openai import OpenAI
client = OpenAI(base_url="${o}/v1", api_key="anything")
client.audio.speech.create(model="tts-1", voice="alloy", input="Hi!").write_to_file("hi.mp3")`;
  $("#apiNative").textContent = `curl -X POST "${o}/api/tts?format=wav" -H "Content-Type: application/json" -d '{
  "text": "Host: Welcome!\\nGuest: Thanks [pause 300ms] for having me.",
  "mode": "dialogue", "cast": {"Host": "af_heart", "Guest": "am_michael*0.7+bm_george*0.3"},
  "target_lufs": -16, "pacing": 1.0
}' -o dialogue.wav`;

  // ------------------------------------------------------------ boot
  async function boot() {
    updateCount();
    try {
      const h = await api("/api/health");
      $("#engineStatus").textContent = h.model_ready ? "Engine ready · Kokoro 82M" : "Model files missing";
      $("#engineStatus").className = "pill " + (h.model_ready ? "ok" : "bad");
      await loadVoices();
    } catch (e) {
      $("#engineStatus").textContent = "Engine offline"; $("#engineStatus").className = "pill bad"; toast(e.message, true);
    }
    const v = location.hash.slice(1);
    show(TITLES[v] ? v : "tts");
    if (!text.value) text.value = SAMPLES[mode], updateCount();
  }
  boot();
})();
