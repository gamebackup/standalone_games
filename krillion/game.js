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
    100: { name: "One in a Krillion", color: "#ffd166", note: "The one nobody else reached. In Endless, this buys a tank of air back." },
    85:  { name: "Deep Cut",         color: "#c3a7ff", note: "A specialist's answer. The swarm never got this far." },
    60:  { name: "Rare",             color: "#7bf1d0", note: "Rare air. Most players stop two thoughts earlier." },
    30:  { name: "Schooler",         color: "#9be38a", note: "A solid answer, but the school knows it too." },
    15:  { name: "Too Clever",       color: "#ffb36b", note: "The second thought everyone shares. It feels rarer than it is." },
    10:  { name: "Plankton",         color: "#9fb8c4", note: "The first answer anyone gives. The current barely notices." },
  };
  const SCORE_ORDER = [100, 85, 60, 30, 15, 10];

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
    modeLabel: $("modeLabel"), promptCounter: $("promptCounter"), tanks: $("tanks"), quitBtn: $("quitBtn"),
    depth: $("depth"), zoneName: $("zoneName"), zoneSub: $("zoneSub"), depthFill: $("depthFill"),
    depthThumb: $("depthThumb"), depthGoal: $("depthGoal"), depthCaption: $("depthCaption"),
    promptCard: $("promptCard"), category: $("category"), promptText: $("promptText"),
    answerInput: $("answerInput"), diveBtn: $("diveBtn"), passBtn: $("passBtn"),
    timer: document.querySelector(".timer"), timerFill: $("timerFill"), timerNum: $("timerNum"),
    feedback: $("feedback"), bankCount: $("bankCount"),
    tierOverlay: $("tierOverlay"), tierCard: $("tierCard"), tierKicker: $("tierKicker"),
    tierName: $("tierName"), tierPoints: $("tierPoints"), tierMetres: $("tierMetres"),
    tierAnswer: $("tierAnswer"), tierNote: $("tierNote"), tierNext: $("tierNext"),
    resultEyebrow: $("resultEyebrow"), resultDepth: $("resultDepth"), resultTitle: $("resultTitle"),
    resultSub: $("resultSub"), newBest: $("newBest"), resultGrid: $("resultGrid"),
    againBtn: $("againBtn"), menuBtn: $("menuBtn"), copyBtn: $("copyBtn"),
    tierTable: $("tierTable"),
  };

  const save = loadSave();
  const state = { run: null, raf: 0, depthRaf: 0, overlayTimer: 0, overlayOpen: false, lastMode: "classic" };
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
  function fmt(n) { return Math.round(n).toLocaleString("en-US"); }
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
    els.depthFill.style.width = pct.toFixed(2) + "%";
    els.depthThumb.style.left = pct.toFixed(2) + "%";
  }
  function animateDepth(from, to) {
    cancelAnimationFrame(state.depthRaf);
    const start = performance.now();
    const dur = 900;
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDepthDisplay(from + (to - from) * eased);
      if (t < 1) state.depthRaf = requestAnimationFrame(step);
      else setDepthDisplay(to);
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
      els.timerFill.style.width = ((rem / PROMPT_MS) * 100).toFixed(2) + "%";
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
    els.promptCard.classList.remove("shake", "accept");
    els.feedback.textContent = "";
    els.feedback.className = "feedback";
    els.bankCount.innerHTML = "<b>" + fmt(p.total) + "</b> answers in this bank";
    els.promptCounter.textContent = run.mode === "classic"
      ? `Prompt ${run.index + 1} / ${CLASSIC_PROMPTS}`
      : `Dive ${run.index + 1}`;
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
    els.feedback.textContent = "Not in this bank. Try another angle — or a different spelling.";
    els.promptCard.classList.remove("shake");
    void els.promptCard.offsetWidth;
    els.promptCard.classList.add("shake");
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
    els.promptCard.classList.add("accept");
    els.feedback.className = "feedback good";
    els.feedback.textContent = "Accepted. " + (hit.fuzzy ? "Close spelling forgiven." : "");
    sound.accept(hit.s);
    animateDepth(run.depth - hit.s * 10, run.depth);
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
    const t = TIERS[hit.s];
    els.tierCard.style.setProperty("--tier-color", t.color);
    els.tierKicker.textContent = hit.fuzzy ? "Close spelling accepted" : "Accepted";
    els.tierName.textContent = t.name;
    els.tierPoints.textContent = String(hit.s);
    els.tierMetres.textContent = "+" + fmt(hit.s * 10) + " m";
    els.tierAnswer.textContent = "“" + hit.a + "”";
    let note = t.note;
    if (newZone) note += " You crossed into the " + newZone + ".";
    if (refilled) note += " One tank of air refilled.";
    els.tierNote.textContent = note;
    els.tierOverlay.hidden = false;
    state.overlayOpen = true;
    clearTimeout(state.overlayTimer);
    state.overlayTimer = setTimeout(() => closeTier(true), 4200);
    setTimeout(() => { try { els.tierNext.focus({ preventScroll: true }); } catch (e) {} }, 30);
  }

  function closeTier(go) {
    if (!state.overlayOpen) {
      els.tierOverlay.hidden = true;
      return;
    }
    state.overlayOpen = false;
    clearTimeout(state.overlayTimer);
    els.tierOverlay.hidden = true;
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
    els.soundBtn.addEventListener("click", () => {
      sound.enabled = !sound.enabled;
      save.sound = sound.enabled;
      persist();
      els.soundBtn.setAttribute("aria-pressed", String(sound.enabled));
      els.soundIcon.textContent = sound.enabled ? "♪" : "×";
      if (sound.enabled) { sound.unlock(); sound.click(); }
    });
    els.soundBtn.setAttribute("aria-pressed", String(sound.enabled));
    els.soundIcon.textContent = sound.enabled ? "♪" : "×";
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
    els.bankPrompts.textContent = fmt(nPrompts);
    els.bankAnswers.textContent = fmt(nAnswers);
    els.howPrompts.textContent = fmt(nPrompts);
    els.howAnswers.textContent = fmt(nAnswers);
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
