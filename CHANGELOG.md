# Changelog

All notable changes to this project are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Bottom status bar** on the tuning bench — a fixed bar showing the
  version (injected from `package.json` at build time via a Vite
  `define`), a **Changelog** button that opens this file in an in-app
  viewer (`CHANGELOG.md` imported with `?raw`, rendered as monospace via
  `textContent` — no new `innerHTML` sink), and a link to the GitHub
  repository.
- This changelog.
- README §10 — full-tree red/blue team security review of commit `0789916`
  (2026-07-18).
- `isKnownPhoneme()` — stress-aware, own-properties-only phoneme
  validation, exported from the library surface and used by the bench.
  Five regression tests ("phoneme validation (bench boundary)"); the
  suite is now 40 tests.
- Social card (`public/og.svg` → `public/og.png`), generated from the real
  waveform of `synth(['R','OH:','V','AH','K','AA:','N'])` with phoneme
  labels aligned to their true audio segments (the K closure gap is
  visible silence). README hero image, badges, and elevator pitch; Open
  Graph / Twitter meta tags in `index.html`.
- `LICENSE` (MIT), `.nvmrc` (Node 22), and `netlify.toml` (build config,
  hashed-asset caching, and the H3 security headers) for the Netlify
  deploy.
- Live deployment: <https://vogel-vox.netlify.app/>. The og/twitter
  image tags in `index.html` now use the absolute URL, plus `og:url`.
- **Larry reel** (`src/voice/larry-lines.ts` + bench panel): the lines
  from Larry, VogelTronics' 1979 memory game, grouped by machine state
  (Boot, Watch, Correct, Wrong, Idle, Level up, Game over, Last word,
  Easter). In-universe by design — VogelVox voices only, no real arcade
  cabinets. Hand-tuned phonemes where they exist, g2p on the label
  otherwise; button text is escaped through `escapeHtml`. Bench-only; a
  test proves it stays out of the eight shipping utterances.
- **Wizard of Wor preset** — deeper and slower than Gorf; the dungeon
  register.
- **`OUCH, THAT HURTS` shipping utterance** for the stair fall (see
  Changed).
- README §3.1 "Talking Machines, 1975–1983" — why speech was hard (8 KB/s
  vs 16–48 KB boards), the three roads around it (phoneme synthesis,
  encoded speech, raw samples), the toy aisle's tape tricks (Mego 2-XL),
  and why constraint-shaped voices became iconic. Existing §3.x
  subsections renumbered.

### Changed

- **Renamed the voice component from "Rovacon Voice" to VogelVox
  (2026-07-20).** New slug `vogel-vox`; live bench at
  <https://vogel-vox.netlify.app/>; package `@vogel-vox/voice`; repo now
  <https://github.com/cschweda/vogeltronics-vogel-vox>. The parent Rovacon
  project (design suite + toy rover) and the spoken `ROVACON` utterance keep
  their names. Social card (`public/og.svg` → `public/og.png`) regenerated
  with the new title.
- **Stair-fall silence rule reversed by owner decision (2026-07-18).**
  Doc 10 §3B.5 gave the stair fall silence, and a test enforced it; the
  toy now says `OUCH, THAT HURTS` after the withering bloop, lowest
  priority, same rate limiter. The enforcement test points the other way
  (removing the line now fails), README §2.1 records both rationales, and
  Doc 10 / Doc 05 need matching updates upstream.
- Bandwidth test rebanded: the original seven lines keep their tuned 2%
  ceiling; the deliberately sibilant `OUCH, THAT HURTS` (~2.5% above
  4 kHz from `CH`/`HH`/final `TS`) gets the documented 5% failure
  threshold. §6.3's analysis table now labels the 2–5% band.

### Fixed

- **Berzerk chip attribution.** Berzerk's *"Intruder alert!"* came from
  TSI's S14001A — a chip built for a talking calculator — not a Votrax.
  Removed Berzerk from the SC-01 table (§3.2), corrected the elevator
  pitch, and labeled the classics reel accordingly.
- **B1** — the bench phoneme field rejected stress-marked tokens (`OH:`),
  the exact syntax its own help text recommends; on a fresh load the
  phoneme-reference chips errored instead of appending. Validation now
  goes through `isKnownPhoneme()`. Full entry with severity in README
  §10.4.
- README test count corrected: it claimed 28; the suite had 35, and has
  44 after the B1 regression and classics/stair-fall tests.

### Security

- Red-team review found **no exploitable vulnerabilities.** All nine bench
  `innerHTML` sinks traced (only one carries user data — escaped, and
  constrained to a fixed `[A-Z]` phoneme alphabet); no `eval` or dynamic
  code paths; dev server binds localhost only; dependencies resolve to
  patched versions (vite 6.4.3, vitest 2.1.9); lockfile integrity-pinned
  with no custom registries; no secrets in tree or history. Four
  non-blocking hardening recommendations recorded as H1–H4 in README §10.3.
- **H1 applied** (severity: Low, defense-in-depth) — bench validation
  switched from the prototype-chain-consulting `p in PHONES` to
  `Object.hasOwn` + `stripStress`, which also resolved functional bug B1
  (severity: Medium, usability).
- **H3 applied** — the review recommended security headers "if the bench
  is ever hosted"; the Netlify deploy is that hosting. `netlify.toml` now
  ships a same-origin CSP, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, and `Permissions-Policy`.
- **H4 partially closed** — Netlify runs pnpm with `CI=true`, freezing the
  lockfile in the deploy pipeline; a `pnpm audit` gate remains open, as
  does H2 (quote coverage in `escapeHtml`).

## [0.1.0] — 2026-07-18

### Added

- Votrax SC-01 style formant synthesizer (`src/voice/synth.ts`):
  impulse-train glottal source, three-resonator cascade with block-wise
  coefficient updates, coarse formant quantization, chip-rate decimation
  with ~8-bit DAC quantization, tanh output stage; deterministic via seeded
  mulberry32 PRNG.
- Phoneme inventory (`phonemes.ts`), rule-based grapheme-to-phoneme
  converter with hand-written lexicon (`g2p.ts`), the seven shipping
  utterances (`utterances.ts`), and the rate-limited `VoicePlayer`
  (`player.ts`).
- Browser tuning bench (`index.html`, `src/bench/`) with presets,
  band-energy analysis, WAV export, and parameter clipboard export.
- Python reference implementation (`reference/`), 28-test vitest suite,
  and `docs/tuning.md`.
