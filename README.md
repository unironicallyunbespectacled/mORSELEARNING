# MORSE ACADEMY

A complete, self-contained Morse code training program — zero to master operator.
No build step, no dependencies, no backend: open `index.html` in a browser and go.

## Why it works

Most "learn Morse" apps show you a chart and quiz you on it. This one teaches the way
real high-speed CW operators actually learn:

- **Koch method** — every character is always played at full target speed (e.g. 20 WPM)
  from the moment it's introduced. You add one new character at a time, so your ear
  learns the *shape* of each letter correctly the first time instead of a slowed-down
  version you'll have to unlearn later.
- **Farnsworth spacing** — only the *gaps* between characters start out slow. As you
  improve, you tighten the spacing instead of re-teaching the sounds.
- **Pattern logic over memorization** — the app computes mirror-image letter pairs and
  element-length groups directly from the Morse table (see `data.js`), and teaches the
  digit codes as a single ramp rule instead of ten codes to memorize.

## What's inside

- **30-day curriculum** (4 phases: Foundation → Building → Fluency → Mastery), each day
  a checklist-tracked session — go at your own pace, not the calendar's.
- **Learn tab** — Koch-order flashcards with real audio (Web Audio API oscillator tones).
- **Copy Drill** — character / word / sentence / simulated-QSO / weak-character-adaptive /
  timed final-exam modes, all scored, all feeding a per-character accuracy heatmap.
- **Send Drill** — key with spacebar or the on-screen paddle; the app decodes your timing
  live and scores rhythm consistency.
- **Speed Builder** — adaptive WPM ramp sessions that track your personal best.
- **Translator** — type any free-form text, hear it as Morse, and export it as a real
  downloadable `.wav` file (rendered via `OfflineAudioContext`, not a pre-recorded clip).
  Decodes dots/dashes back to text too.
- **Full reference chart** — every letter/digit/punctuation mark, prosigns, Q-codes.
- **XP, levels (named after real amateur-radio license classes), streaks, 17 achievements,
  a 25-entry practice log, lifetime tallies**, all persisted locally via `localStorage`
  (export/import supported).
- **Daily Signal** — a challenge word seeded deterministically by today's date (same word
  for everyone, changes tomorrow), with its own bonus XP and achievement.
- **3 accent themes** (Amber / Emerald / Crimson), a live oscilloscope (real waveform of
  the tone being played, driven by an `AnalyserNode`), an optional filtered-noise "band
  static" atmosphere track, and a confetti burst on level-ups and achievement unlocks.
- Animated dark "radio shack at night" background: starfield, radar sweep, falling
  Morse "rain," and an ambient blinking signal lamp.
- **Certificate of completion** (`certificate.html`) — auto-fills from your live saved
  progress, renders your name as an actual Morse signature, printable/savable as PDF.
- **Terminal trainer** (`cli/trainer.py`) — a zero-dependency, pure-stdlib companion for
  drilling Morse code without a browser: visual dit/dah timing, copy drills, and the same
  computed reference tables (mirror pairs, number-pattern logic) as the web app.

## Files

- `index.html` — page structure
- `style.css` — visual design system
- `data.js` — Morse tables, curriculum, achievements, word/sentence banks (pure data)
- `app.js` — state, audio engine (incl. WAV export), drill logic, rendering
- `certificate.html` — standalone printable certificate, reads the same `localStorage`
- `cli/trainer.py` — terminal trainer (`python3 cli/trainer.py`, or `--selftest` to verify)

## Running it

Just open `index.html`. For the on-screen audio to work, browsers require one click
first — that's what the "Enable Sound" gate on load is for. `certificate.html` and
`index.html` must be served from/opened at the same origin to share saved progress
(that's automatic if you just open both from the same folder).
