/**
 * Rovacon Voice Tuning Bench.
 *
 * Purpose: answer VQ-01 — does runtime formant synthesis sound vintage,
 * or merely broken?
 *
 * Type a word or phrase, move sliders, hear the result immediately.
 * Everything renders on the main thread; a 1.5 s utterance takes roughly
 * 15–40 ms, which is fast enough that slider drags feel live.
 */

import {
  synth, bandEnergy, toWavBlob, SR,
  DEFAULT_PARAMS, type SynthParams, type Samples,
} from '../voice/synth';
import { PHONEME_GROUPS } from '../voice/phonemes';
import {
  textToPhonemes, parsePhonemeString, isKnownPhoneme, LEXICON_WORDS,
} from '../voice/g2p';
import { UTTERANCES } from '../voice/utterances';

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

interface Preset {
  name: string;
  note: string;
  params: Partial<SynthParams>;
}

const PRESETS: Preset[] = [
  { name: 'Default', note: 'Doc 10 baseline', params: {} },
  { name: 'Gorf',    note: 'Buzzier, more abrupt, lower bandwidth',
    params: { chipSr: 7000, jitter: 0.040, transition: 0.012, drive: 2.6 } },
  { name: 'Berzerk', note: 'Lower pitch, harsher',
    params: { pitch: 96, jitter: 0.030, transition: 0.018, drive: 2.8,
              chipSr: 7500 } },
  { name: 'Very degraded', note: 'Pushes every knob toward broken',
    params: { chipSr: 5500, jitter: 0.055, transition: 0.008, quantStep: 100,
              quantLevels: 48, drive: 3.2 } },
  { name: 'Clean', note: 'What it sounds like WITHOUT the vintage treatment',
    params: { chipSr: 16000, jitter: 0.004, transition: 0.055, quantStep: 5,
              quantLevels: 4096, drive: 1.2 } },
  { name: 'Speak & Spell-ish', note: 'Smoother, for A/B comparison',
    params: { chipSr: 10000, jitter: 0.008, transition: 0.050, quantStep: 25,
              pitch: 138 } },
];

let params: SynthParams = { ...DEFAULT_PARAMS };
let phonemes: string[] = ['R', 'OH', 'V', 'AH', 'K', 'AA', 'N'];
let lastAudio: Samples = new Float32Array(new ArrayBuffer(0)) as Samples;
let audioCtx: AudioContext | null = null;
let autoPlay = true;
let renderTimer: number | null = null;

/* ------------------------------------------------------------------ */
/* Slider definitions                                                  */
/* ------------------------------------------------------------------ */

interface SliderDef {
  key: keyof SynthParams;
  label: string;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  hint: string;
  critical?: boolean;
}

const SLIDERS: SliderDef[] = [
  { key: 'chipSr', label: 'Chip bandwidth', min: 4000, max: 20000, step: 250,
    fmt: (v) => `${(v / 1000).toFixed(1)} kHz`,
    hint: 'THE most important parameter. Lower = more vintage. SC-01 ≈ 8 kHz.',
    critical: true },
  { key: 'pitch', label: 'Pitch', min: 70, max: 200, step: 1,
    fmt: (v) => `${v.toFixed(0)} Hz`,
    hint: 'Lower reads as larger and more menacing.' },
  { key: 'jitter', label: 'Glottal jitter', min: 0, max: 0.10, step: 0.001,
    fmt: (v) => `${(v * 100).toFixed(1)}%`,
    hint: 'Period randomization. Higher = buzzier, less stable.' },
  { key: 'drift', label: 'Pitch drift', min: 0, max: 0.06, step: 0.001,
    fmt: (v) => `${(v * 100).toFixed(1)}%`,
    hint: 'Slow oscillator wander. Never add a terminal fall.' },
  { key: 'transition', label: 'Formant transition', min: 0.004, max: 0.080,
    step: 0.002, fmt: (v) => `${(v * 1000).toFixed(0)} ms`,
    hint: 'Lower = more mechanical, more abrupt between sounds.',
    critical: true },
  { key: 'quantStep', label: 'Formant quantization', min: 0, max: 150, step: 5,
    fmt: (v) => (v === 0 ? 'off' : `${v} Hz`),
    hint: 'Coarse grid puts vowels beside their targets. Higher = alien.',
    critical: true },
  { key: 'block', label: 'Filter update block', min: 8, max: 256, step: 8,
    fmt: (v) => `${v} smp`,
    hint: 'Higher = more audible stepping during transitions.' },
  { key: 'quantLevels', label: 'DAC levels', min: 16, max: 2048, step: 8,
    fmt: (v) => `${v} (~${Math.log2(v).toFixed(1)} bit)`,
    hint: 'Output quantization. SC-01 was roughly 8-bit.' },
  { key: 'drive', label: 'Amp drive', min: 0.5, max: 4, step: 0.05,
    fmt: (v) => v.toFixed(2),
    hint: 'tanh saturation. Cheap amplifier into a cheap speaker.' },
  { key: 'rate', label: 'Speech rate', min: 0.5, max: 2.0, step: 0.05,
    fmt: (v) => `${v.toFixed(2)}×`,
    hint: 'Duration multiplier. Long utterances may need > 1.' },
  { key: 'closure', label: 'Plosive closure', min: 0, max: 0.08, step: 0.005,
    fmt: (v) => `${(v * 1000).toFixed(0)} ms`,
    hint: 'Silence before stops. Too short and P/T/K read as noise.' },
  { key: 'stressScale', label: 'Stress lengthening', min: 1, max: 2.5,
    step: 0.05, fmt: (v) => `${v.toFixed(2)}×`,
    hint: 'Multiplier per trailing colon. Mark stress as AA: in the phoneme field.' },
  { key: 'seed', label: 'Seed', min: 1, max: 999, step: 1,
    fmt: (v) => `${v}`,
    hint: 'Changes jitter and noise realization only.' },
];

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function scheduleRender(play: boolean): void {
  if (renderTimer !== null) clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => doRender(play), 40);
}

function doRender(play: boolean): void {
  if (phonemes.length === 0) return;

  const t0 = performance.now();
  let result;
  try {
    result = synth(phonemes, params);
  } catch (err) {
    setStatus(`Error: ${(err as Error).message}`, true);
    return;
  }
  const elapsed = performance.now() - t0;

  lastAudio = result.audio;
  drawWaveform(result.audio);
  updateAnalysis(result.audio, result.durationSec, elapsed);

  if (play && autoPlay) playAudio();
}

function playAudio(): void {
  if (lastAudio.length === 0) return;
  if (!audioCtx) audioCtx = new AudioContext();
  void audioCtx.resume();

  const buf = audioCtx.createBuffer(1, lastAudio.length, SR);
  buf.copyToChannel(lastAudio, 0);
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.connect(audioCtx.destination);
  src.start();
}

/* ------------------------------------------------------------------ */
/* Visualization                                                       */
/* ------------------------------------------------------------------ */

function drawWaveform(audio: Samples): void {
  const cv = document.getElementById('wave') as HTMLCanvasElement;
  const ctx = cv.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * dpr; cv.height = h * dpr;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#12100c';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#3a352b';
  ctx.beginPath();
  ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
  ctx.stroke();

  if (audio.length === 0) return;

  const step = Math.max(1, Math.floor(audio.length / w));
  ctx.strokeStyle = '#00a6ed';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < w; x++) {
    let min = 1, max = -1;
    const start = x * step;
    for (let i = 0; i < step && start + i < audio.length; i++) {
      const v = audio[start + i]!;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    ctx.moveTo(x + 0.5, ((1 - max) * h) / 2);
    ctx.lineTo(x + 0.5, ((1 - min) * h) / 2);
  }
  ctx.stroke();
}

function updateAnalysis(
  audio: Samples, dur: number, renderMs: number,
): void {
  const bands = bandEnergy(audio);
  const above = bands.find((b) => b.lo === 4000)!;

  const rows = bands.map((b) => {
    const warn = b.lo === 4000 && b.percent > 5;
    const barW = Math.min(100, b.percent);
    return `<div class="band">
      <span class="band-label">${b.label}</span>
      <span class="band-range">${b.lo}–${b.hi}</span>
      <div class="band-bar"><div class="band-fill${warn ? ' warn' : ''}"
        style="width:${barW}%"></div></div>
      <span class="band-pct${warn ? ' warn' : ''}">${b.percent.toFixed(1)}%</span>
    </div>`;
  }).join('');

  document.getElementById('bands')!.innerHTML = rows;

  const verdict = above.percent > 5
    ? '<span class="warn">Bandwidth limit not applying — check chip rate</span>'
    : '<span class="ok">Bandwidth limit confirmed</span>';

  document.getElementById('stats')!.innerHTML =
    `${dur.toFixed(2)}s &middot; ${phonemes.length} phonemes &middot; ` +
    `rendered in ${renderMs.toFixed(0)}ms &middot; ${verdict}`;
}

/* ------------------------------------------------------------------ */
/* Input handling                                                      */
/* ------------------------------------------------------------------ */

function updateFromText(): void {
  const text = (document.getElementById('textIn') as HTMLTextAreaElement).value;
  const res = textToPhonemes(text);
  phonemes = res.phonemes;

  const breakdown = res.words.map((w) =>
    `<span class="word"><b>${escapeHtml(w.text)}</b>` +
    `<span class="ph">${w.phonemes.join(' ') || '—'}</span></span>`,
  ).join('');

  document.getElementById('breakdown')!.innerHTML = breakdown;
  (document.getElementById('phonemeIn') as HTMLTextAreaElement).value =
    phonemes.join(' ');

  const note = res.usedLexicon
    ? 'Some words came from the hand-written lexicon.'
    : 'All words converted by rule — expect errors. Edit the phoneme field to correct.';
  document.getElementById('g2pNote')!.textContent = note;

  scheduleRender(true);
}

function updateFromPhonemes(): void {
  const raw = (document.getElementById('phonemeIn') as HTMLTextAreaElement).value;
  const parsed = parsePhonemeString(raw);
  const unknown = parsed.filter((p) => !isKnownPhoneme(p));

  if (unknown.length > 0) {
    setStatus(`Unknown phoneme${unknown.length > 1 ? 's' : ''}: ` +
              unknown.join(', '), true);
    return;
  }
  setStatus('', false);
  phonemes = parsed;
  document.getElementById('breakdown')!.innerHTML = '';
  scheduleRender(true);
}

function setStatus(msg: string, isError: boolean): void {
  const el = document.getElementById('status')!;
  el.textContent = msg;
  el.className = isError ? 'status warn' : 'status';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

/* ------------------------------------------------------------------ */
/* UI construction                                                     */
/* ------------------------------------------------------------------ */

function buildSliders(): void {
  const host = document.getElementById('sliders')!;
  host.innerHTML = SLIDERS.map((s) => `
    <div class="slider${s.critical ? ' critical' : ''}">
      <div class="slider-head">
        <label for="sl-${s.key}">${s.label}</label>
        <output id="out-${s.key}">${s.fmt(params[s.key] as number)}</output>
      </div>
      <input type="range" id="sl-${s.key}"
             min="${s.min}" max="${s.max}" step="${s.step}"
             value="${params[s.key]}">
      <p class="hint">${s.hint}</p>
    </div>`).join('');

  for (const s of SLIDERS) {
    const el = document.getElementById(`sl-${s.key}`) as HTMLInputElement;
    const out = document.getElementById(`out-${s.key}`)!;
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      params = { ...params, [s.key]: v };
      out.textContent = s.fmt(v);
      scheduleRender(false);
    });
    el.addEventListener('change', () => scheduleRender(true));
  }
}

function syncSliders(): void {
  for (const s of SLIDERS) {
    const el = document.getElementById(`sl-${s.key}`) as HTMLInputElement;
    const out = document.getElementById(`out-${s.key}`)!;
    const v = params[s.key] as number;
    el.value = String(v);
    out.textContent = s.fmt(v);
  }
}

function buildPresets(): void {
  const host = document.getElementById('presets')!;
  host.innerHTML = PRESETS.map((p, i) =>
    `<button class="preset" data-i="${i}" title="${p.note}">${p.name}</button>`,
  ).join('');

  host.querySelectorAll<HTMLButtonElement>('.preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = PRESETS[parseInt(btn.dataset.i!, 10)]!;
      params = { ...DEFAULT_PARAMS, ...p.params };
      syncSliders();
      setStatus(p.note, false);
      scheduleRender(true);
    });
  });
}

function buildUtteranceButtons(): void {
  const host = document.getElementById('utterances')!;
  host.innerHTML = UTTERANCES.map((u) =>
    `<button class="utt" data-id="${u.id}" title="${u.trigger}">
       ${u.label}<span class="reads">${u.readsAs}</span></button>`,
  ).join('');

  host.querySelectorAll<HTMLButtonElement>('.utt').forEach((btn) => {
    btn.addEventListener('click', () => {
      const u = UTTERANCES.find((x) => x.id === btn.dataset.id)!;
      phonemes = [...u.phonemes];
      (document.getElementById('phonemeIn') as HTMLTextAreaElement).value =
        phonemes.join(' ');
      (document.getElementById('textIn') as HTMLTextAreaElement).value =
        u.label;
      document.getElementById('breakdown')!.innerHTML = '';
      scheduleRender(true);
    });
  });
}

function buildPhonemeReference(): void {
  const host = document.getElementById('phref')!;
  host.innerHTML = Object.entries(PHONEME_GROUPS).map(([group, list]) => `
    <div class="phgroup">
      <h4>${group}</h4>
      <div class="phchips">
        ${list.map((p) => `<button class="chip" data-p="${p}">${p}</button>`)
          .join('')}
      </div>
    </div>`).join('');

  host.querySelectorAll<HTMLButtonElement>('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ta = document.getElementById('phonemeIn') as HTMLTextAreaElement;
      ta.value = `${ta.value.trim()} ${btn.dataset.p}`.trim();
      updateFromPhonemes();
    });
  });
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

function init(): void {
  buildSliders();
  buildPresets();
  buildUtteranceButtons();
  buildPhonemeReference();

  document.getElementById('lexicon')!.textContent =
    `Lexicon: ${LEXICON_WORDS.join(', ')}`;

  const textIn = document.getElementById('textIn') as HTMLTextAreaElement;
  const phIn = document.getElementById('phonemeIn') as HTMLTextAreaElement;

  textIn.addEventListener('input', () => updateFromText());
  phIn.addEventListener('input', () => updateFromPhonemes());

  document.getElementById('play')!.addEventListener('click', () => {
    if (!audioCtx) audioCtx = new AudioContext();
    void audioCtx.resume();
    playAudio();
  });

  document.getElementById('reset')!.addEventListener('click', () => {
    params = { ...DEFAULT_PARAMS };
    syncSliders();
    setStatus('Reset to Doc 10 defaults.', false);
    scheduleRender(true);
  });

  const autoEl = document.getElementById('auto') as HTMLInputElement;
  autoEl.addEventListener('change', () => { autoPlay = autoEl.checked; });

  document.getElementById('download')!.addEventListener('click', () => {
    if (lastAudio.length === 0) return;
    const blob = toWavBlob(lastAudio);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const name = phonemes.slice(0, 6).join('-').toLowerCase() || 'utterance';
    a.download = `rovacon-${name}.wav`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('copyParams')!.addEventListener('click', () => {
    const diff: Record<string, number> = {};
    for (const k of Object.keys(params) as Array<keyof SynthParams>) {
      if (params[k] !== DEFAULT_PARAMS[k]) diff[k] = params[k] as number;
    }
    const text = Object.keys(diff).length === 0
      ? '{ /* defaults */ }'
      : JSON.stringify(diff, null, 2);
    void navigator.clipboard.writeText(text);
    setStatus('Non-default parameters copied to clipboard.', false);
  });

  // Space bar replays.
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      playAudio();
    }
  });

  updateFromText();
  doRender(false);
}

document.addEventListener('DOMContentLoaded', init);
