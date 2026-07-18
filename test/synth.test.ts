import { describe, it, expect } from 'vitest';
import { synth, bandEnergy, DEFAULT_PARAMS } from '../src/voice/synth';
import { PHONES, PHONEME_NAMES } from '../src/voice/phonemes';
import { textToPhonemes, parsePhonemeString, stripStress } from '../src/voice/g2p';
import { UTTERANCES } from '../src/voice/utterances';

const ROVACON = ['R', 'OH', 'V', 'AH', 'K', 'AA', 'N'];

describe('determinism', () => {
  it('produces identical output for the same seed', () => {
    const a = synth(ROVACON, { seed: 42 });
    const b = synth(ROVACON, { seed: 42 });
    expect(a.audio.length).toBe(b.audio.length);
    for (let i = 0; i < a.audio.length; i++) {
      expect(a.audio[i]).toBe(b.audio[i]);
    }
  });

  it('produces different output for different seeds', () => {
    const a = synth(ROVACON, { seed: 42 });
    const b = synth(ROVACON, { seed: 43 });
    let differs = false;
    for (let i = 0; i < Math.min(a.audio.length, b.audio.length); i++) {
      if (a.audio[i] !== b.audio[i]) { differs = true; break; }
    }
    expect(differs).toBe(true);
  });
});

describe('bandwidth limiting', () => {
  // This is the single most important property of the synthesis. If it
  // regresses, the vintage character is gone regardless of everything else.
  it('keeps energy above 4 kHz under 2% at the default chip rate', () => {
    for (const u of UTTERANCES) {
      const r = synth(u.phonemes, DEFAULT_PARAMS);
      const above = bandEnergy(r.audio).find((b) => b.lo === 4000)!;
      expect(above.percent, `${u.label} exceeded the limit`).toBeLessThan(2);
    }
  });

  it('passes substantially more high energy when the limit is raised', () => {
    const limited = synth(ROVACON, { chipSr: 8000 });
    const open = synth(ROVACON, { chipSr: 16000, quantStep: 5 });
    const lo = bandEnergy(limited.audio).find((b) => b.lo === 4000)!.percent;
    const hi = bandEnergy(open.audio).find((b) => b.lo === 4000)!.percent;
    expect(hi).toBeGreaterThan(lo * 3);
  });

  it('concentrates energy in the formant region', () => {
    const r = synth(ROVACON);
    const bands = bandEnergy(r.audio);
    const formant = bands
      .filter((b) => b.lo < 3000)
      .reduce((sum, b) => sum + b.percent, 0);
    expect(formant).toBeGreaterThan(90);
  });
});

describe('phoneme inventory', () => {
  it('renders every phoneme without error', () => {
    for (const name of PHONEME_NAMES) {
      expect(() => synth([name])).not.toThrow();
    }
  });

  it('rejects unknown phonemes', () => {
    expect(() => synth(['NOPE'])).toThrow(/unknown phoneme/);
  });

  it('gives every phoneme a positive duration', () => {
    for (const name of PHONEME_NAMES) {
      expect(PHONES[name]!.dur).toBeGreaterThan(0);
    }
  });

  it('handles an empty input', () => {
    const r = synth([]);
    expect(r.audio.length).toBe(0);
  });
});

describe('output shape', () => {
  it('keeps every shipping utterance under 2 seconds', () => {
    for (const u of UTTERANCES) {
      const r = synth(u.phonemes);
      expect(r.durationSec, `${u.label} is too long`).toBeLessThan(2.0);
    }
  });

  it('never clips beyond unity', () => {
    for (const u of UTTERANCES) {
      const r = synth(u.phonemes);
      for (let i = 0; i < r.audio.length; i++) {
        expect(Math.abs(r.audio[i]!)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('starts and ends near silence (fade applied)', () => {
    const r = synth(ROVACON);
    expect(Math.abs(r.audio[0]!)).toBeLessThan(0.02);
    expect(Math.abs(r.audio[r.audio.length - 1]!)).toBeLessThan(0.02);
  });

  it('renders a long utterance fast enough for live tuning', () => {
    const longest = UTTERANCES.reduce((a, b) =>
      a.phonemes.length > b.phonemes.length ? a : b);
    const t0 = performance.now();
    synth(longest.phonemes);
    expect(performance.now() - t0).toBeLessThan(250);
  });
});

describe('parameters', () => {
  it('scales duration with rate', () => {
    const normal = synth(ROVACON, { rate: 1.0 });
    const slow = synth(ROVACON, { rate: 2.0 });
    expect(slow.durationSec).toBeGreaterThan(normal.durationSec * 1.8);
  });

  it('changes output when quantization changes', () => {
    const coarse = synth(ROVACON, { quantStep: 100 });
    const fine = synth(ROVACON, { quantStep: 5 });
    let differs = false;
    for (let i = 0; i < Math.min(coarse.audio.length, fine.audio.length); i++) {
      if (Math.abs(coarse.audio[i]! - fine.audio[i]!) > 1e-6) {
        differs = true; break;
      }
    }
    expect(differs).toBe(true);
  });

  it('accepts quantization disabled', () => {
    expect(() => synth(ROVACON, { quantStep: 0 })).not.toThrow();
  });
});

describe('stress marking', () => {
  it('lengthens a phoneme marked with a colon', () => {
    const plain = synth(['AA']);
    const stressed = synth(['AA:']);
    expect(stressed.durationSec).toBeGreaterThan(plain.durationSec * 1.3);
  });

  it('compounds multiple markers', () => {
    const one = synth(['AA:']);
    const two = synth(['AA::']);
    expect(two.durationSec).toBeGreaterThan(one.durationSec * 1.3);
  });

  it('rejects an unknown phoneme even when stressed', () => {
    expect(() => synth(['NOPE:'])).toThrow(/unknown phoneme/);
  });

  it('honours stressScale', () => {
    const low = synth(['AA:'], { stressScale: 1.1 });
    const high = synth(['AA:'], { stressScale: 2.0 });
    expect(high.durationSec).toBeGreaterThan(low.durationSec * 1.5);
  });
});

describe('V phoneme (regression)', () => {
  // ROVACON was reading as "ro-YAH-kan" because V's F2 sat at 2200 Hz,
  // identical to Y. /v/ is labiodental and must have a LOW F2.
  it('keeps V well below the glide region', () => {
    expect(PHONES.V!.f2).toBeLessThan(1400);
  });

  it('keeps V and Y clearly distinct in F2', () => {
    expect(Math.abs(PHONES.V!.f2 - PHONES.Y!.f2)).toBeGreaterThan(800);
  });

  it('carries enough noise to survive the bandwidth limit', () => {
    expect(PHONES.V!.noise).toBeGreaterThanOrEqual(0.7);
  });
});

describe('g2p', () => {
  it('uses the lexicon for known words', () => {
    const r = textToPhonemes('ROVACON');
    expect(r.phonemes.map(stripStress)).toEqual(ROVACON);
    expect(r.usedLexicon).toBe(true);
  });

  it('converts unknown words by rule', () => {
    const r = textToPhonemes('zorblat');
    expect(r.phonemes.length).toBeGreaterThan(0);
    expect(r.usedLexicon).toBe(false);
  });

  it('inserts pauses between words', () => {
    const r = textToPhonemes('direct hit');
    expect(r.phonemes).toContain('PA');
  });

  it('produces only valid phonemes', () => {
    const samples = [
      'the quick brown fox jumps over the lazy dog',
      'prepare for annihilation',
      'insert coin',
      'xylophone rhythm psychology',
    ];
    for (const text of samples) {
      const r = textToPhonemes(text);
      for (const p of r.phonemes) {
        expect(PHONES[stripStress(p)], `${p} from "${text}"`).toBeDefined();
      }
    }
  });

  it('survives punctuation and mixed case', () => {
    const r = textToPhonemes('Hello, World!');
    expect(r.phonemes.length).toBeGreaterThan(0);
  });

  it('returns nothing for empty input', () => {
    expect(textToPhonemes('').phonemes).toEqual([]);
    expect(textToPhonemes('   ').phonemes).toEqual([]);
  });
});

describe('phoneme string parsing', () => {
  it('accepts several separators', () => {
    expect(parsePhonemeString('R OH V')).toEqual(['R', 'OH', 'V']);
    expect(parsePhonemeString('R.OH.V')).toEqual(['R', 'OH', 'V']);
    expect(parsePhonemeString('R / OH / V')).toEqual(['R', 'OH', 'V']);
  });

  it('uppercases and trims', () => {
    expect(parsePhonemeString('  r  oh  ')).toEqual(['R', 'OH']);
  });
});

describe('utterance set', () => {
  it('has unique ids', () => {
    const ids = UTTERANCES.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique priorities', () => {
    const p = UTTERANCES.map((u) => u.priority);
    expect(new Set(p).size).toBe(p.length);
  });

  it('references only known phonemes', () => {
    for (const u of UTTERANCES) {
      for (const p of u.phonemes) {
        expect(PHONES[stripStress(p)], `${p} in ${u.label}`).toBeDefined();
      }
    }
  });

  it('does not include a stair fall line', () => {
    // Doc 10 §3B.5 — the stair fall gets silence, deliberately.
    const ids = UTTERANCES.map((u) => u.id as string);
    expect(ids).not.toContain('STAIR_FALL');
    expect(ids).not.toContain('FALLEN');
  });
});
