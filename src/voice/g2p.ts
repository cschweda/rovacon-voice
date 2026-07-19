/**
 * Grapheme-to-phoneme conversion — English text to phoneme symbols.
 *
 * This is a rule-based converter, and English orthography being what it
 * is, it will be wrong reasonably often. It exists so the tuning bench
 * can accept plain text without forcing phoneme entry for every
 * experiment.
 *
 * For anything shipping, hand-write the phoneme string. The converter's
 * output is a starting point to be corrected, not an authority. A small
 * exception dictionary handles the words that matter most.
 *
 * Note that "wrong" here is less costly than it would be in a normal TTS
 * system: the SC-01 mispronounced things constantly, so a converter
 * error often lands within the target aesthetic anyway.
 */

import { PHONES } from './phonemes';

/** Words we care about, transcribed by hand. */
const LEXICON: Readonly<Record<string, string[]>> = {
  ROVACON: ['R', 'OH:', 'V', 'AH', 'K', 'AA:', 'N'],
  TARGET: ['T', 'AA', 'R', 'G', 'EH', 'T'],
  DESTROYED: ['D', 'IH', 'S', 'T', 'R', 'OY', 'D'],
  PAYLOAD: ['P', 'AY:', 'L', 'OH', 'D'],
  DELIVERED: ['D', 'IH', 'L', 'IH:', 'V', 'ER', 'D'],
  OPTIMAL: ['AH', 'P', 'T', 'IH', 'M', 'AH', 'L'],
  DIRECT: ['D', 'IH', 'R', 'EH', 'K', 'T'],
  HIT: ['HH', 'IH', 'T'],
  SYSTEM: ['S', 'IH', 'S', 'T', 'AH', 'M'],
  FAULT: ['F', 'AO', 'L', 'T'],
  OPERATOR: ['AA', 'P', 'ER', 'AY', 'T', 'ER'],
  RECOGNIZED: ['R', 'EH', 'K', 'AH', 'G', 'N', 'AY', 'Z', 'D'],
  VOGELTRONICS: ['V', 'OH:', 'G', 'AH', 'L', 'T', 'R', 'AA:', 'N', 'IH', 'K', 'S'],
  INSERT: ['IH', 'N', 'S', 'ER', 'T'],
  COIN: ['K', 'OY', 'N'],
  INTRUDER: ['IH', 'N', 'T', 'R', 'UW', 'D', 'ER'],
  ALERT: ['AH', 'L', 'ER', 'T'],
  READY: ['R', 'EH', 'D', 'IY'],
  MEMORY: ['M', 'EH', 'M', 'ER', 'IY'],
  FULL: ['F', 'UH', 'L'],
  PROGRAM: ['P', 'R', 'OH', 'G', 'R', 'AE', 'M'],
  STAIRS: ['S', 'T', 'EH', 'R', 'Z'],
  PROTECTION: ['P', 'R', 'AH', 'T', 'EH', 'K', 'SH', 'AH', 'N'],
  DEVICE: ['D', 'IH', 'V', 'AY', 'S'],
  ACTIVATED: ['AE', 'K', 'T', 'IH', 'V', 'EY', 'T', 'IH', 'D'],
  THE: ['DH', 'AH'],
  A: ['AH'],
  OF: ['AH', 'V'],
  TO: ['T', 'UW'],
  IS: ['IH', 'Z'],
  ONE: ['W', 'AH', 'N'],
  TWO: ['T', 'UW'],
  THREE: ['TH', 'R', 'IY'],
  FOUR: ['F', 'AO', 'R'],
  FIVE: ['F', 'AY', 'V'],
  SIX: ['S', 'IH', 'K', 'S'],
  SEVEN: ['S', 'EH', 'V', 'AH', 'N'],
  EIGHT: ['EY', 'T'],
  NINE: ['N', 'AY', 'N'],
  ZERO: ['Z', 'IY', 'R', 'OH'],
};

/**
 * Ordered digraph and context rules, longest-match first.
 * Each entry: [pattern, phonemes, optional guard]
 */
type Rule = [RegExp, string[], ((word: string, i: number) => boolean)?];

const isVowelChar = (c: string | undefined) =>
  c !== undefined && 'AEIOUY'.includes(c);

const RULES: Rule[] = [
  // --- four and three letter clusters --------------------------------
  [/^TION/, ['SH', 'AH', 'N']],
  [/^SION/, ['ZH', 'AH', 'N']],
  [/^OUGH/, ['AO']],
  [/^IGH/, ['AY']],
  [/^AIR/, ['EH', 'R']],
  [/^EAR/, ['IY', 'R']],
  [/^OOR/, ['AO', 'R']],
  [/^ARE/, ['EH', 'R']],

  // --- consonant digraphs --------------------------------------------
  [/^CH/, ['CH']],
  [/^SH/, ['SH']],
  [/^TH/, ['TH']],
  [/^PH/, ['F']],
  [/^WH/, ['W']],
  [/^GH/, []],           // usually silent
  [/^CK/, ['K']],
  [/^NG/, ['NG']],
  [/^QU/, ['K', 'W']],
  [/^WR/, ['R']],
  [/^KN/, ['N']],
  [/^PS/, ['S']],
  [/^DGE/, ['JH']],
  [/^GE$/, ['JH']],

  // --- r-controlled vowels -------------------------------------------
  [/^AR/, ['AA', 'R']],
  [/^OR/, ['AO', 'R']],
  [/^ER/, ['ER']],
  [/^IR/, ['ER']],
  [/^UR/, ['ER']],

  // --- vowel digraphs -------------------------------------------------
  [/^EE/, ['IY']],
  [/^EA/, ['IY']],
  [/^OO/, ['UW']],
  [/^OU/, ['AW']],
  [/^OW/, ['AW']],
  [/^OI/, ['OY']],
  [/^OY/, ['OY']],
  [/^AI/, ['EY']],
  [/^AY/, ['EY']],
  [/^AU/, ['AO']],
  [/^AW/, ['AO']],
  [/^EI/, ['EY']],
  [/^EY/, ['EY']],
  [/^IE/, ['IY']],
  [/^OA/, ['OH']],
  [/^UE/, ['UW']],
  [/^UI/, ['UW']],

  // --- single consonants ----------------------------------------------
  [/^B/, ['B']],
  // C is /s/ before E, I, Y — otherwise /k/
  [/^C/, ['S'], (w, i) => 'EIY'.includes(w[i + 1] ?? '')],
  [/^C/, ['K']],
  [/^D/, ['D']],
  [/^F/, ['F']],
  [/^G/, ['JH'], (w, i) => 'EIY'.includes(w[i + 1] ?? '')],
  [/^G/, ['G']],
  [/^H/, ['HH']],
  [/^J/, ['JH']],
  [/^K/, ['K']],
  [/^L/, ['L']],
  [/^M/, ['M']],
  [/^N/, ['N']],
  [/^P/, ['P']],
  [/^R/, ['R']],
  // S is /z/ between vowels or word-final after a vowel
  [/^S/, ['Z'], (w, i) =>
    i > 0 && isVowelChar(w[i - 1]) &&
    (i === w.length - 1 || isVowelChar(w[i + 1]))],
  [/^S/, ['S']],
  [/^T/, ['T']],
  [/^V/, ['V']],
  [/^W/, ['W']],
  [/^X/, ['K', 'S']],
  [/^Z/, ['Z']],

  // --- single vowels ---------------------------------------------------
  // Long vowel when followed by consonant + silent E.
  [/^A/, ['EY'], (w, i) => /^[BCDFGKLMNPRSTVZ]E$/.test(w.slice(i + 1))],
  [/^A/, ['AE']],
  [/^E/, [], (w, i) => i === w.length - 1 && w.length > 2],  // silent final E
  [/^E/, ['IY'], (w, i) => /^[BCDFGKLMNPRSTVZ]E$/.test(w.slice(i + 1))],
  [/^E/, ['EH']],
  [/^I/, ['AY'], (w, i) => /^[BCDFGKLMNPRSTVZ]E$/.test(w.slice(i + 1))],
  [/^I/, ['IH']],
  [/^O/, ['OH'], (w, i) => /^[BCDFGKLMNPRSTVZ]E$/.test(w.slice(i + 1))],
  [/^O/, ['AA']],
  [/^U/, ['UW'], (w, i) => /^[BCDFGKLMNPRSTVZ]E$/.test(w.slice(i + 1))],
  [/^U/, ['AH']],
  [/^Y/, ['IY'], (_w, i) => i > 0],
  [/^Y/, ['Y']],
];

function wordToPhonemes(raw: string): string[] {
  const word = raw.toUpperCase().replace(/[^A-Z]/g, '');
  if (!word) return [];

  const lex = LEXICON[word];
  if (lex) return [...lex];

  const out: string[] = [];
  let i = 0;
  let guard = 0;

  while (i < word.length && guard++ < 200) {
    const rest = word.slice(i);
    let matched = false;

    for (const [pattern, phones, cond] of RULES) {
      const m = pattern.exec(rest);
      if (!m) continue;
      if (cond && !cond(word, i)) continue;
      out.push(...phones);
      i += m[0].length;
      matched = true;
      break;
    }

    if (!matched) i += 1;   // unknown character, skip
  }

  // A word that reduced to nothing (e.g. "E") still needs a vowel.
  if (out.length === 0) out.push('AH');
  return out;
}

export interface G2PResult {
  phonemes: string[];
  /** Per-word breakdown, for display in the bench. */
  words: Array<{ text: string; phonemes: string[] }>;
  /** True if any word came from the hand-written lexicon. */
  usedLexicon: boolean;
}

/**
 * Convert English text to a phoneme string.
 *
 * Inter-word pauses are inserted as PA. Sentence-final punctuation
 * produces the longer PA2.
 */
export function textToPhonemes(text: string): G2PResult {
  const tokens = text
    .trim()
    .split(/\s+/)
    .filter((t) => t.replace(/[^A-Za-z]/g, '').length > 0);

  const words: Array<{ text: string; phonemes: string[] }> = [];
  const phonemes: string[] = [];
  let usedLexicon = false;

  tokens.forEach((tok, idx) => {
    const clean = tok.toUpperCase().replace(/[^A-Z]/g, '');
    if (LEXICON[clean]) usedLexicon = true;

    const ph = wordToPhonemes(tok);
    words.push({ text: tok, phonemes: ph });
    phonemes.push(...ph);

    if (idx < tokens.length - 1) {
      phonemes.push(/[.!?,;:]$/.test(tok) ? 'PA2' : 'PA');
    }
  });

  return { phonemes, words, usedLexicon };
}

/**
 * Parse a hand-written phoneme string. Accepts spaces, dots, or slashes.
 * A trailing ':' marks stress and is preserved.
 */
export function parsePhonemeString(s: string): string[] {
  return s
    .toUpperCase()
    .split(/[\s.\/,·]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** Strip stress markers, for validation against the phoneme table. */
export function stripStress(name: string): string {
  return name.replace(/:+$/, '');
}

/**
 * True if a token names a known phoneme, stress markers allowed.
 *
 * This is the validation any UI should use before handing tokens to
 * synth(): it accepts exactly what synth() accepts, and it consults own
 * properties only — `name in PHONES` would also match prototype members
 * like `constructor`.
 */
export function isKnownPhoneme(name: string): boolean {
  return Object.hasOwn(PHONES, stripStress(name));
}

export const LEXICON_WORDS = Object.keys(LEXICON).sort();
