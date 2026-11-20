"""All game audio, synthesized from scratch with numpy (no samples, no third-party sounds), so every file is ours.

    python tools/audio/make_audio.py            -> unity/Assets/Resources/Audio/{Sfx,Music,Ambience}/*.ogg
    python tools/audio/make_audio.py sfx        (only one group: sfx | music | ambience)

Needs numpy, scipy and soundfile (pip install soundfile). Randomness is seeded, so the output is the same every run.
Music: three seamless loops (home = 家园/小镇/标题, explore = 远征, battle = 对战), written as note lists below.
"""
import os, sys
import numpy as np
import soundfile as sf
from scipy.signal import lfilter, butter, sosfilt

SR = 44100
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'unity', 'Assets', 'Resources', 'Audio')
rng = np.random.default_rng(20261121)

# ---------------------------------------------------------------- basics
def t_of(dur): return np.arange(int(dur * SR)) / SR

def note_hz(name):
    """'A4', 'C#5', 'Bb3' -> Hz"""
    names = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
    n = names[name[0]]; i = 1
    while name[i] in '#b':
        n += 1 if name[i] == '#' else -1; i += 1
    octave = int(name[i:])
    return 440.0 * 2 ** ((n + 12 * (octave + 1) - 69) / 12)

def adsr(n, a=0.005, d=0.1, s=0.6, r=0.1, hold=None):
    """attack / decay / sustain level / release, all in seconds; hold = time before release (default: until the end)"""
    t = np.arange(n) / SR
    hold = (n / SR - r) if hold is None else hold
    e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    rel = np.clip((t - hold) / max(r, 1e-4), 0, 1)
    return e * (1 - rel)

def expdec(n, tau): return np.exp(-np.arange(n) / SR / tau)

def lowpass(x, hz, order=2):
    sos = butter(order, min(hz, SR / 2 * 0.95), 'low', fs=SR, output='sos'); return sosfilt(sos, x)
def highpass(x, hz, order=2):
    sos = butter(order, hz, 'high', fs=SR, output='sos'); return sosfilt(sos, x)
def bandpass(x, lo, hi, order=2):
    sos = butter(order, [lo, min(hi, SR / 2 * 0.95)], 'band', fs=SR, output='sos'); return sosfilt(sos, x)

def noise(n): return rng.standard_normal(n)

def pink(n):
    # Voss-ish: white noise through a gentle 1/f filter
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1, -2.494956002, 2.017265875, -0.522189400]
    return lfilter(b, a, noise(n)) * 3

def glide(f0, f1, n, curve=1.0):
    k = (np.arange(n) / max(n - 1, 1)) ** curve
    f = f0 * (f1 / f0) ** k
    return np.sin(2 * np.pi * np.cumsum(f) / SR)

def place(buf, x, at):
    """add x into buf starting at sample `at` (clipped at the end)"""
    at = int(at)
    if at >= len(buf): return
    m = min(len(x), len(buf) - at)
    buf[at:at + m] += x[:m]

def comb(x, d, g):
    """y[n] = x[n] + g·y[n−d], one block of d samples at a time (each block only needs the previous one)"""
    y = np.zeros(len(x)); prev = np.zeros(d)
    for i in range(0, len(x), d):
        blk = x[i:i + d] + g * prev[:len(x[i:i + d])]
        y[i:i + d] = blk; prev = blk if len(blk) == d else prev
    return y

def allpass(x, d, g):
    """y[n] = −g·x[n] + x[n−d] + g·y[n−d], block-wise like comb()"""
    y = np.zeros(len(x)); px = np.zeros(d); py = np.zeros(d)
    for i in range(0, len(x), d):
        xb = x[i:i + d]; m = len(xb)
        yb = -g * xb + px[:m] + g * py[:m]
        y[i:i + d] = yb
        if m == d: px, py = xb, yb
    return y

def reverb(x, wet=0.25, size=1.0, damp=3500, stereo=True):
    """Schroeder reverb: parallel feedback combs + series allpasses"""
    def one(sig, delays):
        out = np.zeros_like(sig)
        for d in delays: out += comb(sig, int(d * size), 0.80)
        out /= len(delays)
        for d, g in ((225, 0.7), (556, 0.7), (441, 0.6)): out = allpass(out, d, g)
        return lowpass(out, damp)
    mono = x if x.ndim == 1 else x.mean(axis=1)
    l = one(mono, (1557, 1617, 1491, 1422, 1277, 1356))
    r = one(mono, (1580, 1640, 1514, 1445, 1300, 1379)) if stereo else l
    dry = x if x.ndim == 2 else np.stack([x, x], axis=1)
    return dry * (1 - wet * 0.5) + np.stack([l, r], axis=1) * wet * 2.2

def normalize(x, peak_db=-3.0):
    p = np.max(np.abs(x)) or 1
    return x / p * 10 ** (peak_db / 20)

def fade(x, a=0.002, r=0.02):
    n = len(x); e = np.ones(n)
    na, nr = min(int(a * SR), n // 2), min(int(r * SR), n // 2)
    if na: e[:na] = np.linspace(0, 1, na)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return x * (e if x.ndim == 1 else e[:, None])

def write(group, name, x):
    os.makedirs(os.path.join(ROOT, group), exist_ok=True)
    path = os.path.join(ROOT, group, name + '.ogg')
    data = np.clip(x, -1, 1).astype(np.float32)
    # small blocks: libsndfile's Vorbis encoder overflows its stack when handed a long file in one call
    with sf.SoundFile(path, 'w', SR, 1 if data.ndim == 1 else data.shape[1], format='OGG', subtype='VORBIS') as f:
        for i in range(0, len(data), 8192): f.write(data[i:i + 8192])
    print(f'{group}/{name}.ogg  {len(x) / SR:.2f}s')

# ---------------------------------------------------------------- instruments (each returns a mono note)
def marimba(f, dur=0.9, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    x = (np.sin(2 * np.pi * f * t) * expdec(n, 0.45) + 0.35 * np.sin(2 * np.pi * f * 3.99 * t) * expdec(n, 0.06)
         + 0.12 * np.sin(2 * np.pi * f * 9.8 * t) * expdec(n, 0.02))
    click = lowpass(noise(n), 3000) * expdec(n, 0.003) * 0.15
    return (x + click) * vel * adsr(n, 0.002, 1, 1, 0.05)

def kalimba(f, dur=1.2, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    x = (np.sin(2 * np.pi * f * t) * expdec(n, 0.7) + 0.25 * np.sin(2 * np.pi * f * 5.4 * t) * expdec(n, 0.05)
         + 0.1 * np.sin(2 * np.pi * f * 2.0 * t) * expdec(n, 0.25))
    return x * vel * adsr(n, 0.001, 1, 1, 0.06)

def bell(f, dur=1.6, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    parts = ((1, 1, 1.2), (2.76, 0.45, 0.5), (5.4, 0.25, 0.25), (8.93, 0.12, 0.12))
    x = sum(a * np.sin(2 * np.pi * f * r * t) * expdec(n, tau) for r, a, tau in parts)
    return x * vel * adsr(n, 0.001, 1, 1, 0.08) * 0.6

def musicbox(f, dur=1.4, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) * expdec(n, 0.6) + 0.3 * np.sin(2 * np.pi * f * 4.0 * t) * expdec(n, 0.12) + 0.15 * np.sin(2 * np.pi * f * 6.8 * t) * expdec(n, 0.05)
    return x * vel * adsr(n, 0.001, 1, 1, 0.08) * 0.7

def pad(freqs, dur, vel=1.0, bright=1800):
    """soft detuned pad chord (additive saw-ish voices, slow attack)"""
    n = int(dur * SR); t = np.arange(n) / SR
    x = np.zeros(n)
    for f in freqs:
        for det in (-0.006, 0.0, 0.0065):
            ff = f * (1 + det)
            ph = rng.random() * 2 * np.pi
            for k in range(1, 7):
                x += np.sin(2 * np.pi * ff * k * t + ph * k) / (k * 1.3)
    x = lowpass(x, bright)
    vib = 1 + 0.05 * np.sin(2 * np.pi * 0.3 * t)
    return x * vib * adsr(n, min(0.35, dur * 0.3), 1, 1, min(0.5, dur * 0.4)) * vel * 0.05

def bass(f, dur=0.6, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t) + 0.08 * np.sin(2 * np.pi * 3 * f * t)
    return x * adsr(n, 0.008, 0.25, 0.55, 0.06) * vel * 0.8

def pluck(f, dur=1.0, vel=1.0, bright=0.5):
    """Karplus-Strong string (an IIR comb, so lfilter does the per-sample work)"""
    n = int(dur * SR); N = max(2, int(round(SR / f)))
    burst = np.zeros(n); burst[:N] = lowpass(noise(N), 1500 + 5000 * bright)
    a = np.zeros(N + 2); a[0] = 1; a[N] = -0.498; a[N + 1] = -0.498
    y = lfilter([1], a, burst)
    return y * adsr(n, 0.001, 1, 1, 0.05) * vel * 0.9

def flute(f, dur, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.2 * t) * np.clip(t / 0.3, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    x = np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)
    breath = bandpass(noise(n), f * 0.8, f * 3) * 0.06
    return (x + breath) * adsr(n, 0.06, 0.3, 0.8, 0.12) * vel * 0.5

def softlead(f, dur, vel=1.0):
    """rounded square-ish lead for the battle theme (odd harmonics, low-passed)"""
    n = int(dur * SR); t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 6 * t) * np.clip((t - 0.1) / 0.2, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    x = sum(np.sin(k * ph) / k for k in (1, 3, 5, 7))
    x = lowpass(x, 3200)
    return x * adsr(n, 0.01, 0.15, 0.7, 0.06) * vel * 0.32

# percussion
def kick(vel=1.0):
    n = int(0.35 * SR)
    return glide(140, 45, n, 0.4) * expdec(n, 0.12) * vel
def snare(vel=1.0):
    n = int(0.22 * SR)
    return (bandpass(noise(n), 1200, 7000) * expdec(n, 0.05) * 0.6 + glide(220, 160, n) * expdec(n, 0.04) * 0.4) * vel
def shaker(vel=1.0):
    n = int(0.08 * SR)
    return highpass(noise(n), 5000) * adsr(n, 0.01, 0.025, 0.0, 0.01) * vel * 0.35
def hat(vel=1.0):
    n = int(0.05 * SR)
    return highpass(noise(n), 7000) * expdec(n, 0.012) * vel * 0.3
def woodblock(f=900, vel=1.0):
    n = int(0.12 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * t) * expdec(n, 0.025) * vel * 0.5
def handdrum(f=110, vel=1.0):
    n = int(0.4 * SR)
    return (glide(f * 1.6, f, n, 0.3) * expdec(n, 0.15) + lowpass(noise(n), 900) * expdec(n, 0.02) * 0.3) * vel

# ---------------------------------------------------------------- the music
CHORD_NOTES = {
    'F': ['F3', 'A3', 'C4'], 'Dm': ['D3', 'F3', 'A3'], 'Bb': ['Bb2', 'D3', 'F3'], 'C': ['C3', 'E3', 'G3'], 'Am': ['A2', 'C3', 'E3'],
    'Gm': ['G2', 'Bb2', 'D3'], 'G': ['G2', 'B2', 'D3'], 'E': ['E2', 'G#2', 'B2'], 'A': ['A2', 'C#3', 'E3'],
}

class Song:
    def __init__(self, bpm, bars):
        self.beat = 60 / bpm; self.bars = bars
        self.length = int(bars * 4 * self.beat * SR)
        tail = int(3 * SR)
        self.L = np.zeros(self.length + tail); self.R = np.zeros(self.length + tail)
    def at(self, bar, beat): return int((bar * 4 + beat) * self.beat * SR)
    def add(self, x, bar, beat, pan=0.0, gain=1.0):
        """pan −1 (left) … +1 (right), equal-power"""
        a = (pan + 1) * np.pi / 4
        s = self.at(bar, beat)
        place(self.L, x * np.cos(a) * gain, s); place(self.R, x * np.sin(a) * gain, s)
    def render(self, wet=0.22, peak=-5.0):
        # fold the tail past the loop end back onto the start, then reverb two copies and keep the second
        L = self.L[:self.length].copy(); R = self.R[:self.length].copy()
        tl = len(self.L) - self.length
        L[:tl] += self.L[self.length:]; R[:tl] += self.R[self.length:]
        x = np.stack([L, R], axis=1)
        two = reverb(np.concatenate([x, x]), wet=wet, size=1.15)
        out = highpass(two[self.length:].T, 25).T   # no DC / rumble
        return normalize(out, peak)

def melody(song, inst, notes, pan=0.0, gain=1.0, legato=1.0):
    """notes: (bar, beat, note, beats)"""
    for bar, beat, nn, beats in notes:
        song.add(inst(note_hz(nn), beats * song.beat * legato + 0.25), bar, beat, pan, gain)

def home_theme():
    s = Song(92, 16)
    prog = ['F', 'Dm', 'Bb', 'C', 'F', 'Am', 'Bb', 'C', 'Dm', 'Am', 'Bb', 'F', 'Gm', 'C', 'F', 'C']
    for bar, ch in enumerate(prog):
        tones = [note_hz(n) for n in CHORD_NOTES[ch]]
        s.add(pad([f * 2 for f in tones], 4 * s.beat + 0.4, 0.9), bar, 0, 0, 1.0)
        s.add(bass(tones[0] / 2, 1.6 * s.beat), bar, 0, 0, 0.7)
        s.add(bass(tones[0] / 2 * 1.5, 0.9 * s.beat), bar, 2.5, 0, 0.45)
        # kalimba arpeggio in eighths (up and back)
        arp = [tones[0] * 2, tones[1] * 2, tones[2] * 2, tones[0] * 4, tones[2] * 2, tones[1] * 2, tones[0] * 2, tones[1] * 2]
        for i, f in enumerate(arp):
            s.add(kalimba(f, 1.0, 0.55 if i % 2 else 0.7), bar, i * 0.5, -0.35 + 0.1 * (i % 3), 0.55)
        if bar >= 4:
            for i in range(8):
                s.add(shaker(0.5 if i % 2 else 0.25), bar, i * 0.5 + 0.02, 0.4, 1)
            s.add(woodblock(950, 0.35), bar, 1.5, -0.5); s.add(woodblock(800, 0.3), bar, 3.5, -0.5)
    tune = [
        (4, 0, 'A4', 1), (4, 1, 'C5', 1), (4, 2, 'F5', 2),
        (5, 0, 'E5', 1), (5, 1, 'D5', .5), (5, 1.5, 'C5', .5), (5, 2, 'A4', 2),
        (6, 0, 'D5', 1), (6, 1, 'C5', 1), (6, 2, 'Bb4', 1), (6, 3, 'D5', 1),
        (7, 0, 'C5', 3), (7, 3, 'G4', 1),
        (8, 0, 'F5', 1), (8, 1, 'E5', 1), (8, 2, 'D5', 1), (8, 3, 'A4', 1),
        (9, 0, 'C5', 2), (9, 2, 'E5', 2),
        (10, 0, 'F5', 1), (10, 1, 'D5', 1), (10, 2, 'Bb4', 2),
        (11, 0, 'C5', 1), (11, 1, 'A4', 1), (11, 2, 'F4', 2),
        (12, 0, 'Bb4', 1), (12, 1, 'D5', 1), (12, 2, 'G5', 2),
        (13, 0, 'E5', 1), (13, 1, 'D5', 1), (13, 2, 'C5', 1), (13, 3, 'Bb4', 1),
        (14, 0, 'A4', 2), (14, 2, 'C5', 1), (14, 3, 'F5', 1),
        (15, 0, 'E5', 3),
    ]
    melody(s, bell, tune, 0.15, 0.75)
    melody(s, marimba, [(b, bt, n, d) for b, bt, n, d in tune if b >= 8], -0.2, 0.35)   # doubled the second time round
    return s.render(0.26, -5.5)

def explore_theme():
    s = Song(100, 16)
    prog = ['Dm', 'C', 'Bb', 'C', 'Dm', 'F', 'C', 'Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'C', 'Dm', 'Dm']
    for bar, ch in enumerate(prog):
        tones = [note_hz(n) for n in CHORD_NOTES[ch]]
        s.add(pad([f * 2 for f in tones] + [tones[0] * 4], 4 * s.beat + 0.5, 0.8, 1400), bar, 0, 0, 1.0)
        s.add(bass(tones[0] / 2, 2.4 * s.beat), bar, 0, 0, 0.65)
        s.add(bass(tones[0] / 2, 0.8 * s.beat), bar, 3, 0, 0.4)
        # plucked string arpeggio, a little syncopated
        pattern = [(0, 0), (0.5, 1), (1, 2), (1.5, 3), (2.5, 1), (3, 2), (3.5, 0)]
        notes = [tones[0] * 2, tones[1] * 2, tones[2] * 2, tones[0] * 4]
        for beat, k in pattern:
            s.add(pluck(notes[k], 1.4, 0.7, 0.45), bar, beat, 0.4 - 0.15 * (k % 2), 0.5)
        # hand drum: boom . ta boom | . ta . ta
        for beat, f, v in ((0, 95, 0.9), (1.5, 160, 0.4), (2, 95, 0.6), (2.75, 160, 0.35), (3.5, 160, 0.45)):
            s.add(handdrum(f, v), bar, beat, -0.2, 0.75)
        if bar >= 4:
            for i in range(8): s.add(shaker(0.45 if i % 2 else 0.2), bar, i * 0.5 + 0.03, -0.45, 0.9)
    tune = [
        (4, 0, 'A4', 1), (4, 1, 'D5', 1), (4, 2, 'E5', 1), (4, 3, 'F5', 1),
        (5, 0, 'E5', 2), (5, 2, 'C5', 2),
        (6, 0, 'D5', 1), (6, 1, 'C5', 1), (6, 2, 'G4', 2),
        (7, 0, 'A4', 4),
        (8, 0, 'F5', 1), (8, 1, 'E5', 1), (8, 2, 'D5', 1), (8, 3, 'F5', 1),
        (9, 0, 'C5', 2), (9, 2, 'A4', 2),
        (10, 0, 'G4', 1), (10, 1, 'A4', 1), (10, 2, 'C5', 1), (10, 3, 'E5', 1),
        (11, 0, 'D5', 4),
        (12, 0, 'D5', 1), (12, 1, 'F5', 1), (12, 2, 'E5', 1), (12, 3, 'D5', 1),
        (13, 0, 'E5', 2), (13, 2, 'G5', 2),
        (14, 0, 'F5', 1), (14, 1, 'E5', 1), (14, 2, 'D5', 1), (14, 3, 'C5', 1),
        (15, 0, 'D5', 3),
    ]
    melody(s, flute, tune, -0.1, 0.8, 0.95)
    return s.render(0.3, -5.5)

def battle_theme():
    s = Song(132, 16)
    prog = ['Am', 'F', 'G', 'E', 'Am', 'F', 'G', 'E', 'Am', 'F', 'G', 'E', 'Am', 'F', 'G', 'E']
    for bar, ch in enumerate(prog):
        tones = [note_hz(n) for n in CHORD_NOTES[ch]]
        # driving bass in eighths (root, root, octave, root …)
        for i in range(8):
            f = tones[0] / 2 * (2 if i in (2, 6) else 1)
            s.add(bass(f, 0.45 * s.beat, 0.9 if i % 2 == 0 else 0.6), bar, i * 0.5, 0, 0.6)
        # pad stabs on 1 and the "and" of 2
        s.add(pad([f * 2 for f in tones], 1.2 * s.beat, 1.1, 2400), bar, 0, 0, 1.2)
        s.add(pad([f * 2 for f in tones], 0.8 * s.beat, 0.9, 2400), bar, 1.5, 0, 1.0)
        # drums
        for b in (0, 2): s.add(kick(0.9), bar, b, 0, 0.9)
        s.add(kick(0.5), bar, 2.5, 0, 0.8)
        for b in (1, 3): s.add(snare(0.8), bar, b, 0.1, 0.7)
        for i in range(8): s.add(hat(0.7 if i % 2 else 0.4), bar, i * 0.5, 0.35, 1)
        # marimba arpeggio sixteenths in the intro and the last four bars
        if bar < 4 or bar >= 12:
            arp = [tones[0] * 4, tones[1] * 4, tones[2] * 4, tones[1] * 4]
            for i in range(16): s.add(marimba(arp[i % 4], 0.4, 0.5), bar, i * 0.25, -0.4, 0.4)
    tune = [
        (4, 0, 'E5', 1), (4, 1, 'A5', 1), (4, 2, 'G5', .5), (4, 2.5, 'E5', .5), (4, 3, 'D5', 1),
        (5, 0, 'C5', 1), (5, 1, 'F5', 1), (5, 2, 'E5', .5), (5, 2.5, 'D5', .5), (5, 3, 'C5', 1),
        (6, 0, 'B4', 1), (6, 1, 'D5', 1), (6, 2, 'G5', 1), (6, 3, 'F5', .5), (6, 3.5, 'D5', .5),
        (7, 0, 'E5', 2), (7, 2, 'G#4', 1), (7, 3, 'B4', 1),
        (8, 0, 'A4', 1), (8, 1, 'C5', 1), (8, 2, 'E5', 1), (8, 3, 'A5', 1),
        (9, 0, 'A5', 1), (9, 1, 'G5', .5), (9, 1.5, 'F5', .5), (9, 2, 'E5', 1), (9, 3, 'C5', 1),
        (10, 0, 'D5', 1), (10, 1, 'E5', .5), (10, 1.5, 'F5', .5), (10, 2, 'G5', 2),
        (11, 0, 'G#5', 2), (11, 2, 'E5', 2),
        (12, 0, 'E5', 1), (12, 1, 'A5', 1), (12, 2, 'G5', .5), (12, 2.5, 'E5', .5), (12, 3, 'D5', 1),
        (13, 0, 'C5', 1), (13, 1, 'F5', 1), (13, 2, 'A5', 2),
        (14, 0, 'G5', 1), (14, 1, 'F5', 1), (14, 2, 'D5', 1), (14, 3, 'B4', 1),
        (15, 0, 'E5', 3),
    ]
    melody(s, softlead, tune, 0.1, 0.9, 0.92)
    return s.render(0.16, -5.0)

# ---------------------------------------------------------------- ambience (seamless loops)
def loop_xfade(x, xf=2.0):
    """make x loop: the last xf seconds are faded into the start"""
    n = int(xf * SR)
    body = x[:-n].copy(); tail = x[-n:]
    w = np.linspace(0, 1, n)
    if x.ndim == 2: w = w[:, None]
    body[:n] = body[:n] * w + tail * (1 - w)
    return body

def wind(n, base=500, gust=0.12, depth=0.6):
    t = np.arange(n) / SR
    env = 0.55 + depth * 0.5 * (np.sin(2 * np.pi * gust * t + 1.3) * 0.6 + np.sin(2 * np.pi * gust * 2.7 * t) * 0.4)
    w = lowpass(pink(n), base) * env
    whistle = bandpass(noise(n), base * 1.8, base * 2.4, 2) * np.clip(env - 0.6, 0, 1) * 0.6
    return w + whistle

def bird(f0=3200):
    """one short chirp phrase"""
    out = []
    for _ in range(rng.integers(2, 5)):
        d = rng.uniform(0.05, 0.12); n = int(d * SR)
        f1 = f0 * rng.uniform(0.85, 1.25); f2 = f1 * rng.uniform(1.1, 1.5)
        x = glide(f1, f2, n, 0.6) * np.sin(np.pi * np.arange(n) / n) ** 2
        out.append(x); out.append(np.zeros(int(rng.uniform(0.03, 0.09) * SR)))
    return np.concatenate(out) * 0.25

def crickets(n, rate=4.6e3, density=1.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(3):
        f = rate * (1 + 0.04 * k)
        chirp = (np.sin(2 * np.pi * 28 * t + k) > 0.2).astype(float)          # pulses inside a trill
        trill = (np.sin(2 * np.pi * (0.55 + 0.13 * k) * t + 2 * k) > 0.1).astype(float)
        out += np.sin(2 * np.pi * f * t) * lowpass(chirp * trill, 400) * (0.5 / (k + 1)) * density
    return out * 0.18

def stereo_scatter(n, make, count, pan_spread=0.8):
    L = np.zeros(n); R = np.zeros(n)
    for _ in range(count):
        x = make(); at = int(rng.uniform(0, n - len(x) - 1))
        p = rng.uniform(-pan_spread, pan_spread); a = (p + 1) * np.pi / 4
        place(L, x * np.cos(a), at); place(R, x * np.sin(a), at)
    return np.stack([L, R], axis=1)

def amb_day(dur=32):
    n = int((dur + 2) * SR)
    w = wind(n, 420, 0.09, 0.4) * 0.5
    x = np.stack([w, np.roll(w, 900)], axis=1) + stereo_scatter(n, lambda: bird(rng.uniform(2600, 4200)), 9)
    return normalize(loop_xfade(reverb(x, 0.2)), -12)

def amb_night(dur=32):
    n = int((dur + 2) * SR)
    w = wind(n, 300, 0.07, 0.3) * 0.35
    c1 = crickets(n, 4500); c2 = np.roll(crickets(n, 4900, 0.8), 13000)
    x = np.stack([w + c1, np.roll(w, 900) + c2], axis=1)
    return normalize(loop_xfade(reverb(x, 0.25)), -13)

def amb_wind(dur=32):
    n = int((dur + 2) * SR)
    w1 = wind(n, 650, 0.14, 0.8); w2 = wind(n, 620, 0.11, 0.8)
    x = np.stack([w1, w2], axis=1) * 0.7 + stereo_scatter(n, lambda: bird(rng.uniform(3200, 4800)) * 0.6, 4)
    return normalize(loop_xfade(reverb(x, 0.15)), -11)

def amb_fog(dur=32):
    n = int((dur + 2) * SR); t = np.arange(n) / SR
    w1 = wind(n, 260, 0.06, 0.7); w2 = wind(n, 240, 0.05, 0.7)
    hum = (np.sin(2 * np.pi * 73.4 * t) + 0.5 * np.sin(2 * np.pi * 110 * t + 0.4)) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.05 * t)) * 0.05
    c = crickets(n, 4200, 0.4)
    x = np.stack([w1 * 0.8 + hum + c, w2 * 0.8 + hum + np.roll(c, 20000)], axis=1)
    return normalize(loop_xfade(reverb(x, 0.35)), -12)

# ---------------------------------------------------------------- sound effects
def chord(inst, names, spread=0.0, dur=1.2, vel=1.0):
    parts = [inst(note_hz(nn), dur, vel) for nn in names]
    n = max(len(p) for p in parts) + int(spread * SR * len(names))
    out = np.zeros(n)
    for i, p in enumerate(parts): place(out, p, i * spread * SR)
    return out

def seq(*parts_with_gaps):
    """parts and gaps (float seconds) in order"""
    total = sum(len(p) if isinstance(p, np.ndarray) else int(p * SR) for p in parts_with_gaps)
    out = np.zeros(total); at = 0
    for p in parts_with_gaps:
        if isinstance(p, np.ndarray): place(out, p, at); at += len(p)
        else: at += int(p * SR)
    return out

def mix(*items):
    """(array, offset in seconds) … summed into one"""
    n = max(len(x) + int(o * SR) for x, o in items)
    out = np.zeros(n)
    for x, o in items: place(out, x, o * SR)
    return out

def whoosh(dur=0.18, f0=400, f1=2500, vel=1.0):
    n = int(dur * SR)
    x = noise(n); k = np.linspace(0, 1, n)
    out = np.zeros(n); seg = 256
    for i in range(0, n, seg):
        f = f0 * (f1 / f0) ** k[i]
        out[i:i + seg] = bandpass(x[max(0, i - 2048):i + seg], max(80, f * 0.6), f * 1.4)[-len(out[i:i + seg]):]
    return out * np.sin(np.pi * k) ** 1.5 * vel * 0.5

def thud(f0=180, f1=55, dur=0.18, vel=1.0):
    n = int(dur * SR)
    return (glide(f0, f1, n, 0.5) * expdec(n, dur / 3) + lowpass(noise(n), 700) * expdec(n, 0.02) * 0.5) * vel

def sfx_all():
    S = {}
    n = int(0.06 * SR)
    S['click'] = (glide(1700, 1100, n) * expdec(n, 0.012) + bandpass(noise(n), 2000, 6000) * expdec(n, 0.003) * 0.3) * 0.6
    S['open'] = mix((whoosh(0.16, 300, 1800, 0.7), 0), (marimba(note_hz('G5'), 0.4, 0.25), 0.06))
    S['close'] = whoosh(0.13, 1600, 350, 0.6)
    S['coin'] = seq(bell(note_hz('B5'), 0.09), bell(note_hz('E6'), 0.7))
    n = int(0.09 * SR); S['pick'] = glide(320, 760, n, 0.7) * expdec(n, 0.035) * 0.8
    S['harvest'] = seq(S['pick'], 0.02, chord(bell, ['C6', 'E6', 'G6'], 0.06, 0.6, 0.6))
    S['plant'] = mix((thud(150, 70, 0.16, 0.8), 0), (lowpass(noise(int(0.12 * SR)), 1200) * expdec(int(0.12 * SR), 0.03) * 0.5, 0))
    S['dig'] = seq(thud(120, 60, 0.12) + lowpass(noise(int(0.12 * SR)), 2500) * expdec(int(0.12 * SR), 0.03) * 0.6, 0.06,
                   thud(110, 55, 0.12, 0.7) + lowpass(noise(int(0.12 * SR)), 2500) * expdec(int(0.12 * SR), 0.03) * 0.4)
    nw = int(0.5 * SR); kw = np.linspace(0, 1, nw)
    splash = bandpass(noise(nw), 600, 5000) * np.exp(-kw * 6) * 0.6
    bubble = lambda f: glide(f, f * 1.8, int(0.04 * SR)) * np.sin(np.linspace(0, np.pi, int(0.04 * SR))) * 0.3
    S['water'] = mix((splash, 0), *[(bubble(f), d) for f, d in ((700, 0.05), (950, 0.11), (820, 0.17), (1100, 0.24), (900, 0.3))])
    nc = int(0.25 * SR); tc = np.arange(nc) / SR
    thock = np.sin(2 * np.pi * 420 * tc) * expdec(nc, 0.05) + 0.4 * np.sin(2 * np.pi * 1130 * tc) * expdec(nc, 0.02) + bandpass(noise(nc), 800, 4000) * expdec(nc, 0.006)
    S['chop'] = seq(thock, 0.05, thock * 0.5)
    nm = int(0.35 * SR); tm = np.arange(nm) / SR
    clink = sum(a * np.sin(2 * np.pi * f * tm) * expdec(nm, tau) for f, a, tau in ((2100, 1, 0.08), (3170, 0.6, 0.05), (4730, 0.4, 0.03), (6020, 0.2, 0.02)))
    S['mine'] = (clink * 0.5 + highpass(noise(nm), 2000) * expdec(nm, 0.008) * 0.6) * 0.8
    ncr = int(0.35 * SR); tcr = np.arange(ncr) / SR
    creak = lowpass(np.sign(np.sin(2 * np.pi * (110 + 25 * np.sin(2 * np.pi * 7 * tcr)) * tcr)), 900) * np.sin(np.pi * tcr / tcr[-1]) * 0.25
    S['chest'] = seq(creak, chord(bell, ['G5', 'C6', 'E6', 'G6'], 0.07, 0.9, 0.7))
    S['craft'] = seq(woodblock(700, 1.2), 0.08, woodblock(760, 1.2), 0.05, chord(marimba, ['C5', 'G5', 'C6'], 0.05, 0.7, 0.7))
    munch = lambda v: bandpass(noise(int(0.07 * SR)), 900, 3500) * expdec(int(0.07 * SR), 0.02) * v
    S['eat'] = seq(munch(0.8), 0.06, munch(0.6), 0.07, munch(0.7), 0.05, kalimba(note_hz('E6'), 0.4, 0.4))
    nh = int(0.12 * SR)
    S['happy'] = seq(glide(600, 950, nh, 0.5) * np.sin(np.pi * np.arange(nh) / nh) * 0.7, 0.02, glide(800, 1300, nh, 0.5) * np.sin(np.pi * np.arange(nh) / nh) * 0.7)
    sp = np.zeros(int(0.9 * SR))
    for i, nn in enumerate(['C6', 'G6', 'E6', 'C7', 'G6', 'E7']): place(sp, bell(note_hz(nn), 0.7, 0.5 + 0.08 * i), i * 0.06 * SR)
    S['sparkle'] = sp
    S['levelup'] = mix((chord(marimba, ['C5', 'E5', 'G5', 'C6'], 0.08, 0.5, 0.9), 0), (chord(bell, ['C6', 'E6', 'G6'], 0.0, 1.2, 0.5), 0.32))
    ev = np.zeros(int(2.2 * SR)); kk = np.linspace(0, 1, int(1.2 * SR))
    place(ev, glide(300, 1600, len(kk), 1.5) * np.sin(np.pi * kk) * 0.25 + highpass(noise(len(kk)), 3000) * kk * 0.1, 0)
    for i, nn in enumerate(['C5', 'E5', 'G5', 'C6', 'E6', 'G6']): place(ev, bell(note_hz(nn), 1.0, 0.5), (0.1 + i * 0.15) * SR)
    place(ev, chord(bell, ['C6', 'E6', 'G6', 'C7'], 0.0, 1.0, 0.6), 1.15 * SR)
    S['evolve'] = ev
    S['quest'] = chord(marimba, ['G5', 'C6', 'E6'], 0.1, 0.8, 0.9)
    S['dayend'] = mix((chord(musicbox, ['C6', 'G5', 'E5', 'C5'], 0.22, 1.2, 0.8), 0), (chord(musicbox, ['C5', 'E5', 'G5'], 0.0, 1.4, 0.35), 0.9))
    S['swish'] = whoosh(0.15, 500, 3000, 0.8)
    S['hit'] = mix((thud(200, 60, 0.18, 1.0), 0), (bandpass(noise(int(0.05 * SR)), 1000, 5000) * expdec(int(0.05 * SR), 0.01) * 0.5, 0))
    S['hit_super'] = mix((S['hit'] * 1.1, 0), (highpass(noise(int(0.08 * SR)), 3000) * expdec(int(0.08 * SR), 0.015) * 0.7, 0), (chord(bell, ['E6', 'B6'], 0.03, 0.4, 0.4), 0.02))
    S['hit_weak'] = lowpass(thud(150, 70, 0.15, 0.7), 900)
    hl = np.zeros(int(0.9 * SR))
    for i, nn in enumerate(['G5', 'C6', 'E6', 'G6']): place(hl, kalimba(note_hz(nn), 0.6, 0.6), i * 0.08 * SR)
    S['heal'] = hl
    nb = int(0.35 * SR); kb = np.linspace(0, 1, nb)
    S['buff'] = (glide(500, 1200, nb, 0.8) + 0.5 * glide(750, 1800, nb, 0.8)) * np.sin(np.pi * kb) * 0.35
    S['debuff'] = (glide(900, 350, nb, 0.8) + 0.5 * glide(1350, 520, nb, 0.8)) * np.sin(np.pi * kb) * 0.35
    nf = int(0.6 * SR); kf = np.linspace(0, 1, nf)
    S['faint'] = glide(620, 160, nf, 0.7) * (1 - kf) ** 1.2 * 0.5 + lowpass(thud(120, 50, 0.6, 0.4), 600)
    S['throw'] = whoosh(0.22, 300, 2200, 0.8)
    S['escape'] = seq(glide(300, 900, int(0.1 * SR)) * 0.5, glide(900, 400, int(0.15 * SR)) * 0.4 * np.sin(np.linspace(0, 6 * np.pi, int(0.15 * SR))) ** 2)
    tap = woodblock(1200, 0.7)
    S['catch'] = seq(tap, 0.25, tap, 0.25, tap, 0.15, chord(bell, ['C6', 'E6', 'G6', 'C7'], 0.05, 1.0, 0.7))
    S['send'] = seq(glide(400, 900, int(0.08 * SR)) * expdec(int(0.08 * SR), 0.04) * 0.6, chord(bell, ['G6', 'D7'], 0.04, 0.4, 0.3))
    step = lambda: highpass(noise(int(0.03 * SR)), 1500) * expdec(int(0.03 * SR), 0.008) * 0.6
    S['flee'] = seq(step(), 0.06, step(), 0.06, step(), 0.06, step(), whoosh(0.2, 1800, 500, 0.5))
    win = np.zeros(int(2.0 * SR))
    for i, nn in enumerate(['C5', 'E5', 'G5']): place(win, marimba(note_hz(nn), 0.5, 0.9), i * 0.12 * SR)
    place(win, chord(marimba, ['C6', 'G5', 'E5'], 0.0, 1.2, 0.9), 0.42 * SR)
    place(win, chord(bell, ['C6', 'E6', 'G6'], 0.0, 1.4, 0.45), 0.42 * SR)
    S['win'] = win
    lose = np.zeros(int(1.8 * SR))
    for i, nn in enumerate(['E5', 'D5', 'C5', 'A4']): place(lose, kalimba(note_hz(nn), 0.9, 0.8), i * 0.22 * SR)
    S['lose'] = lose
    for k, v in S.items():
        x = fade(v, 0.001, 0.02)
        if k != 'click':   # room for the reverb tail, then a soft end
            x = reverb(np.concatenate([x, np.zeros(int(0.35 * SR))]), 0.12, 0.6).mean(axis=1)
        x = fade(x, 0.0, 0.08)
        write('Sfx', k, normalize(x, -3 if k not in ('click', 'open', 'close') else -6))

def music_all():
    write('Music', 'home', home_theme())
    write('Music', 'explore', explore_theme())
    write('Music', 'battle', battle_theme())

def ambience_all():
    write('Ambience', 'day', amb_day())
    write('Ambience', 'night', amb_night())
    write('Ambience', 'wind', amb_wind())
    write('Ambience', 'fog', amb_fog())

if __name__ == '__main__':
    which = sys.argv[1:] or ['sfx', 'music', 'ambience']
    if 'sfx' in which: sfx_all()
    if 'music' in which: music_all()
    if 'ambience' in which: ambience_all()
