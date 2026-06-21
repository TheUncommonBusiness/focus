/* ───────────────────────────────────────────────
   Uncommon Focus — endless focus channels + session timer
   Music sources: 24/7 YouTube live streams and long-form
   focus videos. Each channel carries fallbacks: if a
   stream dies or errors, the player rotates to the next.
   ─────────────────────────────────────────────── */

const CHANNELS = [
  {
    name: "Deep Work",
    desc: "lofi beats · 24/7 live",
    swatch: "linear-gradient(135deg,#E8A86B,#8C5A3C)",
    sources: ["7NOSDKb0HlU", "X4VbdwhkE10", "5yx6BWlEVcY", "jfKfPfyJRdk", "lTRiuFIWV54"],
  },
  {
    name: "Flow State",
    desc: "synthwave · 24/7 live",
    swatch: "linear-gradient(135deg,#C46BE8,#3C4A8C)",
    // last entry is a long-form VOD anchor — VODs don't "end" like live streams, so the channel can never go fully silent
    sources: ["4xDzrJKXOOY", "S_MOd40zlYU", "0QKQlf8r7ls"],
  },
  {
    name: "Brain Waves",
    desc: "40Hz + alpha · binaural",
    swatch: "linear-gradient(135deg,#6BE8D8,#3C6A8C)",
    sources: ["1_G60OdEzXs", "WPni755-Krg"],
  },
  {
    name: "Piano",
    desc: "peaceful keys · 24/7 live",
    swatch: "linear-gradient(135deg,#FCFCF0,#98B09C)",
    sources: ["N0snMcR6aaA", "4khIPP--FDU", "w9S5ID3nfOc", "EbnH3VHzhu8"],
  },
  {
    name: "Jazz Café",
    desc: "slow jazz · 24/7 live",
    swatch: "linear-gradient(135deg,#E8C46B,#8C3C50)",
    sources: ["Dx5qFachd3A", "fEvM-OUbaKs", "O8q9nnyK6Xw", "blAFxjhg62k", "MYPVQccHhAQ"],
  },
  {
    name: "Rainfall",
    desc: "storm + rain · white noise",
    swatch: "linear-gradient(135deg,#9CB8C8,#3C4A52)",
    sources: ["nDq6TstdEi8", "mPZkdNFkNps", "q76bMs-NwRk"],
  },
  {
    name: "Deep Space",
    desc: "ambient drift · 24/7 live",
    swatch: "linear-gradient(135deg,#5A6BE8,#1A1F3C)",
    sources: ["AXvnFk38sDQ", "NU96ss5pEoE", "Qtb20K6noho", "FzUgsv3XH3o", "k3UevKvP9RU"],
  },
  {
    name: "Classical",
    desc: "mozart · bach · chopin",
    swatch: "linear-gradient(135deg,#C8A86B,#523C28)",
    sources: ["jXAEIWcGXwE", "bwZUs26HZI8", "jgpJVI3tDbY"],
  },
];

const RING_C = 1068.1; // ring circumference

const $ = (id) => document.getElementById(id);
const els = {
  clock: $("clock"), clockSub: $("clock-sub"), ring: $("ring-fill"),
  phase: $("phase-label"), dots: $("cycle-dots"),
  play: $("btn-play"), iconPlay: $("icon-play"), iconPause: $("icon-pause"),
  skip: $("btn-skip"), reset: $("btn-reset"), volume: $("volume"),
  track: $("channels-track"), status: $("stream-status"), streamTitle: $("stream-title"),
  customPanel: $("custom-panel"), customFocus: $("custom-focus"),
  customBreak: $("custom-break"), pauseOnBreak: $("pause-on-break"),
};

/* ── state ────────────────────────────────────── */

const saved = JSON.parse(localStorage.getItem("uf-settings") || "{}");

const state = {
  channel: saved.channel ?? 0,
  source: 0,
  playing: false,
  pendingPlay: false,       // user hit play before YT API was ready
  phase: "focus",
  focusMin: saved.focusMin ?? 25,
  breakMin: saved.breakMin ?? 5,
  preset: saved.preset ?? "25",
  pauseOnBreak: saved.pauseOnBreak ?? false,
  volume: saved.volume ?? 70,
  remaining: (saved.focusMin ?? 25) * 60,
  total: (saved.focusMin ?? 25) * 60,
  endAt: null,              // timestamp when current phase ends (null = paused)
  cycles: 0,
  timerId: null,
};

function persist() {
  localStorage.setItem("uf-settings", JSON.stringify({
    channel: state.channel, focusMin: state.focusMin, breakMin: state.breakMin,
    preset: state.preset, pauseOnBreak: state.pauseOnBreak, volume: state.volume,
  }));
}

/* ── youtube player ───────────────────────────── */

let player = null;
let playerReady = false;
let errorStreak = 0; // consecutive failed sources on the current channel

const tag = document.createElement("script");
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

window.onYouTubeIframeAPIReady = () => {
  player = new YT.Player("yt-player", {
    width: 1, height: 1,
    videoId: CHANNELS[state.channel].sources[0],
    playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1 },
    events: {
      onReady: () => {
        playerReady = true;
        player.setVolume(state.volume);
        if (state.pendingPlay) { state.pendingPlay = false; startSession(); }
      },
      onStateChange: (e) => {
        // iOS fix: loadVideoById cues but does not autoplay; call playVideo when ready
        if (e.data === YT.PlayerState.CUED && state.playing && !(state.phase === "break" && state.pauseOnBreak)) {
          player.playVideo();
        }
        if (e.data === YT.PlayerState.ENDED) nextSource(); // long videos roll to next source (or loop)
        if (e.data === YT.PlayerState.PLAYING) {
          errorStreak = 0; // a source played → reset the failure counter
          els.status.classList.add("live");
          const data = player.getVideoData();
          if (data && data.title) els.streamTitle.textContent = data.title;
        }
      },
      onError: () => failSource(), // dead/region-locked stream → guarded fallback
    },
  });
};

function loadSource() {
  if (!playerReady) return;
  const ch = CHANNELS[state.channel];
  const id = ch.sources[state.source % ch.sources.length];
  els.streamTitle.textContent = `Tuning ${ch.name}…`;
  if (state.playing && !(state.phase === "break" && state.pauseOnBreak)) {
    player.loadVideoById(id);
  } else {
    player.cueVideoById(id);
  }
}

function nextSource() {
  state.source += 1;
  loadSource();
}

// Called when a source errors. Rotates to the next source, but stops after
// cycling through every source once so a fully-offline channel doesn't hammer
// YouTube in an endless retry loop — it shows a calm message instead.
function failSource() {
  const ch = CHANNELS[state.channel];
  errorStreak += 1;
  if (errorStreak >= ch.sources.length) {
    errorStreak = 0;
    els.status.classList.remove("live");
    els.streamTitle.textContent = `${ch.name} is offline — try another channel`;
    return;
  }
  nextSource();
}

/* ── channels ui ──────────────────────────────── */

function renderChannels() {
  els.track.innerHTML = "";
  CHANNELS.forEach((ch, i) => {
    const btn = document.createElement("button");
    btn.className = "channel" + (i === state.channel ? " active" : "");
    btn.innerHTML = `
      <span class="channel-swatch" style="--sw:${ch.swatch}"></span>
      <span class="channel-name">${ch.name}</span>
      <span class="channel-desc">${ch.desc}</span>`;
    btn.addEventListener("click", () => selectChannel(i));
    els.track.appendChild(btn);
  });
}

function selectChannel(i) {
  state.channel = i;
  state.source = 0;
  errorStreak = 0;
  persist();
  document.querySelectorAll(".channel").forEach((c, j) =>
    c.classList.toggle("active", j === i));
  loadSource();
  updateSub();
}

/* ── timer engine ─────────────────────────────── */

function fmt(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function paint() {
  els.clock.textContent = fmt(state.remaining);
  els.ring.style.strokeDashoffset = RING_C * (state.remaining / state.total);
  document.title = state.playing
    ? `${fmt(state.remaining)} · ${state.phase === "focus" ? "Focus" : "Break"} — Uncommon Focus`
    : "Uncommon Focus";
}

function updateSub() {
  if (!state.playing) {
    els.clockSub.textContent = state.endAt === null && state.remaining < state.total
      ? "paused" : "ready when you are";
  } else if (state.phase === "focus") {
    els.clockSub.textContent = `deep work · ${CHANNELS[state.channel].name.toLowerCase()}`;
  } else {
    els.clockSub.textContent = "breathe · the next block is coming";
  }
}

function tick() {
  if (state.endAt === null) return;
  state.remaining = (state.endAt - Date.now()) / 1000;
  if (state.remaining <= 0) {
    switchPhase();
  } else {
    paint();
  }
}

function switchPhase() {
  chime(state.phase === "focus" ? "break" : "focus");
  if (state.phase === "focus") {
    state.cycles += 1;
    paintDots();
    state.phase = "break";
    state.total = state.remaining = state.breakMin * 60;
    document.body.classList.add("on-break");
    els.phase.textContent = "Break";
    els.phase.dataset.phase = "break";
    if (state.pauseOnBreak && playerReady) player.pauseVideo();
  } else {
    state.phase = "focus";
    state.total = state.remaining = state.focusMin * 60;
    document.body.classList.remove("on-break");
    els.phase.textContent = "Focus";
    els.phase.dataset.phase = "focus";
    if (state.pauseOnBreak && playerReady) player.playVideo();
  }
  state.endAt = Date.now() + state.remaining * 1000;
  paint();
  updateSub();
}

function paintDots() {
  [...els.dots.children].forEach((d, i) =>
    d.classList.toggle("done", i < (state.cycles % 4 === 0 && state.cycles > 0 ? 4 : state.cycles % 4)));
  if (state.cycles % 4 === 0 && state.cycles > 0) {
    setTimeout(() => [...els.dots.children].forEach(d => d.classList.remove("done")), 2200);
  }
}

/* ── screen wake lock (keep phone awake mid-session) ── */

let wakeLock = null;

async function acquireWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request("screen"); } catch (e) { /* low battery / unsupported */ }
}

function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.playing) acquireWakeLock();
});

/* ── session control ──────────────────────────── */

function startSession() {
  if (!playerReady) { state.pendingPlay = true; setPlayingUI(true); return; }
  state.playing = true;
  state.endAt = Date.now() + state.remaining * 1000;
  if (!state.timerId) state.timerId = setInterval(tick, 250);
  if (!(state.phase === "break" && state.pauseOnBreak)) {
    const ch = CHANNELS[state.channel];
    const cued = player.getVideoData && player.getVideoData().video_id;
    const want = ch.sources[state.source % ch.sources.length];
    if (cued !== want) player.loadVideoById(want);
    else player.playVideo();
  }
  setPlayingUI(true);
  updateSub();
  acquireWakeLock();
}

function pauseSession() {
  state.playing = false;
  state.pendingPlay = false;
  state.endAt = null;
  if (playerReady) player.pauseVideo();
  releaseWakeLock();
  setPlayingUI(false);
  updateSub();
  paint();
}

function resetSession() {
  pauseSession();
  state.phase = "focus";
  state.cycles = 0;
  state.total = state.remaining = state.focusMin * 60;
  document.body.classList.remove("on-break");
  els.phase.textContent = "Focus";
  els.phase.dataset.phase = "focus";
  paintDots();
  els.clockSub.textContent = "ready when you are";
  paint();
}

function setPlayingUI(on) {
  document.body.classList.toggle("playing", on);
  els.iconPlay.style.display = on ? "none" : "";
  els.iconPause.style.display = on ? "" : "none";
  els.play.setAttribute("aria-label", on ? "Pause" : "Play");
}

function togglePlay() {
  state.playing || state.pendingPlay ? pauseSession() : startSession();
}

/* ── chime ────────────────────────────────────── */

let audioCtx = null;

function chime(toPhase) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = toPhase === "break" ? [659.25, 880] : [880, 659.25];
    notes.forEach((freq, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime + i * 0.28);
      g.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + i * 0.28 + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + i * 0.28 + 0.9);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + i * 0.28);
      o.stop(audioCtx.currentTime + i * 0.28 + 1);
    });
  } catch (e) { /* audio unavailable — stay silent */ }
}

/* ── presets ──────────────────────────────────── */

function applyPreset(focusMin, breakMin, presetKey, btn) {
  state.focusMin = focusMin;
  state.breakMin = breakMin;
  state.preset = presetKey;
  persist();
  document.querySelectorAll(".preset").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  resetSession();
}

document.querySelectorAll(".preset[data-focus]").forEach(btn => {
  btn.addEventListener("click", () => {
    els.customPanel.hidden = true;
    applyPreset(+btn.dataset.focus, +btn.dataset.break, btn.dataset.focus, btn);
  });
});

$("preset-custom").addEventListener("click", (e) => {
  els.customPanel.hidden = !els.customPanel.hidden;
  if (!els.customPanel.hidden) {
    els.customFocus.value = state.focusMin;
    els.customBreak.value = state.breakMin;
    applyPreset(state.focusMin, state.breakMin, "custom", e.currentTarget);
  }
});

[els.customFocus, els.customBreak].forEach(inp => {
  inp.addEventListener("change", () => {
    const f = Math.min(180, Math.max(1, +els.customFocus.value || 25));
    const b = Math.min(60, Math.max(1, +els.customBreak.value || 5));
    applyPreset(f, b, "custom", $("preset-custom"));
  });
});

els.pauseOnBreak.addEventListener("change", () => {
  state.pauseOnBreak = els.pauseOnBreak.checked;
  persist();
});

/* ── transport + volume + keys ────────────────── */

els.play.addEventListener("click", togglePlay);
els.skip.addEventListener("click", nextSource);
els.reset.addEventListener("click", resetSession);

function setVolume(v) {
  state.volume = v;
  els.volume.value = v;
  els.volume.style.setProperty("--vol", v + "%");
  if (playerReady) player.setVolume(v);
  persist();
}

els.volume.addEventListener("input", () => setVolume(+els.volume.value));

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input")) return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  if (e.key === "n" || e.key === "N") nextSource();
  if (e.key === "r" || e.key === "R") resetSession();
});

/* ── init ─────────────────────────────────────── */

renderChannels();
setVolume(state.volume);
els.pauseOnBreak.checked = state.pauseOnBreak;

document.querySelectorAll(".preset").forEach(b => b.classList.remove("active"));
const presetBtn = state.preset === "custom"
  ? $("preset-custom")
  : document.querySelector(`.preset[data-focus="${state.preset}"]`);
(presetBtn || document.querySelector(".preset")).classList.add("active");

state.total = state.remaining = state.focusMin * 60;
paint();
