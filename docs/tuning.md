# Tuning Guide

Read this before changing anything in `src/voice/synth.ts`.

---

## The Governing Warning

**Several parameters in this synthesizer make the output objectively worse by
conventional DSP standards. That is deliberate.**

The Votrax SC-01's character comes from its limitations. Removing them produces
a cleaner synthesizer that sounds nothing like a 1979 arcade cabinet. Anyone
arriving at this code with normal audio-engineering instincts will want to fix
exactly the things that must not be fixed.

Specifically, do not "improve":

| Thing | Why it stays |
|---|---|
| Block-wise filter updates (64 samples) | The chip switched filters at a fixed low rate. The stepping is audible and correct. |
| Formant quantization to 50 Hz | The chip's ROM was small. Vowels land beside their targets, not on them. |
| Impulse-train glottal source | Real vocal folds are smooth. The chip was not. |
| Flat pitch, no terminal fall | The chip had four inflection levels and no phrase model. |
| 8-bit output quantization | The DAC was cheap. |
| tanh clipping | The amplifier was cheap. |

---

## The Three Critical Parameters

Marked in yellow in the bench UI.

### `chipSr` — Chip bandwidth (default 8000 Hz)

**The single highest-leverage parameter.** Everything above `chipSr / 2` is
removed. The SC-01 ran at roughly 8 kHz effective bandwidth, which is why
sibilants came out as dull hisses — `S` energy lives at 4–8 kHz and simply
was not there.

| Value | Effect |
|---|---|
| 5500 | Very degraded, barely intelligible |
| 7000 | Gorf territory |
| 8000 | SC-01 default |
| 10000 | Speak & Spell territory (smoother) |
| 16000+ | Effectively unlimited — the vintage character disappears |

If the output sounds too modern, lower this before touching anything else.

### `transition` — Formant transition (default 30 ms)

How long the formants take to move between phoneme targets.

| Value | Effect |
|---|---|
| 8 ms | Very abrupt, mechanical, chip-like |
| 30 ms | Default |
| 60 ms+ | Smooth, closer to natural speech, less characterful |

The chip interpolated crudely. Lower values are more authentic; too low and
consonants start to click.

### `quantStep` — Formant quantization (default 50 Hz)

The grid that formant targets snap to.

| Value | Effect |
|---|---|
| 0 | Disabled — vowels hit exact targets |
| 25 | Nearly transparent |
| 50 | Default. Vowels sit slightly off. |
| 100 | Vowels become ambiguous, more alien |
| 150 | Barely intelligible |

This is what makes `ROVACON` come out as ROH-vuh-KAHN.

---

## Symptom → Fix

| Symptom | Change |
|---|---|
| Too clean, too modern | Lower `chipSr` to 6000–7000 |
| Too smooth between sounds | Lower `transition` to 0.010–0.015 |
| Not buzzy enough | Raise `jitter` to 0.03–0.05 |
| Too intelligible, not alien enough | Raise `quantStep` to 75–100 |
| Too alien, unintelligible | Lower `quantStep` to 25; raise `transition` |
| Too harsh | Lower `drive` from 2.2 to ~1.6 |
| Flat and lifeless | Raise `drift` slightly — **never add a terminal pitch fall** |
| Wrong "size" of voice | Adjust `pitch`: 95 Hz reads larger, 140 Hz smaller |
| Plosives sound like noise | Raise `closure` to 0.045 |
| Long utterances rush | Raise `rate` to 1.15–1.3 |
| Sibilants inaudible | Raise `amp` on `S`/`SH` in `phonemes.ts` |

---

## Verifying With The Analysis Panel

The bench shows band energy. The important row is **Above chip limit**
(4 kHz and up).

| Reading | Meaning |
|---|---|
| Under 1% | Bandwidth limit working correctly |
| 1–2% | Acceptable |
| Over 5% | **Something is wrong.** The most important part of the character is not applying. |

For comparison, the "Clean" preset reads around 5%. The default reads under 1%.
That 5× separation is the bandwidth limit doing its job.

### A bug worth knowing about

An earlier version of `bandEnergy()` decimated the signal before analysis to
keep the DFT cheap. Decimating by 3 dropped Nyquist to 3675 Hz, which meant the
4–8 kHz band read **0.0% unconditionally** — the readout looked perfect while
measuring nothing at all.

If the high band ever reads exactly zero across wildly different `chipSr`
values, suspect the analysis before celebrating the synthesis.

---

## Performance

Rendering happens on the main thread. Current timings for a full utterance:

| Utterance | Phonemes | Render |
|---|---|---|
| ROVACON | 7 | ~19 ms |
| DIRECT HIT | 10 | ~24 ms |
| TARGET DESTROYED | 14 | ~33 ms |
| OPERATOR RECOGNIZED | 16 | ~68 ms |

Fast enough that slider drags feel live. If a change pushes a long utterance
past roughly 150 ms, the bench starts to feel sticky.

### The resampler

The windowed-sinc resampler uses a precomputed 128-phase coefficient table.
Linear interpolation was tried first and rejected — it added several percent of
broadband noise above the chip ceiling, defeating both the character and the
analysis readout. A naive per-sample sinc was correct but took 142 ms for a
long utterance; the table brings that to 68 ms.

---

## Stress Marking

A trailing colon lengthens a phoneme by `stressScale` (default 1.45×).
Markers compound: `AA::` is 1.45² ≈ 2.1×.

```
R OH: V AH K AA: N        ROH-vuh-KAHN
P AY: L OH D              PAY-lohd
```

The SC-01 had no stress model, but the *host system* controlled each
phoneme's duration — which is how arcade programmers got stress out of it.
This is period-plausible rather than a modern addition.

**Why it matters.** Without stress marks, the default table gives a stressed
`AA` (130 ms) only 1.44× the duration of an unstressed `AH` (90 ms). Real
stressed syllables run 1.8–2.2×. The weak contrast made `ROVACON` read as
"ro-vah-kan" rather than "ROH-vuh-KAHN" — everything sounded equally
unimportant.

---

## Case Study: The V That Sounded Like Y

Worth reading before adjusting any fricative.

**Symptom.** `ROVACON` came out as **"ro-YAH-kan"** — the V heard as a glide.

**Diagnosis.** Two faults compounding:

1. `V` had F2 at 2200 Hz. `Y` also has F2 at 2200 Hz. Identical.
2. `/v/` is a *fricative*, so its consonantal identity depends on frication
   noise — but that noise lives mostly above 4 kHz and the chip-rate limit
   strips it out.

What survived was a voiced segment with glide-like formants and no fricative
texture. The listener's ear had nothing to go on but F2, and F2 said `Y`.

**Fix.**

| Parameter | Before | After | Reason |
|---|---|---|---|
| `f1` | 350 | 300 | Slightly lower, more consonantal |
| `f2` | **2200** | **1100** | Labiodental /v/ is LOW-F2. This was the bug. |
| `f3` | 3600 | 2400 | Was above the ceiling anyway |
| `noise` | 0.60 | 0.75 | More texture survives the bandwidth limit |
| `amp` | 0.55 | 0.62 | Compensates for stripped high frequencies |
| `bw` | 200/350/500 | 180/320/480 | Slightly more resonant |

**The general lesson.** Any phoneme whose identity depends on energy above
4 kHz will be ambiguous after the chip-rate limit. When that happens the
*surviving* cues — mostly F1 and F2 — have to carry the distinction alone.
Check that a phoneme's low-frequency formants are not colliding with some
other phoneme's before assuming the synthesis is at fault.

Three regression tests guard this in `test/synth.test.ts`: V's F2 must stay
under 1400, V and Y must differ by more than 800 Hz, and V's noise must be at
least 0.7.

---

## Phoneme Editing

`src/voice/phonemes.ts` holds the inventory. Each entry:

```ts
IY: p('IY', 270, 2300, 3000, 0.13),   // f1, f2, f3, duration
```

**Vowels** are defined almost entirely by F1 and F2. F1 tracks tongue height
(low F1 = high tongue), F2 tracks backness (high F2 = front tongue).

**Fricative amplitudes are boosted** above natural levels because most of their
energy sits above the chip ceiling and gets removed. `S` is at 0.80 rather than
a natural ~0.55 for this reason.

**Diphthongs** carry a `glide` second target and interpolate across their
duration. Adding a new one means supplying both endpoints.

**Plosives** need `stop: true`, which causes a closure silence to be inserted
before them at synthesis time.
