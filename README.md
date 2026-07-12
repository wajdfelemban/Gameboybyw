# 🎮 SMLE Smart Study — Dot Matrix Edition

A smart, efficient SMLE prep app built around **active recall** and **spaced repetition**, running entirely in your browser on a 598-question bank — no server, no account, no install.

Designed in the **GameBoy · SMLE Prep** style: cream page, white question cards, dark pine header with pixel-font accents (Press Start 2P, self-hosted in `assets/fonts/`), yellow clue/keyword highlights, green/red option cards with per-option explanations, and a teal ★ HIGH YIELD box per question.

## Run it

Open `index.html` in any browser. That's it.

To use it on your phone, enable **GitHub Pages** for this repo (Settings → Pages → deploy from branch) and open the URL — progress is saved in the browser via localStorage.

## Features

- **🧠 Spaced repetition (Leitner system)** — every question lives in a box (1→3→7→14→30→60-day review intervals). Correct answers promote it, wrong answers demote it to tomorrow. "Smart" sessions automatically serve overdue reviews first, then new questions.
- **Active recall self-grading** — after a correct answer, rate yourself *Again / Hard / Good / Easy* to fine-tune when you'll see it next (Anki-style).
- **🎛️ Custom sessions** — choose the number of questions (5–100) and exactly which categories/subcategories to include, with live due-counts per subcategory.
- **💡 Buzzword button** — toggles highlighting of the key clinical clues inside each question stem (off by default so you can test yourself first). Keyboard: `B`.
- **⏱️ Per-question timer** — off / 60s / 90s / 120s. In study mode it just pressures you; in mock mode it locks the question and auto-advances, like the real exam.
- **🚩 Flag questions** — flag anything during a session (keyboard: `F`), then run a flagged-only session from the home screen.
- **⏱️ Mock exam mode** — no feedback until the end, options can be left blank, timed, full review of every question afterwards with explanations.
- **📊 Accuracy & progress** — overall and per-category accuracy, mastery pipeline (New → Learning → Reviewing → Mastered), due-for-review counts, and full session history.
- **Retry incorrect** — one tap after any session to re-drill just what you missed.
- **Answer-position shuffling** — options are re-lettered every session so you learn medicine, not letter positions.
- **Keyboard shortcuts** — `1–4`/`A–D` answer, `Enter` next, `F` flag, `B` buzzwords.

## Structure

```
index.html          the app shell
css/style.css       GameBoy SMLE Prep theme (cream + pine + pixel accents)
js/app.js           app logic + spaced-repetition engine
js/data.js          generated question bank (don't edit by hand)
assets/fonts/       self-hosted pixel font (Press Start 2P)
data/SMLE_Master.csv  source question bank
tools/csv_to_data.py  regenerates js/data.js from the CSV
```

## Updating the question bank

Edit/replace `data/SMLE_Master.csv` (same columns), then:

```bash
python3 tools/csv_to_data.py data/SMLE_Master.csv
```

Buzzwords are the `**double-starred**` phrases in the question text.

All progress lives in your browser's localStorage under the key `smle_study_v1` — clearing site data resets it (there's also a reset button in Stats).
