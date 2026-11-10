/* ============================================================
   KRILLION — offline deep dive
   All answers come from the local bank in data.js. No network.
   ============================================================ */
(() => {
  "use strict";

  const bank = window.KRILLION_BANK;
  const $ = (id) => document.getElementById(id);
  const PROMPT_MS = 25000;
  const CLASSIC_PROMPTS = 7;
  const MAX_TANKS = 3;
  const SAVE_KEY = "krillion_offline_v1";
  const LONG_GOAL = 250000; // 250 km, the end of the drawn ocean

  const TIERS = {
    100: { name: "One in a Krillion", color: "#ffd166", note: "Nobody else is down here." },
    85:  { name: "Deep Cut",         color: "#ff5252", note: "True obscurity. Few go this deep." },
    60:  { name: "Rare",             color: "#ff9f43", note: "Few would reach for that." },
    30:  { name: "Schooler",         color: "#5ad07a", note: "Known, but not the first thing said." },
    15:  { name: "Too Clever",       color: "#4de3ff", note: "The clever pick. The school thought of it too." },
    10:  { name: "Plankton",         color: "#5b87f5", note: "Everyone said it. You drift." },
  };
  const SCORE_ORDER = [100, 85, 60, 30, 15, 10];
  const TIER_KEYS = { 100: "krillion", 85: "deepcut", 60: "rare", 30: "schooler", 15: "tooclever", 10: "plankton" };

  const ZONES = [
    { key: "sunlight", max: 200,   name: "Sunlight Zone", sub: "Epipelagic · 0–200 m",             caption: "Light still reaches you." },
    { key: "twilight", max: 1000,  name: "Twilight Zone", sub: "Mesopelagic · 200–1,000 m",       caption: "The light is going." },
    { key: "midnight", max: 4000,  name: "Midnight Zone", sub: "Bathypelagic · 1,000–4,000 m",    caption: "No sunlight at all down here." },
    { key: "abyssal",  max: 6000,  name: "Abyssal Zone",  sub: "Abyssopelagic · 4,000–6,000 m",   caption: "The great flat plains of the sea floor." },
    { key: "hadal",    max: 11000, name: "Hadal Zone",    sub: "The trenches · 6,000–11,000 m",   caption: "The trenches. The pressure is total." },
  ];
  const DEEP_A = ["The", "Sunken", "Black", "Glass", "Brine", "Cold", "Silent", "Hollow", "Starless", "Pale", "Iron", "Coral", "Frozen", "Last", "Drowned", "Quiet", "Amber", "Violet"];
  const DEEP_B = ["Cathedral", "Trench", "Plain", "Garden", "Forge", "Reach", "Maw", "Current", "Spire", "Hall", "Field", "Gate", "Bloom", "Dark", "Road", "Choir", "Vault", "Sea"];

  const els = {
    loader: $("loader"), loaderSub: $("loaderSub"),
    menu: $("menu"), game: $("game"), results: $("results"),
    bankPrompts: $("bankPrompts"), bankAnswers: $("bankAnswers"), howAnswers: $("howAnswers"), howPrompts: $("howPrompts"),
    menuBest: $("menuBest"), menuRuns: $("menuRuns"), hudDepth: $("hudDepth"), hudBest: $("hudBest"),
    soundBtn: $("soundBtn"), soundIcon: $("soundIcon"), homeLink: $("homeLink"),
    gameSoundBtn: $("gameSoundBtn"), gameSoundIcon: $("gameSoundIcon"),
    promptSegs: $("promptSegs"), answerDock: $("answerDock"),
    modeLabel: $("modeLabel"), promptCounter: $("promptCounter"), tanks: $("tanks"), quitBtn: $("quitBtn"),
    depth: $("depth"), zoneName: $("zoneName"), zoneSub: $("zoneSub"), depthFill: $("depthFill"),
    depthThumb: $("depthThumb"), depthGoal: $("depthGoal"), depthCaption: $("depthCaption"),
    depthMarker: $("depthMarker"), depthMarkerLabel: $("depthMarkerLabel"), rulerTicks: $("rulerTicks"),
    promptCard: $("promptCard"), category: $("category"), promptText: $("promptText"),
    answerInput: $("answerInput"), diveBtn: $("diveBtn"), passBtn: $("passBtn"),
    timer: document.querySelector(".timer"), timerFill: $("timerFill"), timerNum: $("timerNum"),
    feedback: $("feedback"), bankCount: $("bankCount"), oceanCanvas: $("oceanCanvas"),
    tierOverlay: $("tierOverlay"), tierCard: $("tierCard"), tierKicker: $("tierKicker"),
    tierName: $("tierName"), tierPoints: $("tierPoints"), tierMetres: $("tierMetres"), tierGain: $("tierGain"),
    tierAnswer: $("tierAnswer"), tierNote: $("tierNote"), tierNext: $("tierNext"), tierMeter: $("tierMeter"),
    resultEyebrow: $("resultEyebrow"), resultDepth: $("resultDepth"), resultTitle: $("resultTitle"),
    resultSub: $("resultSub"), newBest: $("newBest"), resultGrid: $("resultGrid"),
    againBtn: $("againBtn"), menuBtn: $("menuBtn"), copyBtn: $("copyBtn"),
    tierTable: $("tierTable"),
  };

  const save = loadSave();
  const state = { run: null, raf: 0, depthRaf: 0, overlayTimer: 0, revealDelay: 0, overlayOpen: false, lastMode: "classic", oceanRaf: 0, oceanLast: 0, cameraDepth: 0, cameraTarget: 0, rulerBase: -1 };
  let PROMPTS = [];
  let DIFFICULTY = [];

  /* ---------------- persistence ---------------- */
  function loadSave() {
    const fallback = { best: { classic: 0, endless: 0 }, runs: 0, seen: [], sound: true, history: [] };
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return fallback;
      const s = JSON.parse(raw);
      return {
        best: { classic: Number(s.best && s.best.classic) || 0, endless: Number(s.best && s.best.endless) || 0 },
        runs: Number(s.runs) || 0,
        seen: Array.isArray(s.seen) ? s.seen.filter((n) => Number.isInteger(n)) : [],
        sound: s.sound !== false,
        history: Array.isArray(s.history) ? s.history.slice(0, 10) : [],
      };
    } catch (e) { return fallback; }
  }
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* private mode / file:// */ }
  }

  /* ---------------- sound (synthesised, no assets) ---------------- */
  const sound = {
    ctx: null,
    enabled: save.sound,
    unlock() {
      if (!this.enabled) return;
      try {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      } catch (e) { this.ctx = null; }
    },
    tone(freq, delay, dur, type, vol) {
      if (!this.enabled || !this.ctx) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol || 0.04, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || 0.2));
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t0); osc.stop(t0 + (dur || 0.2) + 0.02);
    },
    click() { this.tone(320, 0, 0.05, "triangle", 0.018); },
    accept(score) {
      const base = score >= 85 ? 523.25 : score >= 60 ? 440 : 392;
      const steps = score === 100 ? [0, 4, 7, 12, 16] : [0, 7, 12];
      steps.forEach((semi, i) => this.tone(base * Math.pow(2, semi / 12), i * 0.075, 0.22, "sine", 0.04));
      if (score === 100) this.tone(1046.5, 0.38, 0.5, "triangle", 0.03);
    },
    refuse() { this.tone(130, 0, 0.1, "sawtooth", 0.025); this.tone(98, 0.09, 0.15, "sawtooth", 0.022); },
    tick() { this.tone(880, 0, 0.03, "square", 0.012); },
    timeout() { this.tone(220, 0, 0.16, "sine", 0.03); this.tone(165, 0.14, 0.22, "sine", 0.03); },
    loseTank() { this.tone(180, 0, 0.2, "triangle", 0.025); this.tone(110, 0.12, 0.3, "triangle", 0.02); },
    finish(best) {
      const notes = best ? [392, 523.25, 659.25, 783.99] : [392, 493.88, 587.33];
      notes.forEach((f, i) => this.tone(f, i * 0.11, 0.35, "sine", 0.035));
    },
  };

  /* ---------------- text / bank helpers ---------------- */
  function syncSoundUI() {
    [els.soundBtn, els.gameSoundBtn].forEach((btn) => {
      if (btn) btn.setAttribute("aria-pressed", String(sound.enabled));
    });
    [els.soundIcon, els.gameSoundIcon].forEach((icon) => {
      if (icon) icon.textContent = sound.enabled ? "♪" : "×";
    });
  }
  function toggleSound() {
    sound.enabled = !sound.enabled;
    save.sound = sound.enabled;
    persist();
    syncSoundUI();
    if (sound.enabled) { sound.unlock(); sound.click(); }
  }
  function fmt(n) { return Math.round(n).toLocaleString("en-US"); }
  function setText(el, value) { if (el) el.textContent = value; }
  function countLines(s) {
    if (!s) return 0;
    let n = 1;
    for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
    return n;
  }
  function normKey(s) {
    return String(s)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "");
  }
  function stripArticle(s) { return String(s).replace(/^(the|a|an)\s+/i, ""); }

  function inputKeys(raw) {
    const out = new Set();
    const add = (s) => { const k = normKey(s); if (k) out.add(k); };
    add(raw);
    add(stripArticle(raw));
    const paren = String(raw).match(/\(([^)]+)\)/);
    if (paren) { add(String(raw).replace(/\([^)]*\)/g, " ")); add(paren[1]); }
    for (const k of [...out]) {
      if (k.endsWith("ies") && k.length > 5) add(k.slice(0, -3) + "y");
      if (k.endsWith("es") && k.length > 4) add(k.slice(0, -2));
      if (k.endsWith("s") && k.length > 3) add(k.slice(0, -1));
      else if (!k.endsWith("s")) add(k + "s");
    }
    return out;
  }
  function bankKeys(answer) {
    const out = new Set();
    const add = (s) => { const k = normKey(s); if (k) out.add(k); };
    add(answer);
    add(stripArticle(answer));
    const paren = String(answer).match(/\(([^)]+)\)/);
    if (paren) { add(String(answer).replace(/\([^)]*\)/g, " ")); add(paren[1]); }
    return out;
  }

  function getLookup(p) {
    if (p.lookup) return p.lookup;
    const map = new Map();
    p.groups.forEach((group, ti) => {
      const score = SCORE_ORDER[ti];
      if (!group) return;
      for (const answer of group.split("\n")) {
        if (!answer) continue;
        for (const key of bankKeys(answer)) {
          const cur = map.get(key);
          if (!cur || score > cur.s) map.set(key, { a: answer, s: score });
        }
      }
    });
    p.lookup = map;
    return map;
  }

  function withinOne(a, b) {
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    if (la === lb) {
      const diffs = [];
      for (let i = 0; i < la; i++) if (a[i] !== b[i]) diffs.push(i);
      if (diffs.length === 1) return true;
      if (diffs.length === 2 && diffs[1] === diffs[0] + 1 &&
          a[diffs[0]] === b[diffs[1]] && a[diffs[1]] === b[diffs[0]]) return true;
      return false;
    }
    const short = la < lb ? a : b;
    const long = la < lb ? b : a;
    let i = 0, j = 0, skipped = false;
    while (i < short.length && j < long.length) {
      if (short[i] === long[j]) { i++; j++; }
      else if (skipped) return false;
      else { skipped = true; j++; }
    }
    return true;
  }

  function fuzzyFind(p, key) {
    if (!p.buckets) {
      p.buckets = new Map();
      for (const k of p.lookup.keys()) {
        if (k.length < 5) continue;
        const b = k[0] + ":" + k.length;
        let arr = p.buckets.get(b);
        if (!arr) { arr = []; p.buckets.set(b, arr); }
        arr.push(k);
      }
    }
    let found = null;
    for (const len of [key.length - 1, key.length, key.length + 1]) {
      const arr = p.buckets.get(key[0] + ":" + len);
      if (!arr) continue;
      for (const cand of arr) {
        if (cand === key || !withinOne(key, cand)) continue;
        const hit = p.lookup.get(cand);
        if (found && found.a !== hit.a) return null;
        found = hit;
      }
    }
    return found;
  }

  function findAnswer(p, raw) {
    const lookup = getLookup(p);
    for (const key of inputKeys(raw)) {
      const hit = lookup.get(key);
      if (hit) return hit;
    }
    const primary = normKey(raw);
    if (primary.length >= 5 && !/^\d+$/.test(primary)) {
      const hit = fuzzyFind(p, primary);
      if (hit) return { a: hit.a, s: hit.s, fuzzy: true };
    }
    return null;
  }

  /* ---------------- zones ---------------- */
  function deepZone(depth) {
    const n = Math.floor((depth - 11000) / 2000);
    const a = DEEP_A[n % DEEP_A.length];
    const b = DEEP_B[Math.floor(n / DEEP_A.length) % DEEP_B.length];
    return {
      key: "krillscape",
      name: `${a} ${b}`,
      sub: `Krillscape · zone ${n + 1} of 108`,
      caption: "Past the map. The krill keeps sinking.",
    };
  }
  function zoneFor(depth) {
    for (const z of ZONES) if (depth < z.max) return z;
    return deepZone(depth);
  }

  /* ---------------- depth display ---------------- */
  function rulerBaseFor(v) {
    return Math.max(0, Math.floor((Number(v) || 0) / 100) * 100 - 100);
  }
  function depthRulerPct(v) {
    const d = Math.max(0, Number(v) || 0);
    const base = rulerBaseFor(d);
    return 16.4 + Math.min(4, Math.max(0, (d - base) / 100)) * 20;
  }
  function renderRulerTicks(v) {
    if (!els.rulerTicks) return;
    const base = rulerBaseFor(v);
    if (state.rulerBase === base) return;
    state.rulerBase = base;
    let html = "";
    for (let i = 0; i < 5; i++) {
      const depth = base + i * 100;
      html += `<span style="top:${(16.4 + i * 20).toFixed(1)}%">${fmt(depth)}m</span>`;
    }
    els.rulerTicks.innerHTML = html;
  }
  function setDepthDisplay(v) {
    const z = zoneFor(v);
    els.depth.textContent = fmt(v);
    els.hudDepth.textContent = fmt(v);
    if (document.body.dataset.zone !== z.key) document.body.dataset.zone = z.key;
    els.zoneName.textContent = z.name;
    els.zoneSub.textContent = z.sub;
    if (els.depthCaption) els.depthCaption.textContent = z.caption;
    const run = state.run;
    let pct;
    if (run && run.mode === "endless") {
      pct = Math.min(100, (Math.log10(1 + v) / Math.log10(1 + LONG_GOAL)) * 100);
    } else {
      pct = Math.min(100, (v / (CLASSIC_PROMPTS * 100 * 10)) * 100);
    }
    if (els.depthFill) els.depthFill.style.width = pct.toFixed(2) + "%";
    if (els.depthThumb) els.depthThumb.style.left = pct.toFixed(2) + "%";
    renderRulerTicks(v);
    if (els.depthMarker) {
      const markerPct = depthRulerPct(v);
      els.depthMarker.style.top = markerPct.toFixed(2) + "%";
    }
    if (els.depthMarkerLabel) els.depthMarkerLabel.textContent = fmt(v) + "m";
  }
  function animateDepth(from, to) {
    cancelAnimationFrame(state.depthRaf);
    const start = performance.now();
    const dur = 2600;
    state.cameraTarget = to;
    state.cameraDepth = from;
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      state.cameraDepth = from + (to - from) * eased;
      setDepthDisplay(state.cameraDepth);
      if (t < 1) state.depthRaf = requestAnimationFrame(step);
      else {
        state.cameraDepth = to;
        setDepthDisplay(to);
      }
    };
    state.depthRaf = requestAnimationFrame(step);
  }

  /* ---------------- prompt selection ---------------- */
  function choosePrompt(run) {
    let pool;
    if (run.mode === "endless") {
      const stage = Math.min(2, Math.floor(run.index / 5));
      const chunk = Math.ceil(DIFFICULTY.length / 3);
      pool = DIFFICULTY.slice(stage * chunk, Math.min(DIFFICULTY.length, (stage + 1) * chunk));
    } else {
      pool = DIFFICULTY.slice();
    }
    const seen = new Set(save.seen);
    let candidates = pool.filter((i) => !seen.has(i) && !run.used.has(i));
    if (!candidates.length) {
      const poolSet = new Set(pool);
      save.seen = save.seen.filter((i) => !poolSet.has(i));
      candidates = pool.filter((i) => !run.used.has(i));
    }
    if (!candidates.length) candidates = pool.filter((i) => !run.used.has(i));
    if (!candidates.length) candidates = pool;
    const varied = candidates.filter((i) => PROMPTS[i].cat !== run.lastCat);
    const finalPool = varied.length ? varied : candidates;
    const pick = finalPool[Math.floor(Math.random() * finalPool.length)];
    run.lastCat = PROMPTS[pick].cat;
    return PROMPTS[pick];
  }
  function markSeen(i) {
    if (!save.seen.includes(i)) save.seen.push(i);
    if (save.seen.length > 280) save.seen.splice(0, save.seen.length - 280);
    persist();
  }

  /* ---------------- screens ---------------- */
  function showScreen(name) {
    els.menu.hidden = name !== "menu";
    els.game.hidden = name !== "game";
    els.results.hidden = name !== "results";
    document.body.dataset.screen = name;
    if (name === "game") startOcean(); else stopOcean();
    window.scrollTo(0, 0);
  }
  function updateBest() {
    const best = Math.max(save.best.classic || 0, save.best.endless || 0);
    els.hudBest.textContent = fmt(best);
    els.menuBest.textContent = fmt(best) + " m";
    els.menuRuns.textContent = fmt(save.runs);
  }

  /* ---------------- timer ---------------- */
  function stopTimer() {
    cancelAnimationFrame(state.raf);
    state.raf = 0;
  }
  function startTimer() {
    stopTimer();
    const c = state.run && state.run.current;
    if (!c) return;
    c.remaining = PROMPT_MS;
    c.deadline = performance.now() + PROMPT_MS;
    c.lastSec = -1;
    els.timer.classList.remove("urgent");
    els.timer.style.setProperty("--pct", "100");
    els.timerFill.style.width = "100%";
    els.timerNum.textContent = String(Math.round(PROMPT_MS / 1000));
    runTimer();
  }
  function runTimer() {
    stopTimer();
    const step = () => {
      const run = state.run;
      const c = run && run.current;
      if (!c || c.locked) return;
      const rem = Math.max(0, c.deadline - performance.now());
      c.remaining = rem;
      const pct = (rem / PROMPT_MS) * 100;
      els.timer.style.setProperty("--pct", pct.toFixed(2));
      els.timerFill.style.width = pct.toFixed(2) + "%";
      const sec = Math.ceil(rem / 1000);
      if (sec !== c.lastSec) {
        c.lastSec = sec;
        els.timerNum.textContent = String(sec);
        if (sec <= 5 && sec > 0) sound.tick();
      }
      els.timer.classList.toggle("urgent", rem <= 5000);
      if (rem <= 0) { onTimeUp(); return; }
      state.raf = requestAnimationFrame(step);
    };
    state.raf = requestAnimationFrame(step);
  }
  document.addEventListener("visibilitychange", () => {
    const c = state.run && state.run.current;
    if (!c || c.locked) return;
    if (document.hidden) {
      c.remaining = Math.max(0, c.deadline - performance.now());
      stopTimer();
    } else {
      c.deadline = performance.now() + Math.max(800, c.remaining);
      runTimer();
    }
  });

  /* ---------------- run flow ---------------- */
  function startRun(mode) {
    sound.unlock();
    sound.click();
    closeTier(false);
    state.cameraDepth = 0;
    state.cameraTarget = 0;
    state.run = {
      mode,
      index: 0,
      points: 0,
      depth: 0,
      tanks: MAX_TANKS,
      results: [],
      used: new Set(),
      lastCat: null,
      current: null,
      done: false,
    };
    state.lastMode = mode;
    els.modeLabel.textContent = mode === "classic" ? "Classic" : "Endless";
    els.depthGoal.textContent = mode === "classic" ? "7,000 m" : "250 km";
    els.depthCaption.textContent = "The surface is still close.";
    showScreen("game");
    setDepthDisplay(0);
    renderTanks();
    nextPrompt();
  }

  function nextPrompt() {
    const run = state.run;
    if (!run || run.done) return;
    const p = choosePrompt(run);
    run.used.add(p.i);
    markSeen(p.i);
    run.current = { p, locked: false, remaining: PROMPT_MS, deadline: 0, lastSec: -1 };
    els.category.textContent = p.cat;
    els.promptText.textContent = p.q;
    els.answerInput.value = "";
    els.answerInput.disabled = false;
    els.answerInput.classList.remove("bad");
    els.promptCard.classList.remove("shake", "accept");
    els.game.classList.remove("revealing");
    els.tierOverlay.hidden = true;
    els.feedback.textContent = "";
    els.feedback.className = "feedback";
    els.bankCount.innerHTML = "<b>" + fmt(p.total) + "</b> answers in this bank";
    els.promptCounter.textContent = run.mode === "classic"
      ? `Prompt ${run.index + 1} / ${CLASSIC_PROMPTS}`
      : `Dive ${run.index + 1}`;
    renderPromptSegs(run);
    renderTanks();
    startTimer();
    setTimeout(() => { if (state.run === run && !run.current.locked) els.answerInput.focus({ preventScroll: true }); }, 40);
  }

  function renderTanks(refill) {
    const run = state.run;
    if (!run || run.mode !== "endless") { els.tanks.hidden = true; els.tanks.innerHTML = ""; return; }
    els.tanks.hidden = false;
    let html = "";
    for (let i = 0; i < MAX_TANKS; i++) {
      const full = i < run.tanks;
      html += `<i class="${full ? "" : "empty"}${refill && i === run.tanks - 1 ? " refill" : ""}" title="${full ? "Air" : "Empty"}"></i>`;
    }
    els.tanks.innerHTML = html;
  }

  function renderPromptSegs(run) {
    if (!els.promptSegs) return;
    const entries = [];
    if (run.mode === "classic") {
      for (let i = 0; i < CLASSIC_PROMPTS; i++) {
        entries.push({ result: run.results[i] || null, now: !run.results[i] && i === run.index });
      }
    } else {
      const recent = run.results.slice(-CLASSIC_PROMPTS);
      for (let i = 0; i < CLASSIC_PROMPTS; i++) {
        entries.push({ result: recent[i] || null, now: i === recent.length });
      }
    }
    let html = "";
    entries.forEach(({ result, now }) => {
      let attrs = "";
      if (result && result.score) {
        const tier = TIERS[result.score];
        attrs = ` data-tier="${TIER_KEYS[result.score]}" title="${tier.name} · ${result.score} pts"`;
      } else if (result) {
        attrs = " data-tier=\"miss\" title=\"No scoring answer\"";
      } else if (now) {
        attrs = " data-now=\"true\"";
      }
      html += `<i${attrs}></i>`;
    });
    const label = run.mode === "classic" ? `Prompt ${run.index + 1} of ${CLASSIC_PROMPTS}` : `Prompt ${run.index + 1}`;
    els.promptSegs.innerHTML = `<span class="seg-pips">${html}</span><span class="seg-label">${label}</span>`;
  }

  function submitAnswer(auto) {
    const run = state.run;
    const c = run && run.current;
    if (!c || c.locked) return;
    const raw = els.answerInput.value.trim();
    if (!raw) {
      if (auto) { finishMiss("time"); return; }
      els.feedback.className = "feedback bad";
      els.feedback.textContent = "Type an answer first — the clock is still running.";
      els.answerInput.focus();
      return;
    }
    const hit = findAnswer(c.p, raw);
    if (hit) { acceptAnswer(hit, raw); return; }
    if (auto) { finishMiss("time"); return; }
    els.feedback.className = "feedback bad";
    els.feedback.textContent = "Not an answer to that prompt. Try another angle.";
    els.answerInput.classList.remove("bad");
    void els.answerInput.offsetWidth;
    els.answerInput.classList.add("bad");
    sound.refuse();
    els.answerInput.select();
  }

  function acceptAnswer(hit, raw) {
    const run = state.run;
    const c = run.current;
    c.locked = true;
    stopTimer();
    const beforeZone = zoneFor(run.depth).name;
    run.points += hit.s;
    run.depth = run.points * 10;
    const afterZone = zoneFor(run.depth).name;
    let refilled = false;
    if (run.mode === "endless" && hit.s === 100 && run.tanks < MAX_TANKS) {
      run.tanks += 1;
      refilled = true;
      renderTanks(true);
    }
    run.results.push({ q: c.p.q, cat: c.p.cat, answer: hit.a, raw, score: hit.s, fuzzy: !!hit.fuzzy });
    renderPromptSegs(run);
    els.answerInput.classList.remove("bad");
    els.feedback.className = "feedback good";
    els.feedback.textContent = "Accepted. " + (hit.fuzzy ? "Close spelling forgiven." : "");
    sound.accept(hit.s);
    animateDepth(state.cameraDepth, run.depth);
    showTier(hit, refilled, beforeZone !== afterZone ? afterZone : null);
  }

  function finishMiss(reason) {
    const run = state.run;
    const c = run && run.current;
    if (!c || c.locked) return;
    c.locked = true;
    stopTimer();
    const raw = els.answerInput.value.trim();
    run.results.push({ q: c.p.q, cat: c.p.cat, answer: raw || null, score: 0, miss: reason });
    renderPromptSegs(run);
    if (run.mode === "endless") {
      run.tanks = Math.max(0, run.tanks - 1);
      renderTanks();
      sound.loseTank();
    } else {
      sound.timeout();
    }
    els.feedback.className = "feedback bad";
    els.feedback.textContent = reason === "passed"
      ? "Passed. The current carries you on."
      : "Out of time. The current carries you on.";
    setTimeout(() => {
      if (state.run !== run) return;
      run.index += 1;
      advance();
    }, 850);
  }

  function passPrompt() {
    const run = state.run;
    if (!run || !run.current || run.current.locked) return;
    sound.click();
    finishMiss("passed");
  }

  function onTimeUp() {
    const run = state.run;
    const c = run && run.current;
    if (!c || c.locked) return;
    const raw = els.answerInput.value.trim();
    if (raw) {
      const hit = findAnswer(c.p, raw);
      if (hit) { acceptAnswer(hit, raw); return; }
    }
    finishMiss("time");
  }

  function advance() {
    const run = state.run;
    if (!run || run.done) return;
    if (run.mode === "classic" && run.index >= CLASSIC_PROMPTS) { endRun(); return; }
    if (run.mode === "endless" && run.tanks <= 0) { endRun(); return; }
    nextPrompt();
  }

  /* ---------------- tier reveal ---------------- */
  function showTier(hit, refilled, newZone) {
    const run = state.run;
    const t = TIERS[hit.s];
    els.tierCard.style.setProperty("--tier-color", t.color);
    els.tierKicker.hidden = true;
    els.tierName.textContent = t.name;
    els.tierPoints.textContent = "+" + hit.s + " PTS";
    els.tierMetres.textContent = fmt(hit.s * 10) + "m";
    if (els.tierGain) els.tierGain.textContent = "+" + fmt(hit.s * 10);
    els.tierAnswer.textContent = "“" + hit.a + "”";
    const lit = Math.max(1, 6 - SCORE_ORDER.indexOf(hit.s));
    if (els.tierMeter) {
      [...els.tierMeter.querySelectorAll("i")].forEach((pip, i) => {
        pip.toggleAttribute("data-lit", i < lit);
      });
    }
    let note = t.note;
    if (newZone) note += " You crossed into the " + newZone + ".";
    if (refilled) note += " One tank of air refilled.";
    els.tierNote.textContent = note;

    clearTimeout(state.revealDelay);
    clearTimeout(state.overlayTimer);
    state.overlayOpen = false;
    els.tierOverlay.hidden = true;
    els.game.classList.add("revealing");
    els.answerInput.blur();

    state.revealDelay = setTimeout(() => {
      if (!run || state.run !== run || run.done) return;
      els.tierOverlay.hidden = false;
      state.overlayOpen = true;
      setTimeout(() => { try { els.tierNext.focus({ preventScroll: true }); } catch (e) {} }, 30);
    }, 220);
  }

  function closeTier(go) {
    clearTimeout(state.revealDelay);
    clearTimeout(state.overlayTimer);
    state.overlayOpen = false;
    els.tierOverlay.hidden = true;
    els.game.classList.remove("revealing");
    els.promptCard.classList.remove("accept", "shake");
    if (go && state.run && !state.run.done) {
      state.run.index += 1;
      advance();
    }
  }

  /* ---------------- end of run ---------------- */
  function endRun() {
    const run = state.run;
    if (!run || run.done) return;
    run.done = true;
    stopTimer();
    closeTier(false);
    const prev = save.best[run.mode] || 0;
    const isBest = run.depth > prev;
    if (isBest) save.best[run.mode] = run.depth;
    save.runs += 1;
    save.history.unshift({ mode: run.mode, depth: run.depth, points: run.points, at: Date.now() });
    save.history = save.history.slice(0, 10);
    persist();
    updateBest();
    renderResults(run, isBest);
    showScreen("results");
    sound.finish(isBest && run.depth > 0);
  }

  function resultTitle(run) {
    if (run.mode === "classic") {
      if (run.depth >= 7000) return "Trench floor. A perfect classic dive.";
      if (run.depth >= 4000) return "The abyss looked back.";
      if (run.depth >= 1000) return "Midnight, and still sinking.";
      if (run.depth >= 200) return "You found the twilight.";
      return "The krill stayed near the surface.";
    }
    if (run.depth >= 11000) return "You left the map behind.";
    if (run.depth >= 6000) return "The trenches took your last tank.";
    if (run.depth >= 1000) return "Midnight. Out of air.";
    if (run.depth >= 200) return "The twilight took your last tank.";
    return "The surface kept you.";
  }

  function renderResults(run, isBest) {
    els.resultEyebrow.textContent = run.mode === "classic" ? "Classic dive complete" : "Endless dive over";
    els.resultDepth.textContent = fmt(run.depth);
    els.resultTitle.textContent = resultTitle(run);
    const accepted = run.results.filter((r) => r.score > 0).length;
    els.resultSub.textContent = `${fmt(run.points)} points · ${accepted} accepted of ${run.results.length} prompts · ${zoneFor(run.depth).name}`;
    els.newBest.hidden = !isBest || run.depth <= 0;
    const frag = document.createDocumentFragment();
    run.results.forEach((r, i) => {
      const row = document.createElement("div");
      row.className = "result-row";
      if (r.score) row.style.setProperty("--tier-color", TIERS[r.score].color);
      const num = document.createElement("span");
      num.className = "num";
      num.textContent = String(i + 1).padStart(2, "0");
      const q = document.createElement("span");
      q.className = "q";
      const b = document.createElement("b");
      b.textContent = r.q;
      const small = document.createElement("small");
      if (r.score) {
        small.textContent = r.answer + (r.fuzzy ? " · spelling forgiven" : "");
      } else {
        small.className = "miss";
        small.textContent = r.miss === "passed" ? "Passed" : (r.answer ? `“${r.answer}” · not in bank` : "Timed out");
      }
      q.append(b, small);
      const score = document.createElement("span");
      score.className = "score";
      const sb = document.createElement("b");
      sb.textContent = r.score ? `${r.score} pts` : "—";
      const ss = document.createElement("small");
      ss.textContent = r.score ? TIERS[r.score].name : "no answer";
      score.append(sb, ss);
      row.append(num, q, score);
      frag.append(row);
    });
    els.resultGrid.replaceChildren(frag);
  }

  /* ---------------- menu ---------------- */
  function goMenu() {
    closeTier(false);
    stopTimer();
    state.run = null;
    state.cameraDepth = 0;
    state.cameraTarget = 0;
    document.body.dataset.zone = "sunlight";
    setDepthDisplay(0);
    updateBest();
    els.depthGoal.textContent = "7,000 m";
    showScreen("menu");
  }

  /* ---------------- copy result ---------------- */
  function copyResult() {
    const run = state.run;
    if (!run) return;
    const lines = [
      "KRILLION — " + (run.mode === "classic" ? "Classic" : "Endless") + " dive",
      "Depth: " + fmt(run.depth) + " m (" + fmt(run.points) + " points)",
      "",
    ];
    run.results.forEach((r, i) => {
      const tier = r.score ? TIERS[r.score].name + " (" + r.score + ")" : (r.miss === "passed" ? "Passed" : "Timed out");
      lines.push(`${i + 1}. ${r.q} — ${r.answer || "—"} — ${tier}`);
    });
    const text = lines.join("\n");
    const done = () => {
      const old = els.copyBtn.textContent;
      els.copyBtn.textContent = "Copied";
      setTimeout(() => { els.copyBtn.textContent = old; }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      done();
    } catch (e) { /* ignore */ }
  }

  /* ---------------- ambience ---------------- */
  function buildAmbience() {
    const bubbles = $("bubbles");
    const snow = $("snow");
    if (!bubbles || !snow) return;
    let html = "";
    for (let i = 0; i < 24; i++) {
      const size = (2 + Math.random() * 12).toFixed(1);
      html += `<span style="left:${(Math.random() * 100).toFixed(1)}%;width:${size}px;height:${size}px;animation-duration:${(14 + Math.random() * 22).toFixed(1)}s;animation-delay:${(-Math.random() * 30).toFixed(1)}s"></span>`;
    }
    bubbles.innerHTML = html;
    html = "";
    for (let i = 0; i < 46; i++) {
      const size = (1 + Math.random() * 1.8).toFixed(1);
      html += `<span style="left:${(Math.random() * 100).toFixed(1)}%;width:${size}px;height:${size}px;animation-duration:${(22 + Math.random() * 38).toFixed(1)}s;animation-delay:${(-Math.random() * 50).toFixed(1)}s"></span>`;
    }
    snow.innerHTML = html;
  }

  function resizeOcean() {
    const c = els.oceanCanvas;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const scale = 3;
    const width = Math.max(120, Math.round(rect.width / scale));
    const height = Math.max(120, Math.round(rect.height / scale));
    if (c.width !== width || c.height !== height) {
      c.width = width;
      c.height = height;
    }
  }
  function startOcean() {
    if (!els.oceanCanvas) return;
    resizeOcean();
    if (state.oceanRaf) return;
    state.oceanLast = 0;
    const loop = (now) => {
      state.oceanRaf = requestAnimationFrame(loop);
      if (now - state.oceanLast < 33) return;
      state.oceanLast = now;
      drawOcean(now);
    };
    state.oceanRaf = requestAnimationFrame(loop);
  }
  function stopOcean() {
    if (state.oceanRaf) cancelAnimationFrame(state.oceanRaf);
    state.oceanRaf = 0;
  }
  function oceanHash(n) {
    n = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
    n ^= n >>> 13;
    n = Math.imul(n, 0xc2b2ae35);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function oceanLerp(a, b, t) { return a + (b - a) * t; }

  function oceanWall(y, side, scroll, W, depth) {
    const sx = W / 281;
    const row = Math.floor((y + scroll * 0.82) / 4);
    const phase = side ? 1.7 : 0;
    const wobble = Math.sin(row * 0.12 + phase) * 0.5 + Math.sin(row * 0.039 + phase * 2.3) * 0.5;
    const rough = oceanHash(row * 7 + (side ? 131 : 17));
    let width = 12 + W * 0.04 + (wobble + 1) * W * 0.042 + rough * W * 0.034;
    // Broad stepped buttresses give the walls live-style rock shelves.
    const cycle = 15;
    const local = (row + (side ? 6 : 2)) % cycle;
    if (local < 4) {
      const band = Math.floor((row + (side ? 6 : 2)) / cycle);
      width += (10 + oceanHash(band * 17 + (side ? 3 : 1)) * 20) * sx;
    }
    if (Math.sin(row * 0.031 + phase * 1.4) > 0.66) width += (5 + oceanHash(row * 3) * 9) * sx;
    if (depth > 900) width += Math.min(14, (depth - 900) / 600);
    return Math.max(5, Math.min(W * 0.37, Math.round(width)));
  }

  function oceanCoral(ctx, x, y, color, size, dir) {
    const s = Math.max(5, Math.round(size));
    ctx.fillStyle = color;
    ctx.fillRect(x, y - s, 2, s);
    ctx.fillRect(x + dir * 2, y - Math.round(s * 0.55), 4, 2);
    ctx.fillRect(x + dir * 4, y - Math.round(s * 0.45), 2, 2);
    ctx.fillRect(x + dir * 2, y - Math.round(s * 0.78), 2, 2);
    ctx.fillRect(x + dir * 5, y - Math.round(s * 0.76), 3, 2);
    ctx.fillRect(x - dir * 3, y - Math.round(s * 0.32), 3, 2);
    ctx.fillRect(x + dir, y - s, 2, 2);
    ctx.fillStyle = "rgba(200,255,245,.45)";
    ctx.fillRect(x + 1, y - s + 1, 1, 2);
    ctx.fillStyle = "#123f4d";
    ctx.fillRect(x - 1, y - 1, 5, 2);
  }

  function oceanKelp(ctx, x, baseY, height, sway, color) {
    ctx.fillStyle = color;
    for (let i = 0; i < height; i += 4) {
      const xx = x + Math.round(Math.sin(sway + i * 0.12) * 2);
      ctx.fillRect(xx, baseY - i, 2, 3);
      if (i % 8 === 0) ctx.fillRect(xx + 2, baseY - i - 1, 3, 2);
    }
  }

  function oceanSurface(ctx, W, H, surfaceY, t) {
    if (surfaceY < -40 || surfaceY > H + 10) return;
    const sx = W / 281;
    if (surfaceY > 0) {
      for (let y = 0; y < surfaceY; y += 4) {
        const k = y / Math.max(1, surfaceY);
        ctx.fillStyle = `rgb(${Math.round(46 + 82 * k)},${Math.round(182 + 43 * k)},${Math.round(222 + 22 * k)})`;
        ctx.fillRect(0, y, W, 4);
      }
      const cloud = (x, y, s) => {
        ctx.fillStyle = "rgba(232,255,255,.86)";
        ctx.fillRect(Math.round(x), y + 4, s * 4, 3);
        ctx.fillRect(Math.round(x + s), y, s * 2, 4);
        ctx.fillRect(Math.round(x + s * 2), y - 3, s, 3);
        ctx.fillStyle = "rgba(160,225,242,.45)";
        ctx.fillRect(Math.round(x), y + 7, s * 4, 2);
      };
      const drift = (t * 2.4) % 360;
      const cloudY = surfaceY - 52;
      if (cloudY > -10) {
        cloud((W * 0.52 - drift * sx + W + 80) % (W + 80), cloudY, 4);
        cloud(W * 0.76, cloudY + 17, 3);
        cloud(W * 0.22, cloudY + 10, 3);
      }
    }
    if (surfaceY < -8) return;
    const base = Math.round(surfaceY);

    const islandX = Math.round(W * 0.05);
    ctx.fillStyle = "#0a4a55";
    ctx.fillRect(islandX, base - 5, Math.round(70 * sx), 6);
    ctx.fillStyle = "#2a7d58";
    ctx.fillRect(islandX + 4, base - 11, Math.round(58 * sx), 7);
    ctx.fillStyle = "#5da36b";
    ctx.fillRect(islandX + 9, base - 14, Math.round(30 * sx), 3);
    ctx.fillStyle = "#d7b96a";
    ctx.fillRect(islandX + 2, base - 4, Math.round(66 * sx), 2);
    const palm = (x, h) => {
      ctx.fillStyle = "#5f4430";
      ctx.fillRect(x, base - h, 3, h);
      ctx.fillStyle = "#1e684a";
      ctx.fillRect(x - 8, base - h - 2, 11, 3);
      ctx.fillRect(x + 2, base - h - 5, 10, 3);
      ctx.fillRect(x - 3, base - h - 8, 8, 3);
      ctx.fillStyle = "#8cca72";
      ctx.fillRect(x - 1, base - h - 2, 5, 2);
    };
    palm(islandX + 18, 24);
    palm(islandX + 36, 18);

    const lx = islandX + 51;
    ctx.fillStyle = "#e8f1ff"; ctx.fillRect(lx, base - 32, 8, 29);
    ctx.fillStyle = "#ff5d8f"; ctx.fillRect(lx, base - 32, 8, 5); ctx.fillRect(lx, base - 21, 8, 5);
    ctx.fillStyle = "#ffd166"; ctx.fillRect(lx + 3, base - 38, 3, 6);
    ctx.fillStyle = "#0b1526"; ctx.fillRect(lx + 3, base - 27, 3, 3);

    const bx = Math.round(W * 0.45);
    ctx.fillStyle = "#e8f1ff"; ctx.fillRect(bx, base - 9, 44, 7);
    ctx.fillStyle = "#4de3ff"; ctx.fillRect(bx + 4, base - 6, 36, 3);
    ctx.fillStyle = "#0b1526"; ctx.fillRect(bx + 12, base - 17, 20, 8);
    ctx.fillStyle = "#93a7c9"; ctx.fillRect(bx + 16, base - 14, 6, 4);
    ctx.fillStyle = "#e8f1ff"; ctx.fillRect(bx + 45, base - 34, 2, 25);
    ctx.fillStyle = "#ff5d8f"; ctx.fillRect(bx + 47, base - 34, 11, 7);
    ctx.fillStyle = "#ffd166"; ctx.fillRect(bx + 50, base - 32, 3, 3);
    ctx.fillStyle = "#0b1526"; ctx.fillRect(bx - 2, base - 2, 48, 3);

    for (let x = -12; x < W + 12; x += 24) {
      const y = base - 2 + Math.round(Math.sin(t * 1.7 + x * 0.09) * 1.5);
      ctx.fillStyle = "rgba(230,255,255,.78)";
      ctx.fillRect(x + ((t * 8) % 24), y, 12, 2);
      ctx.fillStyle = "rgba(10,90,120,.55)";
      ctx.fillRect(x + 6, y + 3, 8, 1);
    }
  }

  function drawReefBackdrop(ctx, W, H, scroll, night) {
    const sx = W / 281;
    const alpha = 0.34 * (1 - night * 0.42);
    for (let i = 0; i < 9; i++) {
      const y = ((i * 83 + 23 - scroll * 0.3) % (H + 150) + H + 150) % (H + 150) - 75;
      const side = i & 1;
      const w = Math.round((16 + oceanHash(i * 17 + 3) * 34) * sx);
      const inset = Math.round((10 + oceanHash(i * 29 + 7) * 22) * sx);
      const h = Math.round((34 + oceanHash(i * 31 + 11) * 46) * (H / 290));
      const x = side ? W - inset - w : inset;
      ctx.fillStyle = `rgba(8, 41, 61, ${alpha.toFixed(3)})`;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = `rgba(102, 169, 154, ${(alpha * 0.54).toFixed(3)})`;
      ctx.fillRect(x + 2, y, Math.max(2, w - 4), 2);
      ctx.fillStyle = `rgba(3, 23, 38, ${(alpha * 0.72).toFixed(3)})`;
      ctx.fillRect(x + (side ? Math.round(w * 0.45) : 0), y + Math.round(h * 0.54), Math.round(w * 0.55), 2);
      if (oceanHash(i * 41 + 9) > 0.58) {
        ctx.fillStyle = `rgba(123, 164, 92, ${(alpha * 0.68).toFixed(3)})`;
        ctx.fillRect(x + Math.round(w * 0.22), y - 2, Math.max(3, Math.round(w * 0.38)), 2);
      }
    }
  }

  function drawLightShafts(ctx, W, H, surfaceY, depth, t) {
    const fade = Math.max(0, 1 - depth / 520);
    if (fade <= 0) return;
    const top = Math.max(0, surfaceY);
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const x = ((i * W) / 5 + Math.sin(t * 0.14 + i * 1.3) * W * 0.035 + W) % W;
      ctx.fillStyle = `rgba(176, 248, 245, ${(0.028 + i * 0.005) * fade})`;
      ctx.beginPath();
      ctx.moveTo(x - W * 0.03, top);
      ctx.lineTo(x + W * 0.04, top);
      ctx.lineTo(x + W * 0.14, H);
      ctx.lineTo(x + W * 0.06, H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function oceanFish(ctx, x, y, dir, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 4, 1);
    ctx.fillRect(x + (dir > 0 ? -2 : 4), y, 2, 1);
    ctx.fillRect(x + (dir > 0 ? 1 : 2), y - 1, 1, 1);
    ctx.fillStyle = "rgba(233,255,255,.75)";
    ctx.fillRect(x + (dir > 0 ? 3 : 0), y, 1, 1);
  }

  function drawFishSchools(ctx, W, H, t, scroll, night) {
    const colors = night > 0.35 ? ["#75c5c6", "#8aa8d1", "#c18fb0"] : ["#86d8c2", "#c8df75", "#efb477"];
    for (let school = 0; school < 4; school++) {
      const dir = school % 2 ? -1 : 1;
      const travel = (t * (2.2 + school * 0.35) + school * 41) % (W * 0.19);
      const baseX = dir > 0 ? W * 0.08 + travel : W * 0.92 - travel;
      const baseY = ((school * 67 + 44 - scroll * 0.32 + t * 1.7) % (H + 80) + H + 80) % (H + 80) - 40;
      for (let f = 0; f < 3; f++) {
        const x = Math.round(baseX + dir * f * 8);
        const y = Math.round(baseY + (f % 2) * 3);
        oceanFish(ctx, x, y, dir, colors[school % colors.length]);
      }
    }
  }

  function drawOcean(now) {
    const c = els.oceanCanvas;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const W = c.width, H = c.height;
    const t = now / 1000;
    const depth = Number.isFinite(state.cameraDepth) ? state.cameraDepth : 0;
    const scroll = depth * 0.92;
    const surfaceY = Math.round(H * 0.235 - scroll);
    const shade = Math.min(1, depth / 2200);
    const night = Math.min(1, Math.max(0, depth - 700) / 2600);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);

    const top = Math.max(0, surfaceY);
    for (let y = 0; y < H; y += 4) {
      const k = Math.max(0, (y - top) / Math.max(1, H - top));
      const mix = Math.min(1, shade * (0.45 + k * 0.55));
      const r = Math.round(oceanLerp(30 - k * 18, 2, mix));
      const g = Math.round(oceanLerp(154 - k * 52, 28, mix));
      const b = Math.round(oceanLerp(190 - k * 50, 54, mix));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, y, W, 4);
    }

    ctx.save();
    const glow = ctx.createRadialGradient(W * 0.5, Math.max(0, surfaceY) + H * 0.18, 4, W * 0.5, H * 0.4, Math.max(W, H) * 0.72);
    glow.addColorStop(0, "rgba(210,253,255,.16)");
    glow.addColorStop(0.42, "rgba(130,235,250,.065)");
    glow.addColorStop(1, "rgba(20,120,150,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    drawReefBackdrop(ctx, W, H, scroll, night);
    drawLightShafts(ctx, W, H, surfaceY, depth, t);

    const start = Math.max(0, Math.ceil((surfaceY + 6) / 4) * 4);
    ctx.save();
    ctx.globalAlpha = 0.25;
    for (let y = start; y < H; y += 6) {
      const row = Math.floor((y + scroll * 0.55) / 6);
      const left = Math.round(12 + (Math.sin(row * 0.09) * 0.5 + 0.5) * W * 0.12 + oceanHash(row * 5) * W * 0.05);
      const right = Math.round(10 + (Math.cos(row * 0.075 + 1.2) * 0.5 + 0.5) * W * 0.13 + oceanHash(row * 9 + 4) * W * 0.04);
      ctx.fillStyle = "#082e45";
      ctx.fillRect(0, y, left, 6);
      ctx.fillRect(W - right, y, right, 6);
    }
    ctx.restore();

    const sx = W / 281;
    for (let y = start; y < H; y += 4) {
      const row = Math.floor((y + scroll) / 4);
      const lw = oceanWall(y, false, scroll, W, depth);
      const rw = oceanWall(y, true, scroll, W, depth);
      const band = row % 8;
      const lift = band === 0 ? 10 : band === 4 ? 4 : 0;
      const rockR = Math.round(oceanLerp(23, 5, night));
      const rockG = Math.round(oceanLerp(80, 23, night));
      const rockB = Math.round(oceanLerp(99, 39, night));
      ctx.fillStyle = `rgb(${rockR + lift},${rockG + lift},${rockB + lift})`;
      ctx.fillRect(0, y, lw, 4);
      ctx.fillRect(W - rw, y, rw, 4);

      ctx.fillStyle = `rgba(${Math.round(104 - night * 62)},${Math.round(180 - night * 92)},${Math.round(170 - night * 78)},.55)`;
      ctx.fillRect(Math.max(0, lw - 3), y, 3, 4);
      ctx.fillRect(W - rw, y, 3, 4);

      if (band === 4) {
        ctx.fillStyle = "rgba(5,29,43,.5)";
        ctx.fillRect(0, y + 1, Math.max(0, lw - 4), 1);
        ctx.fillRect(W - rw + 4, y + 1, Math.max(0, rw - 4), 1);
      }
      if (oceanHash(row * 11 + 5) > 0.58) {
        ctx.fillStyle = night > 0.35 ? "rgba(107,208,196,.2)" : "rgba(128,185,148,.34)";
        ctx.fillRect(2 + Math.floor(oceanHash(row * 3) * Math.max(1, lw - 8)), y, 4, 2);
        ctx.fillRect(W - rw + 3 + Math.floor(oceanHash(row * 17) * Math.max(1, rw - 8)), y, 4, 2);
      }
      if (oceanHash(row * 23 + 9) > 0.88) {
        ctx.fillStyle = "rgba(190,126,82,.5)";
        ctx.fillRect(3 + Math.floor(oceanHash(row * 5) * Math.max(1, lw - 7)), y, 3, 4);
        ctx.fillRect(W - rw + 4 + Math.floor(oceanHash(row * 29) * Math.max(1, rw - 8)), y, 3, 4);
      }
      if (oceanHash(row * 31 + 1) > 0.78) {
        ctx.fillStyle = "rgba(111,151,82,.62)";
        ctx.fillRect(Math.max(0, lw - 7), y, 4, 4);
        ctx.fillRect(W - rw + 3, y, 4, 4);
      }
    }

    // Chunky rock plates break up the wall silhouette and hold the reef life.
    const plateStart = Math.floor((start + scroll) / 30) - 1;
    for (let i = plateStart; i * 30 - scroll < H + 30; i++) {
      const sy = i * 30 - scroll;
      if (sy < start - 12 || sy > H) continue;
      for (let side = 0; side < 2; side++) {
        const right = side === 1;
        if (oceanHash(i * 29 + (right ? 5 : 1)) < 0.2) continue;
        const wall = oceanWall(Math.max(start, Math.min(H - 1, sy + 8)), right, scroll, W, depth);
        const ledge = Math.round((12 + oceanHash(i * 37 + side) * 24) * sx);
        const x = right ? W - wall - ledge + 2 : Math.max(0, wall - 2);
        const y = Math.max(start, sy);
        const h = Math.max(5, Math.round((6 + oceanHash(i * 41 + side) * 8) * (H / 290)));
        const pr = Math.round(oceanLerp(43, 12, night));
        const pg = Math.round(oceanLerp(94, 35, night));
        const pb = Math.round(oceanLerp(103, 47, night));
        ctx.fillStyle = "rgba(4,24,36,.55)";
        ctx.fillRect(x + (right ? 0 : 2), y + h, Math.max(0, ledge - 2), 2);
        ctx.fillStyle = `rgb(${pr},${pg},${pb})`;
        ctx.fillRect(x, y, ledge, h);
        ctx.fillStyle = `rgba(${Math.round(132 - night * 58)},${Math.round(194 - night * 86)},${Math.round(174 - night * 76)},.58)`;
        ctx.fillRect(x, y, ledge, 2);
        const crown = Math.max(3, Math.round(ledge * 0.44));
        const crownX = right ? x + ledge - crown : x;
        ctx.fillStyle = `rgb(${pr + 6},${pg + 10},${pb + 8})`;
        ctx.fillRect(crownX, y - 3, crown, 3);
        ctx.fillStyle = `rgba(${Math.round(158 - night * 60)},${Math.round(212 - night * 92)},${Math.round(194 - night * 84)},.42)`;
        ctx.fillRect(crownX, y - 3, crown, 1);
        if (oceanHash(i * 43 + side) > 0.45) {
          ctx.fillStyle = "rgba(112,151,82,.7)";
          ctx.fillRect(x + Math.round(ledge * 0.18), y - 2, Math.max(3, Math.round(ledge * 0.45)), 3);
        }
      }
    }

    const coralColors = ["#e09a5f", "#dd7894", "#b394df", "#cec06a", "#80b261", "#d86767"];
    const coralStart = Math.floor((start + scroll) / 4 / 6) * 6;
    for (let row = coralStart; row * 4 - scroll < H + 30; row += 6) {
      const sy = row * 4 - scroll;
      if (sy < start + 7 || sy > H + 20) continue;
      for (let side = 0; side < 2; side++) {
        const right = side === 1;
        const key = row * 47 + (right ? 11 : 3);
        if (oceanHash(key) < 0.24) continue;
        const wall = oceanWall(sy, right, scroll, W, depth);
        const x = right ? W - wall - 1 : wall + 1;
        const color = coralColors[Math.floor(oceanHash(key + 2) * coralColors.length)];
        const size = Math.round((9 + oceanHash(key + 4) * 18) * sx);
        oceanCoral(ctx, x, sy, color, size, right ? -1 : 1);
        if (oceanHash(key + 7) > 0.54) {
          const kx = right ? W - wall - 6 : wall + 4;
          oceanKelp(ctx, kx, sy + 4, Math.round((16 + oceanHash(key + 9) * 26) * (H / 290)), row + t * 0.6, "rgba(91,139,78,.8)");
        }
        if (oceanHash(key + 13) > 0.72) {
          ctx.fillStyle = "#e6b968";
          for (let n = 0; n < 3; n++) {
            ctx.fillRect(x + (right ? -3 - n * 2 : 3 + n * 2), sy - Math.round((5 + n * 3) * sx), 2, Math.round((9 + n * 2) * sx));
          }
        }
        if (oceanHash(key + 21) > 0.64) {
          const extraColor = coralColors[Math.floor(oceanHash(key + 23) * coralColors.length)];
          oceanCoral(ctx, x + (right ? -6 : 6), sy + 3, extraColor, Math.max(5, Math.round(size * 0.62)), right ? -1 : 1);
        }
      }
    }

    drawFishSchools(ctx, W, H, t, scroll, night);

    ctx.save();
    for (let i = 0; i < 38; i++) {
      const x = (i * 37 + 13 + Math.sin(t * 0.24 + i) * 5 + W) % W;
      const y = (H - ((t * (4 + (i % 5)) + i * 29 - scroll * 0.22) % (H + 40)) + H + 40) % (H + 40);
      if (y < start + 4) continue;
      ctx.fillStyle = `rgba(195,250,255,${0.16 + (i % 4) * 0.07})`;
      const size = i % 3 === 0 ? 2 : 1;
      ctx.fillRect(Math.round(x), Math.round(y), size, size);
    }
    ctx.restore();

    const tint = Math.min(0.44, Math.max(0, depth - 80) / 1500);
    if (tint > 0.004) {
      ctx.fillStyle = `rgba(2,17,35,${tint.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (depth > 900) {
      ctx.save();
      ctx.fillStyle = "rgba(120,250,255,.45)";
      for (let i = 0; i < 12; i++) {
        const gx = Math.round((i * 61 + 19 + Math.sin(t * 0.3 + i) * 4 + W) % W);
        const gy = Math.round((i * 43 + 31 + Math.cos(t * 0.2 + i) * 3 + H) % H);
        ctx.fillRect(gx, gy, i % 3 === 0 ? 2 : 1, 1);
      }
      ctx.restore();
    }

    if (!state.overlayOpen && !(els.game && els.game.classList.contains("revealing"))) {
      const kx = Math.round(W * 0.27 + Math.sin(t * 0.8) * 3);
      const ky = Math.round(H * 0.45 + Math.sin(t * 1.25) * 2);
      ctx.fillStyle = "rgba(185,246,255,.25)";
      ctx.fillRect(kx - 6, ky - 9, 2, 2);
      ctx.fillRect(kx - 9, ky - 15, 1, 1);
      ctx.fillStyle = "#ff7a9c";
      ctx.fillRect(kx, ky, 10, 4);
      ctx.fillRect(kx + 9, ky + 1, 4, 3);
      ctx.fillRect(kx - 2, ky + 1, 3, 2);
      ctx.fillRect(kx - 4, ky, 2, 2);
      ctx.fillStyle = "#ffc1d1";
      ctx.fillRect(kx + 2, ky + 1, 3, 1);
      ctx.fillStyle = "#07111f";
      ctx.fillRect(kx + 10, ky + 1, 1, 1);
      ctx.fillStyle = "#ff7a9c";
      ctx.fillRect(kx + 1, ky + 4, 2, 3);
      ctx.fillRect(kx + 6, ky + 4, 2, 3);
    }

    oceanSurface(ctx, W, H, surfaceY, t);
  }

  function buildTierTable() {
    const frag = document.createDocumentFragment();
    for (const score of SCORE_ORDER) {
      const row = document.createElement("div");
      row.className = "tier-row";
      row.style.setProperty("--tier-color", TIERS[score].color);
      const left = document.createElement("span");
      const dot = document.createElement("i");
      dot.className = "dot";
      const em = document.createElement("em");
      em.textContent = TIERS[score].name;
      left.append(dot, em);
      const b = document.createElement("b");
      b.textContent = String(score);
      row.append(left, b);
      frag.append(row);
    }
    els.tierTable.replaceChildren(frag);
  }

  /* ---------------- input events ---------------- */
  function bind() {
    document.querySelectorAll(".mode-card").forEach((btn) => {
      btn.addEventListener("click", () => startRun(btn.dataset.mode));
    });
    els.diveBtn.addEventListener("click", () => submitAnswer(false));
    els.passBtn.addEventListener("click", passPrompt);
    els.answerInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); submitAnswer(false); }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && state.overlayOpen) { e.preventDefault(); closeTier(true); }
    });
    els.tierNext.addEventListener("click", () => closeTier(true));
    els.quitBtn.addEventListener("click", goMenu);
    els.homeLink.addEventListener("click", goMenu);
    els.menuBtn.addEventListener("click", goMenu);
    els.againBtn.addEventListener("click", () => startRun(state.lastMode));
    els.copyBtn.addEventListener("click", copyResult);
    [els.soundBtn, els.gameSoundBtn].forEach((btn) => {
      if (btn) btn.addEventListener("click", toggleSound);
    });
    syncSoundUI();
    window.addEventListener("resize", resizeOcean);
  }

  /* ---------------- boot ---------------- */
  function init() {
    if (!bank || !Array.isArray(bank.prompts) || !bank.prompts.length) {
      if (els.loader) {
        els.loader.classList.remove("gone");
        els.loader.querySelector(".loader-title").textContent = "Answer bank missing";
        els.loaderSub.textContent = "Keep data.js next to index.html, then reload.";
        els.loader.querySelector(".loader-track").hidden = true;
      }
      return;
    }
    const started = performance.now();
    PROMPTS = bank.prompts.map((row, i) => {
      const p = { i, q: row[0], cat: row[1] || "Other / Abstract", groups: row[2] || [] };
      let total = 0, weighted = 0;
      p.groups.forEach((g, ti) => {
        const n = countLines(g);
        total += n;
        weighted += n * SCORE_ORDER[ti];
      });
      p.total = total;
      p.avg = total ? weighted / total : 0;
      p.lookup = null;
      p.buckets = null;
      return p;
    });
    DIFFICULTY = PROMPTS.map((p) => p.i).sort((a, b) => PROMPTS[a].avg - PROMPTS[b].avg);

    buildTierTable();
    buildAmbience();
    bind();
    updateBest();
    setDepthDisplay(0);

    const meta = bank.meta || {};
    const nPrompts = meta.prompts || PROMPTS.length;
    const nAnswers = meta.answers || PROMPTS.reduce((s, p) => s + p.total, 0);
    setText(els.bankPrompts, fmt(nPrompts));
    setText(els.bankAnswers, fmt(nAnswers));
    setText(els.howPrompts, fmt(nPrompts));
    setText(els.howAnswers, fmt(nAnswers));
    els.loaderSub.textContent = `${fmt(nAnswers)} accepted answers, ready offline.`;
    if (bank.meta && bank.meta.generated) {
      els.loaderSub.textContent += ` Bank dated ${bank.meta.generated}.`;
    }
    if (bank.meta && bank.meta.sources) {
      els.loader.title = bank.meta.sources.join(" · ");
    }

    // test / power-user handle
    window.__krillion = { bank, prompts: PROMPTS, findAnswer, state, startRun, zoneFor };

    const wait = Math.max(0, 450 - (performance.now() - started));
    setTimeout(() => {
      els.loader.classList.add("gone");
      setTimeout(() => { els.loader.hidden = true; }, 600);
    }, wait);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
