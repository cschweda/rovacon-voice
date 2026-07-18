/**
 * Votrax SC-01 style formant synthesizer — TypeScript port.
 *
 * Direct port of reference/synth.py. Renders offline into a Float32Array,
 * which is then wrapped in an AudioBuffer for playback. Rendering a
 * ~1.5 s utterance takes roughly 15–40 ms, fast enough that slider moves
 * feel immediate.
 *
 * The character comes from properties that are structural to formant
 * synthesis, not from filtering applied afterward. In rough order of
 * importance:
 *   1. Chip-rate bandwidth limit (~8 kHz) with 8-bit quantization
 *   2. Coarse formant quantization (the chip's ROM was small)
 *   3. Block-wise filter coefficient updates (audible stepping)
 *   4. Flat pitch with no terminal fall (no intonation model)
 *   5. Buzzy impulse-train glottal source
 *   6. Output clipping into a cheap amplifier
 *
 * Do not "improve" any of the above without reading docs/tuning.md.
 */

import { PHONES, type Phone } from './phonemes';

export const SR = 22050;          // internal working rate

/** Float32Array explicitly backed by ArrayBuffer (not SharedArrayBuffer). */
export type Samples = Float32Array<ArrayBuffer>;

function alloc(n: number): Samples {
  return new Float32Array(new ArrayBuffer(n * 4)) as Samples;
}

export interface SynthParams {
  /** Chip bandwidth limit, Hz. The highest-leverage parameter. */
  chipSr: number;
  /** Fundamental frequency, Hz. */
  pitch: number;
  /** Glottal period randomization, 0..0.1. Higher = buzzier. */
  jitter: number;
  /** Slow pitch wander, 0..0.05. Oscillator instability. */
  drift: number;
  /** Formant crossfade duration, seconds. Lower = more mechanical. */
  transition: number;
  /** Formant quantization grid, Hz. Higher = more alien vowels. */
  quantStep: number;
  /** Filter coefficient update interval, samples. Higher = more stepping. */
  block: number;
  /** Output DAC levels. ~110 ≈ 7.8 bits. */
  quantLevels: number;
  /** tanh saturation drive. Higher = harsher. */
  drive: number;
  /** Global duration multiplier. */
  rate: number;
  /** Plosive closure duration, seconds. */
  closure: number;
  /** Duration multiplier applied per trailing ':' on a phoneme. */
  stressScale: number;
  /** PRNG seed. */
  seed: number;
}

export const DEFAULT_PARAMS: SynthParams = {
  chipSr: 8000,
  pitch: 118,
  jitter: 0.015,
  drift: 0.015,
  transition: 0.030,
  quantStep: 50,
  block: 64,
  quantLevels: 110,
  drive: 2.2,
  rate: 1.0,
  closure: 0.035,
  stressScale: 1.45,
  seed: 1,
};

/* ------------------------------------------------------------------ */
/* Seeded PRNG — mulberry32. Deterministic across runs.               */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller normal, from a uniform generator. */
function makeNormal(rand: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0, v = 0, s = 0;
    do {
      u = rand() * 2 - 1;
      v = rand() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const mul = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * mul;
    return u * mul;
  };
}

/* ------------------------------------------------------------------ */
/* Formant quantization                                                */
/* ------------------------------------------------------------------ */

interface QPhone {
  name: string;
  f1: number; f2: number; f3: number;
  dur: number;
  voiced: boolean;
  noise: number;
  amp: number;
  stop: boolean;
  bw: [number, number, number];
  glide: [number, number, number] | null;
}

function quantizeFormants(p: Phone, step: number): QPhone {
  const q = (v: number) => (step > 0 ? Math.round(v / step) * step : v);
  return {
    name: p.name,
    f1: q(p.f1), f2: q(p.f2), f3: q(p.f3),
    dur: p.dur,
    voiced: p.voiced,
    noise: p.noise,
    amp: p.amp,
    stop: p.stop,
    bw: [p.bw[0], p.bw[1], p.bw[2]],
    glide: p.glide
      ? [q(p.glide[0]), q(p.glide[1]), q(p.glide[2])]
      : null,
  };
}

/* ------------------------------------------------------------------ */
/* Glottal source — buzzy impulse train                                */
/* ------------------------------------------------------------------ */

function glottalSource(
  n: number, f0: number, jitter: number, rand: () => number,
): Samples {
  const out = alloc(n);
  let t = 0;
  while (t < n) {
    let period = SR / f0;
    period *= 1 + (rand() * 2 - 1) * jitter;
    const idx = Math.floor(t);
    if (idx < n) {
      // Two-sample ramp rather than a single spike. A pure impulse
      // train is unbearably harsh; this is one step back from that.
      out[idx] = 1.0;
      if (idx + 1 < n) out[idx + 1] = -0.55;
    }
    t += period;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Time-varying two-pole resonator                                     */
/* ------------------------------------------------------------------ */

/**
 * Coefficients update every `block` samples rather than every sample.
 *
 * This is worse by conventional standards and correct here: the real
 * chip switched its analog filters at a fixed low rate, producing
 * audible stepping during formant transitions.
 */
function formantFilter(
  x: Samples, freq: Samples, bw: number, block: number,
): Samples {
  const out = alloc(x.length);
  let y1 = 0, y2 = 0;

  for (let start = 0; start < x.length; start += block) {
    const end = Math.min(start + block, x.length);

    let sum = 0;
    for (let i = start; i < end; i++) sum += freq[i]!;
    let f = sum / (end - start);
    f = Math.max(80, Math.min(f, SR / 2 - 200));

    const r = Math.exp((-Math.PI * bw) / SR);
    const theta = (2 * Math.PI * f) / SR;
    const a1 = 2 * r * Math.cos(theta);
    const a2 = -(r * r);
    const gain =
      (1 - r) * Math.sqrt(1 - 2 * r * Math.cos(2 * theta) + r * r);

    for (let i = start; i < end; i++) {
      const y = gain * x[i]! + a1 * y1 + a2 * y2;
      out[i] = y;
      y2 = y1;
      y1 = y;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Formant track construction                                          */
/* ------------------------------------------------------------------ */

interface Tracks {
  f1: Samples; f2: Samples; f3: Samples;
  amp: Samples; noise: Samples; voiced: Samples;
  bw1: number; bw2: number; bw3: number;
  total: number;
}

function buildTracks(phones: QPhone[], transition: number): Tracks {
  const lens = phones.map((p) => Math.max(1, Math.floor(p.dur * SR)));
  const total = lens.reduce((a, b) => a + b, 0);

  const f1 = alloc(total);
  const f2 = alloc(total);
  const f3 = alloc(total);
  const amp = alloc(total);
  const noise = alloc(total);
  const voiced = alloc(total);

  let bwSum1 = 0, bwSum2 = 0, bwSum3 = 0;

  let pos = 0;
  phones.forEach((p, pi) => {
    const n = lens[pi]!;
    for (let i = 0; i < n; i++) {
      const k = pos + i;
      if (p.glide) {
        // Diphthong: interpolate from the first target to the second
        // across the phoneme's duration.
        const t = i / Math.max(1, n - 1);
        f1[k] = p.f1 + (p.glide[0] - p.f1) * t;
        f2[k] = p.f2 + (p.glide[1] - p.f2) * t;
        f3[k] = p.f3 + (p.glide[2] - p.f3) * t;
      } else {
        f1[k] = p.f1; f2[k] = p.f2; f3[k] = p.f3;
      }
      amp[k] = p.amp;
      noise[k] = p.noise;
      voiced[k] = p.voiced ? 1 : 0;
    }
    bwSum1 += p.bw[0] * n; bwSum2 += p.bw[1] * n; bwSum3 += p.bw[2] * n;
    pos += n;
  });

  // Linear crossfade of formant targets at phoneme boundaries. The real
  // chip interpolated crudely, so a short linear ramp is closer than a
  // smooth curve.
  const tn = Math.max(2, Math.floor(transition * SR));
  pos = 0;
  for (let pi = 0; pi < phones.length - 1; pi++) {
    pos += lens[pi]!;
    const a = Math.max(0, pos - (tn >> 1));
    const b = Math.min(total, pos + (tn >> 1));
    if (b <= a + 1) continue;

    const span = b - a;
    const startF1 = f1[a]!, endF1 = f1[b - 1]!;
    const startF2 = f2[a]!, endF2 = f2[b - 1]!;
    const startF3 = f3[a]!, endF3 = f3[b - 1]!;
    const startA = amp[a]!, endA = amp[b - 1]!;

    for (let i = 0; i < span; i++) {
      const t = i / (span - 1);
      f1[a + i] = startF1 * (1 - t) + endF1 * t;
      f2[a + i] = startF2 * (1 - t) + endF2 * t;
      f3[a + i] = startF3 * (1 - t) + endF3 * t;
      amp[a + i] = startA * (1 - t) + endA * t;
    }
  }

  return {
    f1, f2, f3, amp, noise, voiced,
    bw1: bwSum1 / total, bw2: bwSum2 / total, bw3: bwSum3 / total,
    total,
  };
}

/* ------------------------------------------------------------------ */
/* Resampling — linear, adequate for this purpose                      */
/* ------------------------------------------------------------------ */

/**
 * Windowed-sinc resampler, 8 taps either side.
 *
 * Linear interpolation was tried first and rejected: it adds broadband
 * noise across the whole spectrum, which shows up as several percent of
 * energy above the chip's ceiling — exactly the region the bandwidth
 * limit is supposed to empty. The noise is inaudible on its own but it
 * defeats the analysis readout and muddies the character.
 */
function resample(x: Samples, fromSr: number, toSr: number): Samples {
  if (fromSr === toSr) return x;
  const ratio = toSr / fromSr;
  const n = Math.max(1, Math.floor(x.length * ratio));
  const out = alloc(n);

  const TAPS = 8;
  const WIDTH = TAPS * 2 + 1;
  const cutoff = Math.min(1, ratio);   // scale sinc when decimating

  // Precompute coefficients on a fractional-position grid. Without this
  // the sin() calls dominate and a long utterance takes >100 ms, which
  // is too slow for live slider feedback.
  const PHASES = 128;
  const table = new Float64Array(PHASES * WIDTH);
  const norms = new Float64Array(PHASES);

  for (let p = 0; p < PHASES; p++) {
    const frac = p / PHASES;
    let sum = 0;
    for (let t = -TAPS; t <= TAPS; t++) {
      const d = frac - t;
      const dist = d * cutoff;
      let sinc: number;
      if (Math.abs(dist) < 1e-9) {
        sinc = 1;
      } else {
        const pd = Math.PI * dist;
        sinc = Math.sin(pd) / pd;
      }
      const wpos = d / (TAPS + 1);
      let w = 0;
      if (Math.abs(wpos) <= 1) {
        const a = Math.PI * (wpos + 1) * 0.5;
        w = 0.42 - 0.5 * Math.cos(2 * a) + 0.08 * Math.cos(4 * a);
      }
      const coef = sinc * w;
      table[p * WIDTH + (t + TAPS)] = coef;
      sum += coef;
    }
    norms[p] = sum !== 0 ? 1 / sum : 0;
  }

  const len = x.length;
  for (let i = 0; i < n; i++) {
    const src = i / ratio;
    const center = Math.floor(src);
    const p = Math.min(PHASES - 1, Math.floor((src - center) * PHASES));
    const base = p * WIDTH;

    let acc = 0;
    for (let t = -TAPS; t <= TAPS; t++) {
      const idx = center + t;
      if (idx < 0 || idx >= len) continue;
      acc += x[idx]! * table[base + (t + TAPS)]!;
    }
    out[i] = acc * norms[p]!;
  }
  return out;
}

/** Simple one-pole lowpass, used as an anti-alias guard before decimation. */
function onePoleLowpass(x: Samples, cutoff: number): Samples {
  const out = alloc(x.length);
  const dt = 1 / SR;
  const rc = 1 / (2 * Math.PI * cutoff);
  const alpha = dt / (rc + dt);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += alpha * (x[i]! - y);
    out[i] = y;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Main synthesis                                                      */
/* ------------------------------------------------------------------ */

export interface SynthResult {
  audio: Samples;
  sampleRate: number;
  durationSec: number;
  phonemeCount: number;
}

export function synth(
  phonemeNames: readonly string[],
  params: Partial<SynthParams> = {},
): SynthResult {
  const P: SynthParams = { ...DEFAULT_PARAMS, ...params };
  const rand = mulberry32(P.seed);
  const normal = makeNormal(rand);

  // Resolve and quantize.
  //
  // A trailing ':' marks a stressed phoneme and lengthens it. The SC-01
  // had no stress model, but the HOST could send a longer duration for
  // a phoneme, which is how arcade programmers got stress out of it. So
  // this is period-plausible rather than a modern addition.
  const base: QPhone[] = [];
  for (const raw of phonemeNames) {
    let name = raw;
    let stress = 1;
    while (name.endsWith(':')) {
      name = name.slice(0, -1);
      stress *= P.stressScale;
    }
    const ph = PHONES[name];
    if (!ph) throw new Error(`unknown phoneme: ${raw}`);
    const q = quantizeFormants(ph, P.quantStep);
    base.push({ ...q, dur: q.dur * P.rate * stress });
  }
  if (base.length === 0) {
    return { audio: alloc(0), sampleRate: SR,
             durationSec: 0, phonemeCount: 0 };
  }

  // Insert closure silence before each plosive. A plosive is physically
  // a closure followed by a release burst; without the silence, stops
  // read as brief noise rather than as stops.
  const phones: QPhone[] = [];
  for (const p of base) {
    if (p.stop) {
      phones.push({
        ...p, name: `${p.name}_cl`, dur: P.closure * P.rate,
        voiced: false, noise: 0, amp: 0, stop: false, glide: null,
      });
    }
    phones.push(p);
  }

  const tr = buildTracks(phones, P.transition);
  const n = tr.total;

  // --- source -------------------------------------------------------
  // Flat pitch with slow random drift. NO TERMINAL FALL — the chip had
  // no phrase-level intonation model, which is why its lines always
  // sounded like fragments. Adding a fall makes this sound like cheap
  // modern TTS.
  const ctrlN = Math.max(2, Math.floor(n / 512) + 2);
  const walk = alloc(ctrlN);
  let acc = 0;
  for (let i = 0; i < ctrlN; i++) { acc += normal(); walk[i] = acc; }
  let maxAbs = 0;
  for (let i = 0; i < ctrlN; i++) maxAbs = Math.max(maxAbs, Math.abs(walk[i]!));
  const scale = maxAbs > 0 ? P.drift / maxAbs : 0;

  let f0Mean = 0;
  for (let i = 0; i < ctrlN; i++) f0Mean += P.pitch * (1 + walk[i]! * scale);
  f0Mean /= ctrlN;

  const voiceSrc = glottalSource(n, f0Mean, P.jitter, rand);

  const src = alloc(n);
  for (let i = 0; i < n; i++) {
    const noiseVal = normal() * 0.5;
    const v = voiceSrc[i]! * tr.voiced[i]! * (1 - tr.noise[i]! * 0.6);
    src[i] = (v + noiseVal * tr.noise[i]!) * tr.amp[i]!;
  }

  // --- cascade of three formant resonators --------------------------
  let out = formantFilter(src, tr.f1, tr.bw1, P.block);
  out = formantFilter(out, tr.f2, tr.bw2, P.block);
  out = formantFilter(out, tr.f3, tr.bw3, P.block);

  // Spectral tilt — the chip's output stage rolled off.
  out = onePoleLowpass(out, 3000);

  // --- the bandwidth limit that does most of the work ---------------
  // Guard against aliasing, decimate to the chip rate, quantize to the
  // DAC's resolution, then bring it back up. Everything above
  // chipSr/2 is gone, which is the single largest contributor to the
  // vintage character.
  out = onePoleLowpass(out, Math.min(P.chipSr / 2.2, 8000));
  let down = resample(out, SR, P.chipSr);

  let peak = 0;
  for (let i = 0; i < down.length; i++) peak = Math.max(peak, Math.abs(down[i]!));
  peak = peak || 1e-9;
  const lv = P.quantLevels;
  for (let i = 0; i < down.length; i++) {
    down[i] = (Math.round((down[i]! / peak) * lv) / lv) * peak;
  }

  out = resample(down, P.chipSr, SR);
  if (out.length < n) {
    const padded = alloc(n);
    padded.set(out);
    out = padded;
  } else if (out.length > n) {
    const trimmed = alloc(n);
    trimmed.set(out.subarray(0, n));
    out = trimmed;
  }

  // --- cheap amplifier ----------------------------------------------
  peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]!));
  peak = peak || 1e-9;
  const den = Math.tanh(P.drive);
  const result = alloc(out.length);
  for (let i = 0; i < out.length; i++) {
    result[i] = (Math.tanh((out[i]! / peak) * P.drive) / den) * 0.82;
  }

  // Short fades to avoid clicks.
  const fade = Math.min(Math.floor(0.005 * SR), result.length >> 1);
  for (let i = 0; i < fade; i++) {
    result[i] = result[i]! * (i / fade);
    result[result.length - 1 - i] = result[result.length - 1 - i]! * (i / fade);
  }

  return {
    audio: result,
    sampleRate: SR,
    durationSec: result.length / SR,
    phonemeCount: phonemeNames.length,
  };
}

/* ------------------------------------------------------------------ */
/* Analysis helper — band energy, for the bench readout                */
/* ------------------------------------------------------------------ */

export interface BandEnergy {
  label: string;
  lo: number;
  hi: number;
  percent: number;
}

/**
 * Band energy via averaged periodogram.
 *
 * IMPORTANT: this must analyze at the FULL sample rate. An earlier
 * version decimated the signal to keep the DFT cheap, which dropped
 * Nyquist below 4 kHz and made the "above chip limit" band read 0.0%
 * unconditionally — the readout looked correct while measuring nothing.
 *
 * Instead, average several full-rate windows across the utterance. Cost
 * is bounded by window count, not by signal length.
 */
export function bandEnergy(
  audio: Samples, sampleRate = SR,
): BandEnergy[] {
  const bands: Array<[string, number, number]> = [
    ['F1 region', 0, 500],
    ['F2 region', 500, 1500],
    ['F3 region', 1500, 3000],
    ['Rolloff', 3000, 4000],
    ['Above chip limit', 4000, sampleRate / 2],
  ];

  const N = 1024;                 // window size, full rate
  const nBins = N >> 1;
  const mag = new Float64Array(nBins);

  if (audio.length < N) {
    return bands.map(([label, lo, hi]) => ({ label, lo, hi, percent: 0 }));
  }

  // Up to 12 windows spread across the utterance.
  const nWin = Math.min(12, Math.max(1, Math.floor(audio.length / N)));
  const hop = Math.floor((audio.length - N) / Math.max(1, nWin - 1)) || N;

  // Precompute the Hann window and the DFT twiddles.
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  }
  const cosT = new Float64Array(nBins * N);
  const sinT = new Float64Array(nBins * N);
  for (let k = 0; k < nBins; k++) {
    const w = (-2 * Math.PI * k) / N;
    for (let t = 0; t < N; t++) {
      cosT[k * N + t] = Math.cos(w * t);
      sinT[k * N + t] = Math.sin(w * t);
    }
  }

  const seg = new Float64Array(N);
  for (let wi = 0; wi < nWin; wi++) {
    const off = Math.min(wi * hop, audio.length - N);
    for (let i = 0; i < N; i++) seg[i] = audio[off + i]! * win[i]!;

    for (let k = 0; k < nBins; k++) {
      let re = 0, im = 0;
      const base = k * N;
      for (let t = 0; t < N; t++) {
        re += seg[t]! * cosT[base + t]!;
        im += seg[t]! * sinT[base + t]!;
      }
      mag[k] = (mag[k] ?? 0) + Math.sqrt(re * re + im * im);
    }
  }

  let total = 0;
  for (let k = 0; k < nBins; k++) total += mag[k]!;
  total = total || 1e-9;

  const binHz = sampleRate / N;
  return bands.map(([label, lo, hi]) => {
    let sum = 0;
    for (let k = 0; k < nBins; k++) {
      const f = k * binHz;
      if (f >= lo && f < hi) sum += mag[k]!;
    }
    return { label, lo, hi, percent: (sum / total) * 100 };
  });
}

/* ------------------------------------------------------------------ */
/* WAV export                                                          */
/* ------------------------------------------------------------------ */

export function toWavBlob(audio: Samples, sampleRate = SR): Blob {
  const buf = new ArrayBuffer(44 + audio.length * 2);
  const view = new DataView(buf);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + audio.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, audio.length * 2, true);

  let off = 44;
  for (let i = 0; i < audio.length; i++) {
    const s = Math.max(-1, Math.min(1, audio[i]!));
    view.setInt16(off, s * 32767, true);
    off += 2;
  }
  return new Blob([buf], { type: 'audio/wav' });
}
