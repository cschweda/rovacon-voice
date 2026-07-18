/**
 * Voice playback with rate limiting — Doc 10 §3B.6.
 *
 * This is the shipping integration surface. The game calls speak() and
 * everything else is handled internally.
 *
 * The rate limiter DROPS lines rather than queueing them. A queued line
 * fires late, attached to nothing, which is worse than silence.
 */

import { synth, SR, type SynthParams } from './synth';
import { UTTERANCE_BY_ID, type VoiceId } from './utterances';

export interface VoiceConfig {
  /** Minimum milliseconds between any two utterances. */
  minGapMs: number;
  /** 0..1 */
  volume: number;
  enabled: boolean;
  /** Synthesis parameters. */
  params: Partial<SynthParams>;
}

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  minGapMs: 4000,
  volume: 0.6,
  enabled: true,
  params: {},
};

export interface SpeakContext {
  /** Identifies the current house, for once-per-house rules. */
  houseId?: string;
}

export class VoicePlayer {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private cache = new Map<VoiceId, AudioBuffer>();
  private lastSpokeAt = -Infinity;
  private lastId: VoiceId | null = null;
  private spokenThisHouse = new Set<string>();
  private pendingThisTick: VoiceId[] = [];
  private flushScheduled = false;

  constructor(private config: VoiceConfig = DEFAULT_VOICE_CONFIG) {}

  /** Must be called from a user gesture, per browser autoplay policy. */
  async init(existing?: AudioContext): Promise<void> {
    if (this.ctx) return;
    this.ctx = existing ?? new AudioContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = this.config.volume;
    this.gain.connect(this.ctx.destination);
  }

  setConfig(patch: Partial<VoiceConfig>): void {
    this.config = { ...this.config, ...patch };
    if (this.gain) this.gain.gain.value = this.config.volume;
    if (patch.params) this.cache.clear();
  }

  /** Call when the player enters a new house. Resets once-per-house state. */
  beginHouse(houseId: string): void {
    this.spokenThisHouse.delete(houseId);
    this.spokenThisHouse.clear();
  }

  /**
   * Request an utterance. May be dropped by the rate limiter.
   * Returns true if it will actually play.
   */
  speak(id: VoiceId, ctx: SpeakContext = {}): boolean {
    if (!this.config.enabled || !this.ctx) return false;

    // Once per house for ROVACON.
    if (id === 'ROVACON') {
      const key = `${ctx.houseId ?? 'default'}:ROVACON`;
      if (this.spokenThisHouse.has(key)) return false;
      this.spokenThisHouse.add(key);
    }

    // Suppress consecutive identical lines.
    if (id === this.lastId) return false;

    const now = performance.now();
    if (now - this.lastSpokeAt < this.config.minGapMs) return false;

    // Collect simultaneous triggers within this tick; resolve by priority.
    this.pendingThisTick.push(id);
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      queueMicrotask(() => this.flush());
    }
    return true;
  }

  private flush(): void {
    this.flushScheduled = false;
    const pending = this.pendingThisTick;
    this.pendingThisTick = [];
    if (pending.length === 0) return;

    // Highest priority (lowest number) wins; the rest are discarded.
    pending.sort(
      (a, b) => UTTERANCE_BY_ID[a].priority - UTTERANCE_BY_ID[b].priority,
    );
    void this.play(pending[0]!);
  }

  private async play(id: VoiceId): Promise<void> {
    if (!this.ctx || !this.gain) return;

    let buf = this.cache.get(id);
    if (!buf) {
      const u = UTTERANCE_BY_ID[id];
      const result = synth(u.phonemes, this.config.params);
      buf = this.ctx.createBuffer(1, result.audio.length, SR);
      buf.copyToChannel(result.audio, 0);
      this.cache.set(id, buf);
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    src.start();

    this.lastSpokeAt = performance.now();
    this.lastId = id;
  }

  /** Pre-render everything. Optional — costs ~200 ms of main thread. */
  warmUp(): void {
    if (!this.ctx) return;
    for (const u of Object.values(UTTERANCE_BY_ID)) {
      if (this.cache.has(u.id)) continue;
      const result = synth(u.phonemes, this.config.params);
      const buf = this.ctx.createBuffer(1, result.audio.length, SR);
      buf.copyToChannel(result.audio, 0);
      this.cache.set(u.id, buf);
    }
  }

  dispose(): void {
    this.cache.clear();
    this.gain?.disconnect();
  }
}
