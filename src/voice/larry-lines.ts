/**
 * LARRY — the memory game that talks back (VogelTronics, 1979)
 * -----------------------------------------------------------------
 * A Simon-class knock-off whose only real feature is that it speaks,
 * through the same VogelVox / rovacon-voice formant synth. Larry is
 * named for Walter's older brother, Larry K. Vogel, and behaves like
 * him: never warm, never concedes, always gets the last word.
 *
 * This manifest matches the shape of src/voice/utterances.ts. Two ways
 * to get `phonemes`:
 *   1. Hand-tuned tokens (below) for the short signature lines — these
 *      are the ones that must survive the SC-01 and get quoted, so they
 *      are worth auditioning by ear (this is a VQ / listening call).
 *   2. `g2p(label).phonemes` for the rest — good enough for the longer,
 *      lower-stakes barks; tune only the ones that come out muddy.
 *
 * THE LOAD-BEARING JOKE: `AGAIN` fires on a *correct* answer, not just a
 * wrong one. Larry does not congratulate. He says "again." Wire the
 * success handler to AGAIN, not to a win jingle. There is no win state.
 *
 * THE SIGNATURE BUG (fiction, but wire it for real if you like): on
 * power-off, start an ~9s timer and speak one line from LAST_WORD before
 * the audio context is torn down. Keep that pool tiny so it stays rare
 * and quotable — that is what makes Larry a haunting instead of a gag.
 *
 * Phoneme tokens follow the repo's Votrax SC-01 scheme (PA = pause,
 * trailing ':' = long/stressed variant). Marked DRAFT = author, then
 * confirm by ear on the bench.
 */

import type { G2PResult } from './g2p'; // eslint-disable-line @typescript-eslint/no-unused-vars

export type LarryState =
  | 'BOOT'        // power-on
  | 'WATCH'       // start of a round / "watch the sequence"
  | 'CORRECT'     // you repeated the pattern correctly
  | 'LEVEL_UP'    // sequence just got longer
  | 'IDLE'        // you're taking too long
  | 'WRONG'       // you missed
  | 'GAME_OVER'   // run ended
  | 'LAST_WORD'   // fires ~9s AFTER power-off (tiny pool, rare)
  | 'EASTER';     // 1-in-a-few-hundred flavor

export interface LarryLine {
  readonly id: string;
  readonly state: LarryState;
  readonly label: string;      // rendered text (feed to g2p if no phonemes)
  readonly readsAs: string;    // how it should sound out loud
  readonly trigger: string;    // when it fires
  readonly priority: number;   // lower = wins when two fire together
  /** DRAFT hand-tuned tokens for the quotable short lines; audition these. */
  readonly phonemes?: readonly string[];
}

export const LARRY_LINES: readonly LarryLine[] = [
  // ---- BOOT -------------------------------------------------------
  { id: 'BOOT_NAME',   state: 'BOOT',  label: 'LARRY',
    readsAs: 'LAIR-ee', trigger: 'Power on', priority: 2,
    phonemes: ['L','EH:','R','IY:'] /* DRAFT */ },
  { id: 'BOOT_AWAKE',  state: 'BOOT',  label: 'IM AWAKE',
    readsAs: 'im uh-WAKE', trigger: 'Power on (alt)', priority: 3 },
  { id: 'BOOT_ATTEND', state: 'BOOT',  label: 'PAY ATTENTION THIS TIME',
    readsAs: 'pay uh-TEN-shun this time', trigger: 'Power on (alt)', priority: 3 },

  // ---- WATCH ------------------------------------------------------
  { id: 'WATCH_ME',    state: 'WATCH', label: 'WATCH ME',
    readsAs: 'WAHTCH mee', trigger: 'Sequence playback begins', priority: 2,
    phonemes: ['W','AA','CH','PA','M','IY:'] /* DRAFT */ },
  { id: 'WATCH_KEEPUP',state: 'WATCH', label: 'TRY TO KEEP UP',
    readsAs: 'try to keep up', trigger: 'Sequence playback (alt)', priority: 3 },
  { id: 'WATCH_EYES',  state: 'WATCH', label: 'EYES ON ME',
    readsAs: 'eyes on mee', trigger: 'Sequence playback (alt)', priority: 3 },

  // ---- CORRECT (there is no win — this IS the win handler) --------
  { id: 'AGAIN',       state: 'CORRECT', label: 'AGAIN',
    readsAs: 'uh-GEN', trigger: 'Correct repeat — fire this, NOT a win jingle', priority: 1,
    phonemes: ['AH','G','EH:','N'] /* DRAFT */ },
  { id: 'CORRECT_FINE',state: 'CORRECT', label: 'FINE',
    readsAs: 'fyne (flat)', trigger: 'Correct repeat (alt)', priority: 3,
    phonemes: ['F','AY:','N'] /* DRAFT */ },
  { id: 'CORRECT_LUCKY',state:'CORRECT', label: 'LUCKY',
    readsAs: 'LUH-kee', trigger: 'Correct repeat (alt)', priority: 3,
    phonemes: ['L','AH','K','IY:'] /* DRAFT */ },
  { id: 'CORRECT_ADEQ',state: 'CORRECT', label: 'ADEQUATE',
    readsAs: 'AD-uh-kwit', trigger: 'Correct repeat (alt)', priority: 3 },
  { id: 'CORRECT_DONT',state: 'CORRECT', label: 'DONT CELEBRATE',
    readsAs: 'dont SEL-uh-brate', trigger: 'Correct repeat (rare)', priority: 4 },

  // ---- LEVEL_UP ---------------------------------------------------
  { id: 'LVL_HARDER',  state: 'LEVEL_UP', label: 'HARDER NOW',
    readsAs: 'HAR-der now', trigger: 'Sequence length increased', priority: 2 },
  { id: 'LVL_STILL',   state: 'LEVEL_UP', label: 'STILL HERE',
    readsAs: 'still heer?', trigger: 'Sequence length increased (alt)', priority: 3 },
  { id: 'LVL_NOHELP',  state: 'LEVEL_UP', label: 'NO ONE HELPED ME',
    readsAs: 'no one helped mee', trigger: 'Deep into a run (rare)', priority: 4 },

  // ---- IDLE -------------------------------------------------------
  { id: 'IDLE_WELL',   state: 'IDLE',  label: 'WELL',
    readsAs: 'well?', trigger: 'No input for ~4s', priority: 2 },
  { id: 'IDLE_TODAY',  state: 'IDLE',  label: 'TODAY',
    readsAs: 'tuh-DAY', trigger: 'No input for ~7s', priority: 2 },
  { id: 'IDLE_GUESS',  state: 'IDLE',  label: 'GUESS',
    readsAs: 'gess', trigger: 'No input, late', priority: 3 },

  // ---- WRONG ------------------------------------------------------
  { id: 'WRONG',       state: 'WRONG', label: 'WRONG',
    readsAs: 'RAWNG', trigger: 'Incorrect input', priority: 1,
    phonemes: ['R','AO:','NG'] /* DRAFT */ },
  { id: 'WRONG_NO',    state: 'WRONG', label: 'NO',
    readsAs: 'noh', trigger: 'Incorrect input (alt)', priority: 2,
    phonemes: ['N','OH:'] /* DRAFT */ },
  { id: 'WRONG_YOURS', state: 'WRONG', label: 'YOUR MISTAKE',
    readsAs: 'yer mih-STAKE', trigger: 'Incorrect input (alt)', priority: 2,
    phonemes: ['Y','ER','PA','M','IH','S','T','EY:','K'] /* DRAFT */ },
  { id: 'WRONG_TOLD',  state: 'WRONG', label: 'TOLD YOU',
    readsAs: 'told yoo', trigger: 'Incorrect input (alt)', priority: 2,
    phonemes: ['T','OH','L','D','PA','Y','UW:'] /* DRAFT */ },
  { id: 'WRONG_PRED',  state: 'WRONG', label: 'PREDICTABLE',
    readsAs: 'pree-DIK-tuh-bul', trigger: 'Incorrect input (rare)', priority: 3 },

  // ---- GAME_OVER --------------------------------------------------
  { id: 'OVER_DONE',   state: 'GAME_OVER', label: 'DONE',
    readsAs: 'dun', trigger: 'Run ends', priority: 1 },
  { id: 'OVER_AWAY',   state: 'GAME_OVER', label: 'GO AWAY',
    readsAs: 'go uh-WAY', trigger: 'Run ends (alt)', priority: 2 },
  { id: 'OVER_OLDER',  state: 'GAME_OVER', label: 'COME BACK WHEN YOURE OLDER',
    readsAs: 'come back when yer OLD-er', trigger: 'Run ends (rare)', priority: 3 },

  // ---- LAST_WORD (tiny pool; ~9s after power-off; keep it rare) ---
  { id: 'LAST_TOLD',   state: 'LAST_WORD', label: 'TOLD YOU',
    readsAs: '(pause) told yoo', trigger: '~9s after OFF', priority: 1,
    phonemes: ['PA','PA','T','OH','L','D','PA','Y','UW:'] /* DRAFT */ },
  { id: 'LAST_RIGHT',  state: 'LAST_WORD', label: 'STILL RIGHT',
    readsAs: '(pause) still right', trigger: '~9s after OFF (alt)', priority: 1,
    phonemes: ['PA','PA','S','T','IH','L','PA','R','AY:','T'] /* DRAFT */ },
  { id: 'LAST_K',      state: 'LAST_WORD', label: 'K',
    readsAs: '(pause) "kay" — the withheld initial, alone, unexplained',
    trigger: '~9s after OFF (rarest)', priority: 1,
    phonemes: ['PA','PA','K','EY:'] /* DRAFT */ },

  // ---- EASTER (1-in-a-few-hundred) --------------------------------
  { id: 'EGG_ACCESS',  state: 'EASTER', label: 'FOLLOW THE ACCESSORIES',
    readsAs: 'FAH-low the ak-SESS-uh-reez', trigger: 'Rare; Walter’s line in Larry’s mouth', priority: 5 },
  { id: 'EGG_WARM',    state: 'EASTER', label: 'WARM JUST MEANS IM WORKING',
    readsAs: 'warm just means im WORK-ing', trigger: 'Rare', priority: 5 },
  { id: 'EGG_BUILT',   state: 'EASTER', label: 'I HELPED BUILD THIS COMPANY',
    readsAs: 'i helped build this KUM-puh-nee', trigger: 'Rare; flat, apropos of nothing', priority: 5 },
];

export const LARRY_BY_ID: Record<string, LarryLine> =
  Object.fromEntries(LARRY_LINES.map((l) => [l.id, l]));

export const LARRY_BY_STATE = (s: LarryState): readonly LarryLine[] =>
  LARRY_LINES.filter((l) => l.state === s);
