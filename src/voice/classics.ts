/**
 * The classics reel — bench-only nostalgia, deliberately separate from
 * the shipping utterance set. UTTERANCES stays at seven lines (Doc 10
 * §3B.5); this museum piece must never leak into the game, and a test
 * enforces that.
 *
 * Every line is an IMPRESSION rendered through this repo's formant
 * synth. The original hardware is labeled honestly, because only the
 * Votrax games were formant synthesis at all:
 *
 *   - Votrax SC-01/SC-01A (Gorf, Wizard of Wor, Q*bert) — phoneme
 *     synthesis, the technology this repo recreates.
 *   - TSI S14001A (Berzerk) — compressed encoded speech, from a chip
 *     originally built for a talking calculator for the blind. Not a
 *     Votrax, despite forty years of misattribution.
 *   - Digitized samples (Sinistar, Crazy Climber) — recorded audio,
 *     ruinously expensive in ROM, reserved for a few short lines.
 *
 * Robotron: 2084 is absent because it never spoke. The Williams voice
 * everyone remembers is Sinistar's.
 */

export interface ClassicLine {
  readonly id: string;
  readonly game: string;
  readonly year: number;
  /** The original speech hardware — what the real cabinet used. */
  readonly tech: string;
  readonly label: string;
  readonly phonemes: readonly string[];
}

export const CLASSICS: readonly ClassicLine[] = [
  {
    id: 'GORF_LONG_LIVE',
    game: 'Gorf', year: 1981, tech: 'Votrax SC-01',
    label: 'LONG LIVE GORF',
    phonemes: ['L', 'AO:', 'NG', 'PA', 'L', 'IH', 'V', 'PA',
               'G', 'AO:', 'R', 'F'],
  },
  {
    id: 'GORF_ANNIHILATION',
    game: 'Gorf', year: 1981, tech: 'Votrax SC-01',
    label: 'PREPARE YOURSELF FOR ANNIHILATION',
    phonemes: ['P', 'R', 'IH', 'P', 'EH:', 'R', 'PA',
               'Y', 'ER', 'S', 'EH', 'L', 'F', 'PA', 'F', 'ER', 'PA',
               'AH', 'N', 'AY:', 'AH', 'L', 'EY:', 'SH', 'AH', 'N'],
  },
  {
    id: 'GORF_DEVOUR_COINS',
    game: 'Gorf', year: 1981, tech: 'Votrax SC-01',
    label: 'I DEVOUR COINS',
    phonemes: ['AY', 'PA', 'D', 'IH', 'V', 'AW:', 'R', 'PA',
               'K', 'OY:', 'N', 'Z'],
  },
  {
    id: 'GORF_SURVIVAL',
    game: 'Gorf', year: 1981, tech: 'Votrax SC-01',
    label: 'SURVIVAL IS IMPOSSIBLE',
    phonemes: ['S', 'ER', 'V', 'AY:', 'V', 'AH', 'L', 'PA',
               'IH', 'Z', 'PA',
               'IH', 'M', 'P', 'AA:', 'S', 'AH', 'B', 'AH', 'L'],
  },
  {
    id: 'WOW_I_AM',
    game: 'Wizard of Wor', year: 1981, tech: 'Votrax SC-01',
    label: 'I AM THE WIZARD OF WOR',
    phonemes: ['AY', 'PA', 'AE', 'M', 'PA', 'DH', 'AH', 'PA',
               'W', 'IH:', 'Z', 'ER', 'D', 'PA', 'AH', 'V', 'PA',
               'W', 'AO:', 'R'],
  },
  {
    id: 'WOW_INSERT_COIN',
    game: 'Wizard of Wor', year: 1981, tech: 'Votrax SC-01',
    label: 'HEY, INSERT COIN',
    phonemes: ['HH', 'EY:', 'PA2', 'IH', 'N', 'S', 'ER', 'T', 'PA',
               'K', 'OY:', 'N'],
  },
  {
    id: 'BERZERK_INTRUDER',
    game: 'Berzerk', year: 1980, tech: 'TSI S14001A',
    label: 'INTRUDER ALERT, INTRUDER ALERT',
    phonemes: ['IH', 'N', 'T', 'R', 'UW:', 'D', 'ER', 'PA',
               'AH', 'L', 'ER:', 'T', 'PA2',
               'IH', 'N', 'T', 'R', 'UW:', 'D', 'ER', 'PA',
               'AH', 'L', 'ER:', 'T'],
  },
  {
    id: 'BERZERK_CHICKEN',
    game: 'Berzerk', year: 1980, tech: 'TSI S14001A',
    label: 'CHICKEN, FIGHT LIKE A ROBOT',
    phonemes: ['CH', 'IH', 'K', 'AH', 'N', 'PA2',
               'F', 'AY:', 'T', 'PA', 'L', 'AY', 'K', 'PA', 'AH', 'PA',
               'R', 'OH:', 'B', 'AA', 'T'],
  },
  {
    id: 'SINISTAR_BEWARE',
    game: 'Sinistar', year: 1983, tech: 'Digitized samples',
    label: 'BEWARE, I LIVE',
    phonemes: ['B', 'IH', 'W', 'EH:', 'R', 'PA2', 'AY', 'PA',
               'L', 'IH:', 'V'],
  },
  {
    id: 'SINISTAR_COWARD',
    game: 'Sinistar', year: 1983, tech: 'Digitized samples',
    label: 'RUN, COWARD',
    phonemes: ['R', 'AH:', 'N', 'PA2', 'K', 'AW:', 'ER', 'D'],
  },
  {
    id: 'CLIMBER_GO_FOR_IT',
    game: 'Crazy Climber', year: 1980, tech: 'Digitized samples',
    label: 'GO FOR IT',
    phonemes: ['G', 'OH:', 'PA', 'F', 'ER', 'PA', 'IH:', 'T'],
  },
  {
    id: 'QBERT_CURSE',
    game: 'Q*bert', year: 1982, tech: 'Votrax SC-01A',
    label: '@!#?@!',
    phonemes: ['B', 'AY', 'K', 'PA', 'SH', 'UH', 'F', 'PA2',
               'G', 'L', 'AA:', 'R', 'B', 'PA', 'F', 'UH', 'T', 'S'],
  },
];
