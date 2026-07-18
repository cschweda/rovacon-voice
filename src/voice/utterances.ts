/**
 * The Rovacon utterance set — Doc 10 §3B.5.
 *
 * Seven lines, deliberately few. The fastest way to make this annoying
 * is too many. Stair falls get silence, which is a design decision, not
 * an omission: that sequence already carries the spinning wheel, 700 ms
 * of nothing, and the withering bloop. A voice line would be a fourth
 * beat and would kill it.
 */

export type VoiceId =
  | 'ROVACON'
  | 'TARGET_DESTROYED'
  | 'DIRECT_HIT'
  | 'PAYLOAD_DELIVERED'
  | 'OPTIMAL'
  | 'OPERATOR_RECOGNIZED'
  | 'SYSTEM_FAULT';

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
];

export const UTTERANCE_BY_ID: Readonly<Record<VoiceId, Utterance>> =
  Object.fromEntries(UTTERANCES.map((u) => [u.id, u])) as
    Record<VoiceId, Utterance>;
