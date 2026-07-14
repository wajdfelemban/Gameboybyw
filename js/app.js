/* SMLE Smart Study — active recall + spaced repetition on a local question bank.
   All progress is stored in localStorage; no server needed. */
(() => {
"use strict";

const DAY = 24 * 60 * 60 * 1000;
// Leitner-style boxes; index = box number. Box 0 means "relearn today".
const BOX_INTERVALS = [0, 1, 3, 7, 14, 30, 60];
const MAX_BOX = BOX_INTERVALS.length - 1;
const MASTER_BOX = 5; // box >= this counts as "mastered"
const STORE_KEY = "smle_study_v1";

/* ---------------- persistent state ---------------- */
const defaultState = () => ({ q: {}, history: [], settings: { buzz: false, theme: null } });

let S = defaultState();
try {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) S = Object.assign(defaultState(), JSON.parse(raw));
} catch (e) { /* corrupted store — start fresh */ }

const saveLocal = () => localStorage.setItem(STORE_KEY, JSON.stringify(S));
const save = () => {
  saveLocal();
  // notify the optional cloud-sync layer (Firebase) of a local change
  if (window.__smle && typeof window.__smle.onChange === "function") window.__smle.onChange();
};
const qs = id => S.q[id] || (S.q[id] = { box: 0, due: 0, seen: 0, right: 0, wrong: 0, streak: 0, flag: false, lastWrong: false, last: 0 });
const qsPeek = id => S.q[id]; // may be undefined (unseen)

/* ---------------- SRS scheduling ---------------- */
function grade(id, correct, selfGrade) {
  const st = qs(id);
  st.seen++;
  st.last = Date.now();
  if (correct) { st.right++; st.streak++; } else { st.wrong++; st.streak = 0; }
  st.lastWrong = !correct;

  let box = st.box;
  if (!correct) box = 1;
  else switch (selfGrade) {
    case "again": box = 1; break;
    case "hard":  box = Math.max(1, box); break;          // stay put
    case "easy":  box = Math.min(MAX_BOX, box + 2); break;
    default:      box = Math.min(MAX_BOX, box + 1);       // "good"
  }
  st.box = box;
  st.due = Date.now() + BOX_INTERVALS[box] * DAY;
  save();
}

const isDue = id => { const st = qsPeek(id); return st && st.seen > 0 && st.due <= Date.now(); };
const isNew = id => { const st = qsPeek(id); return !st || st.seen === 0; };

/* ---------------- data indexes ---------------- */
const byId = new Map(SMLE_DATA.map(q => [q.id, q]));
const groups = (() => {
  const m = new Map();
  for (const q of SMLE_DATA) {
    if (!m.has(q.cat)) m.set(q.cat, new Map());
    const sm = m.get(q.cat);
    if (!sm.has(q.sub)) sm.set(q.sub, []);
    sm.get(q.sub).push(q);
  }
  return m;
})();

/* ---------------- utils ---------------- */
const $ = sel => document.querySelector(sel);
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// render clues as toggleable highlight spans: prefer **markers** in the stem,
// otherwise fall back to wrapping any buzzword phrases that appear verbatim
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const renderQ = (text, buzz) => {
  if (/\*\*/.test(text))
    return esc(text).replace(/\*\*(.+?)\*\*/g, '<span class="buzz">$1</span>').replace(/\*\*/g, "");
  let html = esc(text);
  for (const ph of buzz || []) {
    const p = ph.trim();
    if (p) html = html.replace(new RegExp("(" + escRe(esc(p)) + ")", "i"), '<span class="buzz">$1</span>');
  }
  return html;
};
// does this question have any clue to highlight?
const hasClues = q => /\*\*/.test(q.q) ||
  (q.buzz || []).some(b => b.trim() && q.q.toLowerCase().includes(b.trim().toLowerCase()));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pct = (n, d) => d ? Math.round(100 * n / d) : 0;
const fmtDate = ts => new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/* ---------------- views ---------------- */
const views = ["home", "setup", "quiz", "results", "stats"];
function show(name) {
  for (const v of views) $("#view-" + v).hidden = v !== name;
  window.scrollTo(0, 0);
}

/* ================= HOME ================= */
function renderHome() {
  const ids = SMLE_DATA.map(q => q.id);
  const due = ids.filter(isDue).length;
  const fresh = ids.filter(isNew).length;
  const mastered = ids.filter(id => (qsPeek(id)?.box || 0) >= MASTER_BOX).length;
  let right = 0, total = 0, flagged = 0, wrongPool = 0;
  for (const id of ids) {
    const st = qsPeek(id);
    if (!st) continue;
    right += st.right; total += st.right + st.wrong;
    if (st.flag) flagged++;
    if (st.lastWrong) wrongPool++;
  }
  $("#home-stats").innerHTML = `
    <div class="stat hot"><b>${due}</b><small>due for review</small></div>
    <div class="stat"><b>${fresh}</b><small>unseen questions</small></div>
    <div class="stat good"><b>${pct(mastered, ids.length)}%</b><small>mastered (${mastered}/${ids.length})</small></div>
    <div class="stat"><b>${total ? pct(right, total) + "%" : "—"}</b><small>overall accuracy</small></div>`;
  $("#flagged-desc").textContent = flagged ? `${flagged} flagged question${flagged > 1 ? "s" : ""} waiting.` : "Review the questions you marked.";
  $("#weak-desc").textContent = wrongPool ? `${wrongPool} questions you last got wrong.` : "Drill questions you've gotten wrong.";
  show("home");
}

/* ================= SETUP ================= */
const setup = { mode: "study", count: 20, timer: 90, filter: "smart", cats: new Set() };

function openSetup(mode, presetFilter) {
  setup.mode = mode;
  setup.filter = presetFilter || (mode === "mock" ? "all" : "smart");
  setup.cats = new Set(SMLE_DATA.map(q => q.cat + "||" + q.sub));
  $("#setup-title").textContent = mode === "mock" ? "Mock Exam" : "Study Session";
  $("#filter-block").hidden = mode === "mock";
  $("#timer-hint").textContent = mode === "mock"
    ? "Mock mode: when time runs out the question is locked and you move on — just like the real thing."
    : "Study mode: the timer keeps you honest but won't skip you. The real SMLE gives ~72s per question.";
  renderCatList();
  syncSeg("#timer-seg", String(setup.timer));
  syncSeg("#filter-seg", setup.filter);
  $("#q-count").value = setup.count;
  $("#q-count-out").textContent = setup.count;
  $("#setup-err").hidden = true;
  updatePoolCount();
  show("setup");
}

function renderCatList() {
  const wrap = $("#cat-list");
  wrap.innerHTML = "";
  for (const [cat, subs] of groups) {
    const g = document.createElement("div");
    g.innerHTML = `<div class="cat-group-name">${esc(cat)}</div>`;
    const chips = document.createElement("div");
    chips.className = "cat-chips";
    for (const [sub, list] of subs) {
      const key = cat + "||" + sub;
      const due = list.filter(q => isDue(q.id)).length;
      const chip = document.createElement("button");
      chip.className = "cat-chip" + (setup.cats.has(key) ? " on" : "");
      chip.innerHTML = `${esc(sub)} <span class="n">${list.length}</span>${due ? ` <span class="due">${due} due</span>` : ""}`;
      chip.onclick = () => {
        setup.cats.has(key) ? setup.cats.delete(key) : setup.cats.add(key);
        chip.classList.toggle("on");
        updatePoolCount();
      };
      chips.appendChild(chip);
    }
    g.appendChild(chips);
    wrap.appendChild(g);
  }
}

function poolForSetup() {
  let pool = SMLE_DATA.filter(q => setup.cats.has(q.cat + "||" + q.sub));
  const f = setup.mode === "mock" ? "all" : setup.filter;
  if (f === "new") pool = pool.filter(q => isNew(q.id));
  else if (f === "wrong") pool = pool.filter(q => qsPeek(q.id)?.lastWrong);
  else if (f === "flag") pool = pool.filter(q => qsPeek(q.id)?.flag);
  else if (f === "smart") { /* whole pool; ordering handles priority */ }
  return pool;
}

function updatePoolCount() {
  $("#pool-count").textContent = `— ${poolForSetup().length} questions in pool`;
}

function buildSession() {
  const pool = poolForSetup();
  if (!pool.length) return null;
  const n = Math.min(setup.count, pool.length);
  let picked;
  if (setup.mode === "study" && setup.filter === "smart") {
    // priority: overdue (most overdue first) → new → rest by oldest last-seen
    const due = shuffle(pool.filter(q => isDue(q.id))).sort((a, b) => qs(a.id).due - qs(b.id).due);
    const fresh = shuffle(pool.filter(q => isNew(q.id)));
    const rest = shuffle(pool.filter(q => !isDue(q.id) && !isNew(q.id))).sort((a, b) => qs(a.id).last - qs(b.id).last);
    picked = [...due, ...fresh, ...rest].slice(0, n);
    shuffle(picked); // don't let them predict "hard ones first"
  } else {
    picked = shuffle([...pool]).slice(0, n);
  }
  return picked.map(q => ({
    q,
    order: shuffle([0, 1, 2, 3]), // options re-shuffled every session → no letter memorization
    picked: null,        // index into q.opts (original indexing)
    correct: null,
    timeSpent: 0,
    timedOut: false,
    seen: false,         // has this question been shown yet (timer runs once)
    answered: false,     // has it been graded (study mode)
  }));
}

/* ================= QUIZ ================= */
const quiz = { items: [], idx: 0, mode: "study", perQ: 90, startedAt: 0, timerId: null, timeLeft: 0, answered: false };

function startSession() {
  const items = buildSession();
  if (!items) {
    const err = $("#setup-err");
    err.textContent = "No questions match — pick more categories or a different pool.";
    err.hidden = false;
    return;
  }
  quiz.items = items;
  quiz.idx = 0;
  quiz.mode = setup.mode;
  quiz.perQ = setup.timer;
  quiz.startedAt = Date.now();
  show("quiz");
  renderQuestion();
}

function renderQuestion() {
  const it = quiz.items[quiz.idx];
  const q = it.q;
  quiz.answered = false;

  $("#qp-num").textContent = `Question ${quiz.idx + 1} / ${quiz.items.length}`;
  $("#qp-mode").textContent = quiz.mode === "mock" ? "MOCK EXAM" : "STUDY";
  $("#qp-fill").style.width = (100 * quiz.idx / quiz.items.length) + "%";
  $("#q-id").textContent = String(q.id).padStart(4, "0");
  $("#q-cat").textContent = q.sub;
  $("#q-text").innerHTML = renderQ(q.q, q.buzz);
  const clues = hasClues(q);
  const buzzBtn = $("#btn-buzz");
  buzzBtn.disabled = !clues;
  buzzBtn.textContent = clues ? "💡 Clues" : "No clues";
  $("#q-card").classList.toggle("show-buzz", S.settings.buzz && clues);
  buzzBtn.classList.toggle("on", S.settings.buzz && clues);
  $("#btn-flag").classList.toggle("on", !!qsPeek(q.id)?.flag);
  $("#feedback").hidden = true;
  $("#recall").hidden = true;
  $("#btn-next").hidden = true;
  $("#btn-skip").hidden = true;
  $("#btn-skip").disabled = false;
  $("#btn-prev").hidden = quiz.idx === 0;

  const opts = $("#opts");
  opts.innerHTML = "";
  it.order.forEach((origIdx, pos) => {
    const b = document.createElement("button");
    b.className = "opt";
    b.dataset.orig = origIdx;
    b.innerHTML = `<span class="letter">${"ABCD"[pos]}</span><span class="opt-body">${esc(q.opts[origIdx])}</span>`;
    b.onclick = () => pickOption(origIdx, b);
    opts.appendChild(b);
  });

  const firstView = !it.seen;
  it.seen = true;

  // already-answered study question: show its explanation read-only when revisited
  if (quiz.mode === "study" && it.answered) {
    quiz.answered = true;
    paintReveal(it);
    $("#recall").hidden = true;
    $("#btn-next").hidden = false;
    $("#timer").hidden = true;
    stopTimer(null);
    return;
  }
  // revisiting a mock question: restore the chosen option (still changeable)
  if (quiz.mode === "mock" && it.picked !== null) {
    for (const el of opts.children) el.classList.toggle("picked", +el.dataset.orig === it.picked);
    $("#btn-next").hidden = false;
  } else if (quiz.mode === "mock") {
    $("#btn-skip").hidden = false;
  }

  // the timer only runs the first time a question is shown, not on revisits
  if (firstView) startTimer();
  else { $("#timer").hidden = true; stopTimer(null); }
}

function prevQuestion() {
  if (quiz.idx === 0) return;
  stopTimer(quiz.items[quiz.idx]);
  quiz.idx--;
  renderQuestion();
}

function pickOption(origIdx, btn) {
  const it = quiz.items[quiz.idx];
  if (quiz.mode === "mock") {
    if (quiz.answered) return; // locked (timed out)
    it.picked = origIdx;
    it.correct = origIdx === it.q.ans;
    for (const el of $("#opts").children) el.classList.toggle("picked", el === btn);
    $("#btn-next").hidden = false;
    $("#btn-skip").hidden = true;
    return;
  }
  if (quiz.answered) return;
  quiz.answered = true;
  stopTimer(it);
  it.picked = origIdx;
  it.correct = origIdx === it.q.ans;
  revealAnswer(it, true);
}

// paint the revealed state (options + feedback) without grading — reused by
// live answering and by read-only revisits of an already-answered question
function paintReveal(it) {
  const q = it.q;
  for (const el of $("#opts").children) {
    const orig = +el.dataset.orig;
    el.disabled = true;
    el.classList.remove("picked");
    el.classList.toggle("correct", orig === q.ans);
    el.classList.toggle("wrong", orig !== q.ans && orig === it.picked);
    if (q.expl[orig] && !el.querySelector(".opt-expl")) {
      const ex = document.createElement("span");
      ex.className = "opt-expl";
      ex.textContent = q.expl[orig];
      el.querySelector(".opt-body").appendChild(ex);
    }
  }
  const banner = $("#fb-banner");
  if (it.picked === null) { banner.className = "fb-banner no"; banner.textContent = "TIME'S UP — COUNTED AS WRONG"; }
  else if (it.correct) { banner.className = "fb-banner ok"; banner.textContent = "✓ CORRECT!"; }
  else { banner.className = "fb-banner no"; banner.textContent = "✗ INCORRECT"; }
  $("#fb-oneline").textContent = q.one ? "» " + q.one : "";
  $("#fb-hy").innerHTML = q.hy ? "<b>★ HIGH YIELD</b>" + esc(q.hy) : "";
  $("#feedback").hidden = false;
}

function revealAnswer(it, withRecall) {
  paintReveal(it);
  $("#recall").hidden = !withRecall || !it.correct; // self-grade only when correct; wrong resets automatically
  if (!withRecall || !it.correct) {
    grade(it.q.id, !!it.correct, null);
    it.answered = true;
    $("#btn-next").hidden = false;
  }
  $("#btn-skip").hidden = true;
}

function selfGrade(g) {
  const it = quiz.items[quiz.idx];
  grade(it.q.id, true, g);
  it.answered = true;
  $("#recall").hidden = true;
  nextQuestion();
}

function nextQuestion() {
  stopTimer(quiz.items[quiz.idx]);
  if (quiz.idx + 1 >= quiz.items.length) return finishSession();
  quiz.idx++;
  renderQuestion();
}

/* ---- timer ---- */
const RING = 106.8; // 2πr for r=17
function startTimer() {
  stopTimer(null);
  const t = $("#timer");
  if (!quiz.perQ) { t.hidden = true; return; }
  t.hidden = false;
  t.classList.remove("low", "up");
  quiz.timeLeft = quiz.perQ;
  $("#timer-text").textContent = quiz.timeLeft;
  $("#timer-ring").style.strokeDashoffset = 0;
  quiz.timerId = setInterval(() => {
    quiz.timeLeft--;
    $("#timer-text").textContent = Math.max(0, quiz.timeLeft);
    $("#timer-ring").style.strokeDashoffset = RING * (1 - Math.max(0, quiz.timeLeft) / quiz.perQ);
    if (quiz.timeLeft <= 10) t.classList.add("low");
    if (quiz.timeLeft <= 0) {
      if (quiz.mode === "mock") {
        // lock whatever is selected (or nothing) and move on
        clearInterval(quiz.timerId); quiz.timerId = null;
        const it = quiz.items[quiz.idx];
        it.timedOut = true;
        if (it.picked === null) it.correct = false;
        nextQuestion();
      } else {
        t.classList.add("up");
        $("#timer-text").textContent = "0";
        clearInterval(quiz.timerId); quiz.timerId = null;
      }
    }
  }, 1000);
}
function stopTimer(item) {
  if (item && quiz.perQ) item.timeSpent = quiz.perQ - Math.max(0, quiz.timeLeft);
  if (quiz.timerId) { clearInterval(quiz.timerId); quiz.timerId = null; }
}

/* ================= RESULTS ================= */
function finishSession() {
  stopTimer(null);
  // in mock mode, answers are graded (and fed into SRS) at the end
  if (quiz.mode === "mock") {
    for (const it of quiz.items) {
      it.correct = it.picked !== null && it.picked === it.q.ans;
      grade(it.q.id, it.correct, null);
    }
  }
  const answered = quiz.items.filter(it => it.correct !== null);
  const right = quiz.items.filter(it => it.correct).length;
  const mins = Math.max(1, Math.round((Date.now() - quiz.startedAt) / 60000));

  S.history.unshift({
    ts: Date.now(), mode: quiz.mode, total: quiz.items.length, right,
    mins, cats: [...new Set(quiz.items.map(it => it.q.sub))].slice(0, 4),
  });
  S.history = S.history.slice(0, 50);
  save();

  $("#res-title").textContent = quiz.mode === "mock" ? "MOCK EXAM RESULTS" : "SESSION CLEAR!";
  $("#res-pct").textContent = pct(right, quiz.items.length) + "%";
  $("#res-facts").innerHTML = `
    <span><b>${right}</b> correct</span>
    <span><b>${quiz.items.length - right}</b> incorrect</span>
    <span><b>${mins}</b> min</span>
    <span><b>${quiz.items.filter(it => qsPeek(it.q.id)?.flag).length}</b> flagged</span>`;

  // per-subcategory bars
  const bySub = new Map();
  for (const it of quiz.items) {
    if (!bySub.has(it.q.sub)) bySub.set(it.q.sub, { r: 0, t: 0 });
    const s = bySub.get(it.q.sub);
    s.t++; if (it.correct) s.r++;
  }
  $("#res-cats").innerHTML = [...bySub].map(([sub, s]) => barRow(sub, s.r, s.t)).join("");

  // question grid
  const grid = $("#res-qs");
  grid.innerHTML = "";
  quiz.items.forEach((it, i) => {
    const b = document.createElement("button");
    b.className = "res-q " + (it.correct ? "ok" : "no");
    b.innerHTML = (i + 1) + (qsPeek(it.q.id)?.flag ? '<span class="fl">⚑</span>' : "");
    b.onclick = () => openReview(it);
    grid.appendChild(b);
  });

  $("#btn-res-retry").hidden = right === quiz.items.length;
  show("results");
}

function barRow(label, r, t) {
  const p = pct(r, t);
  const cls = p >= 75 ? "good" : p < 50 ? "bad" : "";
  return `<div class="bar-row"><div class="bar-label"><b>${esc(label)}</b><span>${r}/${t} · ${p}%</span></div>
    <div class="bar-track"><div class="bar-fill ${cls}" style="width:${p}%"></div></div></div>`;
}

function openReview(it) {
  const q = it.q;
  const st = qsPeek(q.id);
  const opts = it.order.map((orig, pos) => {
    const cls = orig === q.ans ? "correct" : "xno" + (orig === it.picked ? " wrong" : "");
    return `<div class="opt ${cls}" style="cursor:default"><span class="letter">${"ABCD"[pos]}</span>
      <span class="opt-body">${esc(q.opts[orig])}${q.expl[orig] ? `<span class="opt-expl">${esc(q.expl[orig])}</span>` : ""}</span></div>`;
  }).join("");
  $("#modal-body").innerHTML = `
    <div class="q-meta"><span class="q-badges"><span class="q-id">${String(q.id).padStart(4, "0")}</span><span class="q-tag">${esc(q.sub)}</span></span>
      <button class="toolbtn ${st?.flag ? "on" : ""}" id="modal-flag">⚑ ${st?.flag ? "Flagged" : "Flag"}</button></div>
    <div class="q-text q-card show-buzz" style="box-shadow:none;border:none;padding:0">${renderQ(q.q, q.buzz)}</div>
    <div class="opts" style="margin-top:.8rem">${opts}</div>
    ${q.one ? `<div class="fb-oneline" style="margin-top:.9rem">» ${esc(q.one)}</div>` : ""}
    ${q.hy ? `<div class="fb-hy"><b>★ HIGH YIELD</b>${esc(q.hy)}</div>` : ""}`;
  $("#modal-flag").onclick = e => {
    const s = qs(q.id);
    s.flag = !s.flag;
    save();
    e.target.className = "toolbtn" + (s.flag ? " on" : "");
    e.target.textContent = "⚑ " + (s.flag ? "Flagged" : "Flag");
  };
  $("#modal").hidden = false;
}

/* ================= STATS ================= */
function renderStats() {
  const ids = SMLE_DATA.map(q => q.id);
  let right = 0, total = 0, seenQ = 0;
  for (const id of ids) {
    const st = qsPeek(id);
    if (!st || !st.seen) continue;
    seenQ++; right += st.right; total += st.right + st.wrong;
  }
  const due = ids.filter(isDue).length;
  $("#stats-top").innerHTML = `
    <div class="stat"><b>${seenQ}/${ids.length}</b><small>questions attempted</small></div>
    <div class="stat"><b>${total}</b><small>total answers given</small></div>
    <div class="stat good"><b>${total ? pct(right, total) + "%" : "—"}</b><small>overall accuracy</small></div>
    <div class="stat hot"><b>${due}</b><small>due for review</small></div>`;

  // mastery pipeline
  const buckets = { New: 0, Learning: 0, Reviewing: 0, Mastered: 0 };
  for (const id of ids) {
    const st = qsPeek(id);
    if (!st || !st.seen) buckets.New++;
    else if (st.box <= 2) buckets.Learning++;
    else if (st.box < MASTER_BOX) buckets.Reviewing++;
    else buckets.Mastered++;
  }
  $("#pipeline").innerHTML = Object.entries(buckets)
    .map(([k, v]) => `<div class="pipe"><b>${v}</b><small>${k}</small></div>`).join("");

  // per-subcategory accuracy
  const rows = [];
  for (const [cat, subs] of groups) {
    for (const [sub, list] of subs) {
      let r = 0, t = 0;
      for (const q of list) {
        const st = qsPeek(q.id);
        if (st) { r += st.right; t += st.right + st.wrong; }
      }
      if (t) rows.push(barRow(`${sub}`, r, t));
    }
  }
  $("#stats-cats").innerHTML = rows.join("") || `<p class="hint">Answer some questions to see per-category accuracy.</p>`;

  $("#stats-history").innerHTML = S.history.length
    ? S.history.map(h => `<div class="hist-row">
        <span><b>${h.mode === "mock" ? "[MOCK]" : "[STUDY]"}</b> · ${h.right}/${h.total} (${pct(h.right, h.total)}%)</span>
        <span class="muted">${esc(h.cats.join(", "))}${h.cats.length >= 4 ? "…" : ""} · ${h.mins} min · ${fmtDate(h.ts)}</span>
      </div>`).join("")
    : `<p class="hint">No sessions yet.</p>`;
  show("stats");
}

/* ================= wiring ================= */
function syncSeg(sel, val) {
  for (const b of document.querySelectorAll(sel + " button"))
    b.classList.toggle("on", b.dataset.val === val);
}

/* ---- night mode: explicit choice persists; otherwise follow the system ---- */
const prefersDark = () => window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
function applyTheme() {
  const dark = S.settings.theme ? S.settings.theme === "dark" : prefersDark();
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const btn = $("#btn-theme");
  btn.textContent = dark ? "☀️" : "🌙";
  btn.title = dark ? "Switch to day mode" : "Switch to night mode";
}
$("#btn-theme").onclick = () => {
  const nowDark = document.documentElement.dataset.theme === "dark";
  S.settings.theme = nowDark ? "light" : "dark";
  save();
  applyTheme();
};
// react to OS theme changes only while the user hasn't set an explicit choice
if (window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!S.settings.theme) applyTheme();
  });
}
applyTheme();

$("#btn-home").onclick = renderHome;
$("#btn-stats").onclick = renderStats;
$("#btn-study").onclick = () => openSetup("study");
$("#btn-mock").onclick = () => openSetup("mock");
$("#btn-flagged").onclick = () => openSetup("study", "flag");
$("#btn-weak").onclick = () => openSetup("study", "wrong");
for (const el of document.querySelectorAll("[data-back]")) el.onclick = renderHome;

$("#cats-all").onclick = () => { setup.cats = new Set(SMLE_DATA.map(q => q.cat + "||" + q.sub)); renderCatList(); updatePoolCount(); };
$("#cats-none").onclick = () => { setup.cats.clear(); renderCatList(); updatePoolCount(); };
$("#q-count").oninput = e => { setup.count = +e.target.value; $("#q-count-out").textContent = e.target.value; };
$("#timer-seg").onclick = e => { const b = e.target.closest("button"); if (!b) return; setup.timer = +b.dataset.val; syncSeg("#timer-seg", b.dataset.val); };
$("#filter-seg").onclick = e => { const b = e.target.closest("button"); if (!b) return; setup.filter = b.dataset.val; syncSeg("#filter-seg", b.dataset.val); updatePoolCount(); };
$("#btn-start").onclick = startSession;

$("#btn-buzz").onclick = () => {
  S.settings.buzz = !S.settings.buzz;
  save();
  $("#q-card").classList.toggle("show-buzz", S.settings.buzz);
  $("#btn-buzz").classList.toggle("on", S.settings.buzz);
};
$("#btn-flag").onclick = () => {
  const st = qs(quiz.items[quiz.idx].q.id);
  st.flag = !st.flag;
  save();
  $("#btn-flag").classList.toggle("on", st.flag);
};
$("#btn-quit").onclick = () => {
  if (quiz.items.some(it => it.correct !== null) &&
      confirm("End session now? Answered questions are kept, the rest are dropped.")) {
    quiz.items = quiz.items.filter(it => it.correct !== null);
    quiz.items.length ? finishSession() : renderHome();
  } else if (!quiz.items.some(it => it.correct !== null)) {
    stopTimer(null); renderHome();
  }
};
$("#btn-prev").onclick = prevQuestion;
$("#btn-next").onclick = () => {
  if (quiz.mode === "study" && !$("#recall").hidden) return; // must self-grade first
  nextQuestion();
};
$("#btn-skip").onclick = () => { // mock only: proceed without answering
  const it = quiz.items[quiz.idx];
  it.picked = null; it.correct = false;
  nextQuestion();
};
$("#recall").onclick = e => { const b = e.target.closest("button[data-grade]"); if (b) selfGrade(b.dataset.grade); };

$("#btn-res-home").onclick = renderHome;
$("#btn-res-retry").onclick = () => {
  const wrongIds = quiz.items.filter(it => !it.correct).map(it => it.q.id);
  quiz.items = wrongIds.map(id => ({ q: byId.get(id), order: shuffle([0, 1, 2, 3]), picked: null, correct: null, timeSpent: 0, timedOut: false, seen: false, answered: false }));
  quiz.idx = 0; quiz.mode = "study"; quiz.startedAt = Date.now();
  show("quiz"); renderQuestion();
};

$("#modal-x").onclick = () => { $("#modal").hidden = true; };
$("#modal").onclick = e => { if (e.target === $("#modal")) $("#modal").hidden = true; };

$("#btn-reset").onclick = () => {
  if (confirm("Delete ALL progress, stats and flags? This cannot be undone.")) {
    S = defaultState(); save(); renderHome();
  }
};

/* ---------------- backup / cross-device transfer (copy & paste) ---------------- */
// unicode-safe base64 so the code stays a single easy-to-paste blob
const b64encode = s => btoa(unescape(encodeURIComponent(s)));
const b64decode = s => decodeURIComponent(escape(atob(s)));
const PROGRESS_PREFIX = "SMLE1:";

function openModalHTML(html) { $("#modal-body").innerHTML = html; $("#modal").hidden = false; }

// copy the FULL text reliably across browsers/phones: async Clipboard API first,
// then an execCommand fallback that selects the whole value (readonly textareas
// can't be selected programmatically on iOS, so drop readonly during the copy)
async function copyText(text, area) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* fall through */ }
  try {
    const ro = area.readOnly;
    area.readOnly = false;
    area.focus();
    area.setSelectionRange(0, text.length); // whole value, not just what's visible
    const ok = document.execCommand("copy");
    area.readOnly = ro;
    area.setSelectionRange(0, 0);
    area.blur();
    return ok;
  } catch (e) { return false; }
}

function exportProgress() {
  const code = PROGRESS_PREFIX + b64encode(JSON.stringify({ app: "smle-study", v: 1, exported: Date.now(), state: S }));
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  openModalHTML(`
    <h3 style="margin-top:0">Copy your progress</h3>
    <p class="hint">Copy this whole code, then on your other device open <b>Stats → Paste progress</b> and paste it. On a phone, <b>Share</b> is easiest.</p>
    <textarea id="exp-area" class="code-area" readonly>${esc(code)}</textarea>
    <div class="modal-btns">
      <button class="bigbtn" id="exp-copy">Copy to clipboard</button>
      ${canShare ? '<button class="bigbtn ghost" id="exp-share">Share…</button>' : ""}
    </div>
    <p class="hint" id="exp-done" hidden></p>`);
  const area = $("#exp-area");
  $("#exp-copy").onclick = async () => {
    const ok = await copyText(code, area);
    const done = $("#exp-done");
    done.hidden = false;
    done.textContent = ok
      ? "Copied ✓ — paste it on your other device."
      : "Couldn't auto-copy — tap the code, Select All, then Copy.";
  };
  if (canShare) $("#exp-share").onclick = () => navigator.share({ title: "SMLE progress", text: code }).catch(() => {});
}

function importProgress() {
  openModalHTML(`
    <h3 style="margin-top:0">Paste progress</h3>
    <p class="hint">Paste the code from your other device and press Merge. Nothing is lost — the newer progress per question wins.</p>
    <textarea id="imp-area" class="code-area" placeholder="Paste your SMLE progress code here…"></textarea>
    <button class="bigbtn" id="imp-go">Merge</button>
    <p class="hint err" id="imp-err" hidden></p>`);
  $("#imp-go").onclick = () => {
    // strip the prefix and ALL whitespace/line breaks that copy-paste (messaging
    // apps, email wrapping) can inject into the base64 — none belongs in it
    let raw = $("#imp-area").value.trim();
    const pfx = raw.indexOf(PROGRESS_PREFIX);
    if (pfx !== -1) raw = raw.slice(pfx + PROGRESS_PREFIX.length);
    let incoming;
    try {
      let json;
      if (raw && raw.trim()[0] === "{") json = raw; // raw JSON paste
      else json = b64decode(raw.replace(/\s+/g, "")); // base64 (with prefix already removed)
      const parsed = JSON.parse(json);
      incoming = parsed && parsed.state ? parsed.state : parsed; // wrapped or raw
      if (!incoming || typeof incoming.q !== "object") throw new Error("shape");
    } catch (e) {
      const err = $("#imp-err");
      err.textContent = "That code didn't look right — copy it again from the other device.";
      err.hidden = false;
      return;
    }
    const before = Object.keys(S.q).length;
    S = Object.assign(defaultState(), { settings: S.settings }, mergeState(S, incoming));
    save();
    const after = Object.keys(S.q).length;
    $("#modal").hidden = true;
    renderStats();
    alert(`Progress merged ✓  (${after - before} new question${after - before === 1 ? "" : "s"} added, ${after} total)`);
  };
}

// merge two saved states; per question the more recently studied record wins,
// flags are OR'd, counts take the max, and history is unioned by timestamp
function mergeState(local, incoming) {
  const out = { q: {}, history: [], settings: local.settings };
  const ids = new Set([...Object.keys(local.q || {}), ...Object.keys(incoming.q || {})]);
  for (const id of ids) {
    const a = (local.q || {})[id], b = (incoming.q || {})[id];
    if (!a || !b) { out.q[id] = a || b; continue; }
    const pick = { ...((b.last || 0) > (a.last || 0) ? b : a) };
    pick.flag = !!(a.flag || b.flag);
    pick.seen = Math.max(a.seen || 0, b.seen || 0);
    pick.right = Math.max(a.right || 0, b.right || 0);
    pick.wrong = Math.max(a.wrong || 0, b.wrong || 0);
    out.q[id] = pick;
  }
  const seen = new Set();
  out.history = [...(local.history || []), ...(incoming.history || [])]
    .sort((x, y) => y.ts - x.ts)
    .filter(h => (seen.has(h.ts) ? false : seen.add(h.ts)))
    .slice(0, 50);
  return out;
}

$("#btn-export").onclick = exportProgress;
$("#btn-import").onclick = importProgress;

// keyboard shortcuts: 1-4 / A-D pick options, Enter = next, F = flag, B = buzzwords
document.addEventListener("keydown", e => {
  if ($("#view-quiz").hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  const idx = "1234".indexOf(k) !== -1 ? "1234".indexOf(k) : "abcd".indexOf(k);
  if (idx !== -1) {
    const btn = $("#opts").children[idx];
    if (btn && !btn.disabled) btn.click();
  } else if (k === "enter" && !$("#btn-next").hidden) $("#btn-next").click();
  else if (k === "f") $("#btn-flag").click();
  else if (k === "b") $("#btn-buzz").click();
});

/* ---- bridge for the optional cloud-sync layer (js/firebase-sync.js) ---- */
window.__smle = {
  getState: () => S,
  // merge a state coming from the cloud / another device into local, save
  // (WITHOUT re-triggering a cloud push), refresh the visible view, return merged
  mergeIncoming(incoming) {
    S = Object.assign(defaultState(), { settings: S.settings }, mergeState(S, incoming));
    saveLocal();
    if (!$("#view-home").hidden) renderHome();
    else if (!$("#view-stats").hidden) renderStats();
    return S;
  },
  onChange: null, // set by the cloud layer to receive debounced push notifications
};

renderHome();
})();
