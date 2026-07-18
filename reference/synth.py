"""
Votrax SC-01 style formant synthesizer.

Approximates the 1979 Votrax SC-01 phoneme chip used in Gorf, Berzerk,
and Wizard of Wor. This is a cascade/parallel formant synthesizer, not
concatenative TTS -- phonemes are generated from formant targets in
real time, which is what gives the characteristic "robot gargling
through a tin can" quality.

Key character sources, in rough order of importance:
  1. Low sample rate with hard bandwidth limit (the chip ran ~8 kHz)
  2. Coarse formant quantization (the SC-01 had limited resolution)
  3. Abrupt formant transitions -- the chip interpolated crudely
  4. Flat pitch with no intonation model
  5. Buzzy glottal source (impulse train, not a smooth model)
  6. Output clipping into a cheap amplifier
"""

import numpy as np
from scipy import signal
from dataclasses import dataclass, field

SR = 22050          # internal working rate
CHIP_SR = 8000      # the SC-01's effective bandwidth
BASE_PITCH = 118.0  # the chip's fixed-ish fundamental (Hz), male-ish


@dataclass
class Phone:
    """A single phoneme's formant target."""
    name: str
    f1: float               # first formant (Hz)
    f2: float               # second formant (Hz)
    f3: float               # third formant (Hz)
    dur: float              # duration in seconds
    voiced: bool = True     # glottal source vs noise
    noise: float = 0.0      # 0..1 fricative noise mix
    amp: float = 1.0        # relative amplitude
    stop: bool = False      # plosive -- silence then burst
    bw: tuple = (90, 110, 170)   # formant bandwidths


# ---------------------------------------------------------------------------
# Phoneme inventory
#
# Formant values are broadly from standard American English vowel data,
# then coarsened. The SC-01 had a small fixed inventory and could not hit
# precise targets, so values are quantized to 50 Hz steps below.
# ---------------------------------------------------------------------------

PHONES = {
    # --- vowels -------------------------------------------------------
    'IY':  Phone('IY',  270, 2300, 3000, 0.13),   # beet
    'IH':  Phone('IH',  400, 2000, 2550, 0.09),   # bit
    'EH':  Phone('EH',  530, 1850, 2500, 0.10),   # bet
    'AE':  Phone('AE',  660, 1700, 2400, 0.12),   # bat
    'AA':  Phone('AA',  730, 1100, 2450, 0.13),   # father
    'AH':  Phone('AH',  640, 1200, 2400, 0.09),   # but
    'AO':  Phone('AO',  570,  850, 2400, 0.13),   # bought
    'OH':  Phone('OH',  500,  900, 2300, 0.13),   # boat
    'UH':  Phone('UH',  440, 1000, 2250, 0.08),   # book
    'UW':  Phone('UW',  300,  850, 2250, 0.13),   # boot
    'ER':  Phone('ER',  490, 1350, 1700, 0.12),   # bird
    'AY':  Phone('AY',  660, 1700, 2400, 0.15),   # bite (diphthong start)
    'OY':  Phone('OY',  550,  950, 2400, 0.15),   # boy

    # --- semivowels / liquids ----------------------------------------
    'R':   Phone('R',   350, 1050, 1600, 0.08),
    'L':   Phone('L',   400, 1100, 2600, 0.07),
    'W':   Phone('W',   300,  800, 2200, 0.06),
    'Y':   Phone('Y',   280, 2200, 2900, 0.06),

    # --- nasals -------------------------------------------------------
    'M':   Phone('M',   250, 1100, 2200, 0.08, bw=(120, 180, 240), amp=0.7),
    'N':   Phone('N',   250, 1600, 2600, 0.08, bw=(120, 180, 240), amp=0.7),

    # --- fricatives ---------------------------------------------------
    'S':   Phone('S',  1400, 4200, 5500, 0.11, voiced=False, noise=1.0,
                 amp=0.55, bw=(200, 350, 500)),
    'Z':   Phone('Z',   350, 4000, 5200, 0.09, voiced=True,  noise=0.75,
                 amp=0.5,  bw=(200, 350, 500)),
    'F':   Phone('F',  1100, 2400, 3800, 0.10, voiced=False, noise=1.0,
                 amp=0.4,  bw=(250, 400, 600)),
    'V':   Phone('V',   350, 2200, 3600, 0.08, voiced=True,  noise=0.6,
                 amp=0.5,  bw=(200, 350, 500)),
    'TH':  Phone('TH', 1200, 2600, 4000, 0.09, voiced=False, noise=1.0,
                 amp=0.35, bw=(250, 400, 600)),
    'SH':  Phone('SH', 1800, 2600, 3600, 0.11, voiced=False, noise=1.0,
                 amp=0.6,  bw=(200, 300, 450)),
    'HH':  Phone('HH',  600, 1500, 2500, 0.06, voiced=False, noise=1.0,
                 amp=0.25, bw=(300, 400, 600)),

    # --- plosives (stop + burst) --------------------------------------
    'P':   Phone('P',   500,  900, 2200, 0.055, voiced=False, noise=1.0,
                 amp=0.5, stop=True),
    'B':   Phone('B',   350,  900, 2200, 0.050, voiced=True,  noise=0.4,
                 amp=0.5, stop=True),
    'T':   Phone('T',   500, 1700, 2600, 0.055, voiced=False, noise=1.0,
                 amp=0.6, stop=True),
    'D':   Phone('D',   350, 1700, 2600, 0.050, voiced=True,  noise=0.4,
                 amp=0.5, stop=True),
    'K':   Phone('K',   450, 1900, 2400, 0.060, voiced=False, noise=1.0,
                 amp=0.6, stop=True),
    'G':   Phone('G',   350, 1900, 2400, 0.050, voiced=True,  noise=0.4,
                 amp=0.5, stop=True),

    # --- silence ------------------------------------------------------
    'PA':  Phone('PA',  500, 1500, 2500, 0.09, voiced=False, noise=0.0,
                 amp=0.0),   # inter-word pause
    'PA2': Phone('PA2', 500, 1500, 2500, 0.16, voiced=False, noise=0.0,
                 amp=0.0),   # longer pause
}


def quantize_formants(p: Phone, step: float = 50.0) -> Phone:
    """
    The SC-01 could not hit arbitrary formant values. Coarsening the
    targets to a 50 Hz grid is a meaningful part of the character --
    it makes vowels sit slightly 'off' from natural speech.
    """
    return Phone(
        p.name,
        round(p.f1 / step) * step,
        round(p.f2 / step) * step,
        round(p.f3 / step) * step,
        p.dur, p.voiced, p.noise, p.amp, p.stop, p.bw,
    )


def glottal_source(n: int, f0: float, jitter: float, rng) -> np.ndarray:
    """
    Buzzy impulse-train glottal source.

    The SC-01 did not model a smooth glottal waveform -- it was closer
    to a pulse train, which is why it sounded so buzzy. A small amount
    of period jitter keeps it from sounding perfectly synthetic, and
    the real chip drifted anyway.
    """
    out = np.zeros(n)
    t = 0.0
    while t < n:
        period = SR / f0
        period *= 1.0 + rng.uniform(-jitter, jitter)
        idx = int(t)
        if idx < n:
            # Two-sample ramp rather than a single spike -- slightly
            # less harsh, still buzzy.
            out[idx] = 1.0
            if idx + 1 < n:
                out[idx + 1] = -0.55
        t += period
    return out


def formant_filter(x: np.ndarray, freq: np.ndarray, bw: float) -> np.ndarray:
    """
    Time-varying two-pole resonator.

    Processed in short blocks with per-block coefficients. Block-wise
    updating (rather than sample-wise) is itself period-accurate: the
    chip updated its filters at a fixed low rate, which produced
    audible stepping during transitions.
    """
    out = np.zeros_like(x)
    block = 64
    y1 = y2 = 0.0
    for start in range(0, len(x), block):
        end = min(start + block, len(x))
        f = float(np.mean(freq[start:end]))
        f = max(80.0, min(f, SR / 2 - 200))

        r = np.exp(-np.pi * bw / SR)
        theta = 2 * np.pi * f / SR
        a1 = 2 * r * np.cos(theta)
        a2 = -(r ** 2)
        gain = (1 - r) * np.sqrt(1 - 2 * r * np.cos(2 * theta) + r ** 2)

        for i in range(start, end):
            y = gain * x[i] + a1 * y1 + a2 * y2
            out[i] = y
            y2 = y1
            y1 = y
    return out


def build_tracks(phones, transition: float = 0.030):
    """
    Build sample-rate formant tracks across the whole utterance.

    Transitions are short and linear. The real chip interpolated
    crudely between targets, so an abrupt-ish ramp is closer than a
    smooth curve.
    """
    total = sum(int(p.dur * SR) for p in phones)
    f1 = np.zeros(total)
    f2 = np.zeros(total)
    f3 = np.zeros(total)
    amp = np.zeros(total)
    noise = np.zeros(total)
    voiced = np.zeros(total)
    bw1 = np.zeros(total)
    bw2 = np.zeros(total)
    bw3 = np.zeros(total)

    pos = 0
    for i, p in enumerate(phones):
        n = int(p.dur * SR)
        seg = slice(pos, pos + n)
        f1[seg] = p.f1
        f2[seg] = p.f2
        f3[seg] = p.f3
        amp[seg] = p.amp
        noise[seg] = p.noise
        voiced[seg] = 1.0 if p.voiced else 0.0
        bw1[seg] = p.bw[0]
        bw2[seg] = p.bw[1]
        bw3[seg] = p.bw[2]
        pos += n

    # Linear crossfade of formant targets at boundaries.
    pos = 0
    tn = int(transition * SR)
    for i, p in enumerate(phones[:-1]):
        n = int(p.dur * SR)
        pos += n
        a = max(0, pos - tn // 2)
        b = min(total, pos + tn // 2)
        if b <= a:
            continue
        ramp = np.linspace(0, 1, b - a)
        for track in (f1, f2, f3, bw1, bw2, bw3):
            track[a:b] = track[a] * (1 - ramp) + track[b - 1] * ramp
        # Amplitude follows too, but faster -- keeps stops crisp.
        amp[a:b] = amp[a] * (1 - ramp) + amp[b - 1] * ramp

    return f1, f2, f3, amp, noise, voiced, (bw1, bw2, bw3)


def synth(phone_names, pitch=BASE_PITCH, seed=1, jitter=0.015,
          drift=0.015, transition=0.030):
    """
    Render a phoneme string to a mono float array at SR.

    phone_names: list of phoneme symbols, e.g. ['R','OH','V','AH','K','AA','N']
    """
    rng = np.random.default_rng(seed)
    phones = []
    for name in phone_names:
        if name not in PHONES:
            raise KeyError(f'unknown phoneme: {name}')
        phones.append(quantize_formants(PHONES[name]))

    # Insert brief closure silence before each plosive.
    expanded = []
    for p in phones:
        if p.stop:
            expanded.append(Phone(p.name + '_cl', p.f1, p.f2, p.f3,
                                  0.035, False, 0.0, 0.0, False, p.bw))
        expanded.append(p)
    phones = expanded

    f1, f2, f3, amp, noise, voiced, bws = build_tracks(phones, transition)
    bw1, bw2, bw3 = bws
    n = len(f1)

    # --- source -------------------------------------------------------
    # Flat pitch with a slow random drift. No terminal fall: the chip
    # had no intonation model, which is a large part of why it sounded
    # so mechanical.
    drift_curve = np.cumsum(rng.normal(0, 1, n // 512 + 2))
    drift_curve = drift_curve / (np.abs(drift_curve).max() + 1e-9) * drift
    drift_curve = np.interp(np.arange(n), 
                            np.linspace(0, n, len(drift_curve)), drift_curve)
    f0_track = pitch * (1.0 + drift_curve)

    # Build the glottal train with the average pitch, then it's close
    # enough -- the chip's pitch was essentially fixed anyway.
    voice_src = glottal_source(n, float(np.mean(f0_track)), jitter, rng)
    noise_src = rng.normal(0, 1, n) * 0.5

    src = voice_src * voiced * (1 - noise * 0.6) + noise_src * noise
    src = src * amp

    # --- cascade of three formant resonators --------------------------
    out = formant_filter(src, f1, float(np.mean(bw1)))
    out = formant_filter(out, f2, float(np.mean(bw2)))
    out = formant_filter(out, f3, float(np.mean(bw3)))

    # Slight spectral tilt -- the chip's output stage rolled off.
    b, a = signal.butter(1, 3000 / (SR / 2), btype='low')
    out = signal.lfilter(b, a, out)

    # --- the bandwidth limit that does most of the work ---------------
    # Downsample to the chip's rate and back up. This is the single
    # most important step for the vintage character: it removes
    # everything above ~4 kHz and adds the aliasing the chip had.
    down = signal.resample_poly(out, CHIP_SR, SR)
    # Quantize to ~8-bit, as the chip's DAC did.
    peak = np.abs(down).max() + 1e-9
    down = np.round(down / peak * 110) / 110 * peak
    out = signal.resample_poly(down, SR, CHIP_SR)
    if len(out) < n:
        out = np.pad(out, (0, n - len(out)))
    out = out[:n]

    # --- cheap amplifier ----------------------------------------------
    out = out / (np.abs(out).max() + 1e-9)
    out = np.tanh(out * 2.2) / np.tanh(2.2)
    out = out * 0.82

    # Short fades to avoid clicks.
    fade = int(0.005 * SR)
    out[:fade] *= np.linspace(0, 1, fade)
    out[-fade:] *= np.linspace(1, 0, fade)
    return out


def write_wav(path, audio, sr=SR):
    from scipy.io import wavfile
    data = np.clip(audio, -1, 1)
    wavfile.write(path, sr, (data * 32767).astype(np.int16))
