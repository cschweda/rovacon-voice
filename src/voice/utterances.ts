/**
 * The Rovacon utterance set — Doc 10 §3B.5, plus one owner override.
 *
 * Eight lines, deliberately few. The fastest way to make this annoying
 * is too many.
 *
 * Stair falls originally got silence (Doc 10 §3B.5): the sequence
 * already carries the spinning wheel, 700 ms of nothing, and the
 * withering bloop, and a fourth beat looked like it would kill it. The
 * project owner reversed that on 2026-07-18 — the toy now says OUCH,
 * THAT HURTS after the bloop, on the theory that a plastic toy
 * complaining from the bottom of a staircase IS the Saturday-morning
 * commercial gag. Doc 10 needs a matching update upstream.
 */

export type VoiceId =
  | 'ROVACON'
  | 'TARGET_DESTROYED'
  | 'DIRECT_HIT'
  | 'PAYLOAD_DELIVERED'
  | 'OPTIMAL'
  | 'OPERATOR_RECOGNIZED'
  | 'SYSTEM_FAULT'
  | 'OUCH_THAT_HURTS';

export interface Utterance {
  readonly id: VoiceId;
  readonly label: string;
  readonly phonemes: readonly string[];
  /** Reads-as, for documentation and the bench display. */
  readonly readsAs: string;
  /** Lower number = higher priority when two fire together. */
  readonly priority: number;
  readonly trigger: string;
}

export const UTTERANCES: readonly Utterance[] = [
  {
    id: 'OPERATOR_RECOGNIZED',
    label: 'OPERATOR RECOGNIZED',
    phonemes: ['AA','P','ER','AY','T','ER','PA',
               'R','EH','K','AH','G','N','AY','Z','D'],
    readsAs: 'AHP-er-ay-ter REK-ahg-nyzd',
    priority: 1,
    trigger: 'New placement on the high-score ledger',
  },
  {
    id: 'PAYLOAD_DELIVERED',
    label: 'PAYLOAD DELIVERED',
    phonemes: ['P','AY','L','OH','D','PA',
               'D','IH','L','IH','V','ER','D'],
    readsAs: 'PAY-lohd dih-LIV-erd',
    priority: 2,
    trigger: 'Payload delivered inside the drop zone',
  },
  {
    id: 'OPTIMAL',
    label: 'OPTIMAL',
    phonemes: ['AH','P','T','IH','M','AH','L'],
    readsAs: 'AHP-tih-mul',
    priority: 3,
    trigger: 'Par step count achieved',
  },
  {
    id: 'TARGET_DESTROYED',
    label: 'TARGET DESTROYED',
    phonemes: ['T','AA','R','G','EH','T','PA',
               'D','IH','S','T','R','OY','D'],
    readsAs: 'TAR-get dih-STROYD',
    priority: 4,
    trigger: 'Destructible obstacle cleared by the cannon',
  },
  {
    id: 'DIRECT_HIT',
    label: 'DIRECT HIT',
    phonemes: ['D','IH','R','EH','K','T','PA','HH','IH','T'],
    readsAs: 'dih-REKT hit',
    priority: 5,
    trigger: 'Bonus target hit',
  },
  {
    id: 'SYSTEM_FAULT',
    label: 'SYSTEM FAULT',
    phonemes: ['S','IH','S','T','AH','M','PA','F','AO','L','T'],
    readsAs: 'SIS-tem fawlt',
    priority: 6,
    trigger: 'Protection device trips (stall)',
  },
  {
    id: 'ROVACON',
    label: 'ROVACON',
    phonemes: ['R','OH:','V','AH','K','AA:','N'],
    readsAs: 'ROH-vuh-KAHN',
    priority: 7,
    trigger: 'Run start — first attempt of a house only',
  },
  {
    id: 'OUCH_THAT_HURTS',
    label: 'OUCH, THAT HURTS',
    phonemes: ['AW:','CH','PA2','DH','AE','T','PA','HH','ER:','T','S'],
    readsAs: 'OW-ch... that HURTS',
    priority: 8,
    trigger: 'Stair fall — after the withering bloop (silence rule reversed 2026-07-18)',
  },
];

export const UTTERANCE_BY_ID: Readonly<Record<VoiceId, Utterance>> =
  Object.fromEntries(UTTERANCES.map((u) => [u.id, u])) as
    Record<VoiceId, Utterance>;
