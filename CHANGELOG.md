# Changelog

All notable changes to this project are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- This changelog.
- README §10 — full-tree red/blue team security review of commit `0789916`
  (2026-07-18).

### Security

- Red-team review found **no exploitable vulnerabilities.** All nine bench
  `innerHTML` sinks traced (only one carries user data — escaped, and
  constrained to a fixed `[A-Z]` phoneme alphabet); no `eval` or dynamic
  code paths; dev server binds localhost only; dependencies resolve to
  patched versions (vite 6.4.3, vitest 2.1.9); lockfile integrity-pinned
  with no custom registries; no secrets in tree or history. Four
  non-blocking hardening recommendations recorded as H1–H4 in README §10.3.
- Known functional (non-security) bug **B1** recorded in README §10.4: the
  bench phoneme field rejects the documented stress-marker syntax (`OH:`)
  because validation skips `stripStress`. `synth()` itself is unaffected;
  the H1 hardening change fixes both.

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
