"""Render the Rovacon utterance set to WAV files."""

import numpy as np
from synth import synth, write_wav, SR

# Phoneme strings per Doc 10 section 3B.4
UTTERANCES = {
    'rovacon': (
        ['R', 'OH', 'V', 'AH', 'K', 'AA', 'N'],
        'ROVACON',
    ),
    'target_destroyed': (
        ['T', 'AA', 'R', 'G', 'EH', 'T', 'PA',
         'D', 'IH', 'S', 'T', 'R', 'OY', 'D'],
        'TARGET DESTROYED',
    ),
    'payload_delivered': (
        ['P', 'AY', 'L', 'OH', 'D', 'PA',
         'D', 'IH', 'L', 'IH', 'V', 'ER', 'D'],
        'PAYLOAD DELIVERED',
    ),
    'optimal': (
        ['AH', 'P', 'T', 'IH', 'M', 'AH', 'L'],
        'OPTIMAL',
    ),
    'direct_hit': (
        ['D', 'IH', 'R', 'EH', 'K', 'T', 'PA', 'HH', 'IH', 'T'],
        'DIRECT HIT',
    ),
    'system_fault': (
        ['S', 'IH', 'S', 'T', 'AH', 'M', 'PA', 'F', 'AO', 'L', 'T'],
        'SYSTEM FAULT',
    ),
    'operator_recognized': (
        ['AA', 'P', 'ER', 'AY', 'T', 'ER', 'PA',
         'R', 'EH', 'K', 'AH', 'G', 'N', 'AY', 'Z', 'D'],
        'OPERATOR RECOGNIZED',
    ),
}


def main():
    import os
    os.makedirs('out', exist_ok=True)

    for key, (phones, label) in UTTERANCES.items():
        audio = synth(phones, seed=hash(key) % 10000)
        write_wav(f'out/{key}.wav', audio)
        print(f'{label:24s} {len(audio)/SR:5.2f}s  {len(phones):2d} phonemes')

    # A combined demo track with pauses between each.
    gap = np.zeros(int(0.7 * SR))
    parts = []
    for key, (phones, _) in UTTERANCES.items():
        parts.append(synth(phones, seed=hash(key) % 10000))
        parts.append(gap)
    write_wav('out/all_utterances.wav', np.concatenate(parts))
    print(f'\nall_utterances.wav  {sum(len(p) for p in parts)/SR:.2f}s')


if __name__ == '__main__':
    main()
