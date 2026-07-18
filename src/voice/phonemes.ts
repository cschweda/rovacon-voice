/**
 * Phoneme inventory for the Votrax SC-01 style formant synthesizer.
 *
 * Formant values are broadly from standard American English vowel data,
 * then coarsened at synthesis time (see quantizeFormants). The SC-01 had
 * a small fixed inventory and could not hit precise targets, so the
 * quantization is deliberate — it puts vowels slightly beside their
 * natural positions, which is a large part of the character.
 */

export interface Phone {
  readonly name: string;
  readonly f1: number;          // first formant, Hz
  readonly f2: number;          // second formant, Hz
  readonly f3: number;          // third formant, Hz
  readonly dur: number;         // seconds
  readonly voiced: boolean;     // glottal source vs noise
  readonly noise: number;       // 0..1 fricative noise mix
  readonly amp: number;         // relative amplitude
  readonly stop: boolean;       // plosive — silence then burst
  readonly bw: readonly [number, number, number];   // formant bandwidths
  /** Optional second formant target for diphthong glides. */
  readonly glide?: readonly [number, number, number];
}

function p(
  name: string, f1: number, f2: number, f3: number, dur: number,
  opts: Partial<Omit<Phone, 'name' | 'f1' | 'f2' | 'f3' | 'dur'>> = {},
): Phone {
  return {
    name, f1, f2, f3, dur,
    voiced: opts.voiced ?? true,
    noise: opts.noise ?? 0,
    amp: opts.amp ?? 1,
    stop: opts.stop ?? false,
    bw: opts.bw ?? [90, 110, 170],
    ...(opts.glide ? { glide: opts.glide } : {}),
  };
}

export const PHONES: Readonly<Record<string, Phone>> = {
  // --- vowels -------------------------------------------------------
  IY: p('IY', 270, 2300, 3000, 0.13),   // beet
  IH: p('IH', 400, 2000, 2550, 0.09),   // bit
  EH: p('EH', 530, 1850, 2500, 0.10),   // bet
  AE: p('AE', 660, 1700, 2400, 0.12),   // bat
  AA: p('AA', 730, 1100, 2450, 0.13),   // father
  AH: p('AH', 640, 1200, 2400, 0.09),   // but
  AO: p('AO', 570,  850, 2400, 0.13),   // bought
  OH: p('OH', 500,  900, 2300, 0.13),   // boat
  UH: p('UH', 440, 1000, 2250, 0.08),   // book
  UW: p('UW', 300,  850, 2250, 0.13),   // boot
  ER: p('ER', 490, 1350, 1700, 0.12),   // bird

  // --- diphthongs (two-target glides, per VQ-04) ---------------------
  AY: p('AY', 660, 1700, 2400, 0.17, { glide: [350, 2100, 2600] }), // bite
  OY: p('OY', 550,  950, 2400, 0.17, { glide: [350, 2100, 2600] }), // boy
  AW: p('AW', 700, 1200, 2400, 0.17, { glide: [350,  850, 2250] }), // bout
  EY: p('EY', 500, 1900, 2500, 0.16, { glide: [330, 2200, 2800] }), // bait

  // --- semivowels / liquids ------------------------------------------
  R: p('R', 350, 1050, 1600, 0.08),
  L: p('L', 400, 1100, 2600, 0.07),
  W: p('W', 300,  800, 2200, 0.06),
  Y: p('Y', 280, 2200, 2900, 0.06),

  // --- nasals ---------------------------------------------------------
  M: p('M', 250, 1100, 2200, 0.08, { bw: [120, 180, 240], amp: 0.7 }),
  N: p('N', 250, 1600, 2600, 0.08, { bw: [120, 180, 240], amp: 0.7 }),
  NG: p('NG', 250, 1900, 2600, 0.09, { bw: [140, 200, 260], amp: 0.65 }),

  // --- fricatives -----------------------------------------------------
  // Amplitudes are boosted relative to natural speech because most of
  // their energy sits above the 4 kHz chip ceiling and gets removed.
  //
  // NOTE ON V: an earlier version had F2 at 2200 Hz, which is identical
  // to Y's F2. Because /v/'s frication noise lives mostly above the chip
  // ceiling and gets stripped, what survived was a voiced segment with
  // glide-like formants pointing at the wrong consonant — ROVACON came
  // out as "ro-YAH-kan". Real /v/ is labiodental with a LOW F2 (~1100).
  // Noise was also raised so more consonantal texture survives the
  // bandwidth limit.
  S:  p('S',  1400, 4200, 5500, 0.11,
        { voiced: false, noise: 1, amp: 0.80, bw: [200, 350, 500] }),
  Z:  p('Z',   350, 4000, 5200, 0.09,
        { noise: 0.75, amp: 0.70, bw: [200, 350, 500] }),
  F:  p('F',  1100, 2400, 3800, 0.10,
        { voiced: false, noise: 1, amp: 0.50, bw: [250, 400, 600] }),
  V:  p('V',   300, 1100, 2400, 0.085,
        { noise: 0.75, amp: 0.62, bw: [180, 320, 480] }),
  TH: p('TH', 1200, 2600, 4000, 0.09,
        { voiced: false, noise: 1, amp: 0.45, bw: [250, 400, 600] }),
  DH: p('DH',  350, 2200, 3400, 0.08,
        { noise: 0.55, amp: 0.5, bw: [220, 360, 520] }),
  SH: p('SH', 1800, 2600, 3600, 0.11,
        { voiced: false, noise: 1, amp: 0.75, bw: [200, 300, 450] }),
  ZH: p('ZH',  350, 2500, 3500, 0.09,
        { noise: 0.7, amp: 0.6, bw: [200, 300, 450] }),
  HH: p('HH',  600, 1500, 2500, 0.06,
        { voiced: false, noise: 1, amp: 0.25, bw: [300, 400, 600] }),

  // --- plosives (closure inserted at synthesis time) -------------------
  P: p('P', 500,  900, 2200, 0.055,
       { voiced: false, noise: 1, amp: 0.55, stop: true }),
  B: p('B', 350,  900, 2200, 0.050, { noise: 0.4, amp: 0.5, stop: true }),
  T: p('T', 500, 1700, 2600, 0.055,
       { voiced: false, noise: 1, amp: 0.65, stop: true }),
  D: p('D', 350, 1700, 2600, 0.050, { noise: 0.4, amp: 0.5, stop: true }),
  K: p('K', 450, 1900, 2400, 0.060,
       { voiced: false, noise: 1, amp: 0.65, stop: true }),
  G: p('G', 350, 1900, 2400, 0.050, { noise: 0.4, amp: 0.5, stop: true }),

  // --- affricates -------------------------------------------------------
  CH: p('CH', 1700, 2500, 3500, 0.10,
        { voiced: false, noise: 1, amp: 0.7, stop: true, bw: [200, 300, 450] }),
  JH: p('JH',  350, 2400, 3400, 0.09,
        { noise: 0.7, amp: 0.6, stop: true, bw: [200, 300, 450] }),

  // --- silence ----------------------------------------------------------
  PA:  p('PA',  500, 1500, 2500, 0.09,
         { voiced: false, noise: 0, amp: 0 }),   // inter-word pause
  PA2: p('PA2', 500, 1500, 2500, 0.16,
         { voiced: false, noise: 0, amp: 0 }),   // longer pause
};

export const PHONEME_NAMES = Object.keys(PHONES);

/** Grouped for UI display in the bench. */
export const PHONEME_GROUPS: Readonly<Record<string, readonly string[]>> = {
  Vowels: ['IY', 'IH', 'EH', 'AE', 'AA', 'AH', 'AO', 'OH', 'UH', 'UW', 'ER'],
  Diphthongs: ['AY', 'OY', 'AW', 'EY'],
  Liquids: ['R', 'L', 'W', 'Y'],
  Nasals: ['M', 'N', 'NG'],
  Fricatives: ['S', 'Z', 'F', 'V', 'TH', 'DH', 'SH', 'ZH', 'HH'],
  Plosives: ['P', 'B', 'T', 'D', 'K', 'G'],
  Affricates: ['CH', 'JH'],
  Pauses: ['PA', 'PA2'],
};
