/** Public surface of the voice module. */
export { synth, bandEnergy, toWavBlob, SR, DEFAULT_PARAMS } from './synth';
export type { SynthParams, SynthResult, BandEnergy } from './synth';
export { PHONES, PHONEME_GROUPS, PHONEME_NAMES } from './phonemes';
export type { Phone } from './phonemes';
export { textToPhonemes, parsePhonemeString, LEXICON_WORDS } from './g2p';
export type { G2PResult } from './g2p';
export { UTTERANCES, UTTERANCE_BY_ID } from './utterances';
export type { VoiceId, Utterance } from './utterances';
export { VoicePlayer, DEFAULT_VOICE_CONFIG } from './player';
export type { VoiceConfig, SpeakContext } from './player';
