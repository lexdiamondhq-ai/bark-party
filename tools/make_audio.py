#!/usr/bin/env python3
"""Bark Party audio generator.

Synthesizes every sound effect and music loop for the game from scratch
(numpy only, no samples, no external services) and encodes them to AAC .m4a
with ffmpeg. Fully deterministic: every random source uses a fixed seed, so
re-running produces the same audio.

    python3 tools/make_audio.py            # writes assets/game/audio/*.m4a + manifest.json

Design notes
- Oscillators are additive (band-limited, gently rolled off) so square/pulse
  waves stay warm and alias-free: a soft, toy-like, "Nintendo-ish" palette.
- Music loops are rendered with extra tail time (two bars plus reverb) and the
  tail is mixed back over the start, so the file loops sample-exactly from its
  end to its start with no gap or click.
"""

import json
import os
import subprocess
import sys

import numpy as np

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "game", "audio")
FFMPEG = "/usr/bin/ffmpeg"

TWO_PI = 2.0 * np.pi


# ---------------------------------------------------------------------------
# Basic DSP helpers
# ---------------------------------------------------------------------------

def ns(sec):
    return int(round(sec * SR))


def tvec(sec):
    return np.arange(ns(sec)) / SR


def mtof(m):
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


NOTE_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def note(name):
    """'C5', 'F#4', 'Bb3' -> MIDI number."""
    pc = NOTE_PC[name[0]]
    i = 1
    while i < len(name) and name[i] in "#b":
        pc += 1 if name[i] == "#" else -1
        i += 1
    octave = int(name[i:])
    return pc + 12 * (octave + 1)


def hz(name):
    return mtof(note(name))


def harmonic_coef(shape, h, duty):
    if shape == "sine":
        return 1.0 if h == 1 else 0.0
    if shape == "square":
        return (4 / np.pi) / h if h % 2 == 1 else 0.0
    if shape == "pulse":
        return (2 / np.pi) * np.sin(np.pi * h * duty) / h * 2.0
    if shape == "tri":
        if h % 2 == 0:
            return 0.0
        return (8 / np.pi ** 2) * ((-1) ** ((h - 1) // 2)) / (h * h)
    if shape == "saw":
        return (2 / np.pi) * ((-1) ** (h + 1)) / h
    raise ValueError(shape)


def osc(freq, n=None, shape="square", duty=0.5, bright=4000.0, maxf=9000.0,
        maxh=48, phase0=0.0):
    """Band-limited additive oscillator. `freq` may be a scalar or a per-sample array.

    `bright` is a soft low-pass corner applied per harmonic (keeps it warm).
    """
    if np.isscalar(freq):
        freq = np.full(n, float(freq))
    else:
        freq = np.asarray(freq, dtype=float)
    ph = np.cumsum(freq) / SR + phase0
    fref = float(np.max(freq)) if len(freq) else 1.0
    fref = max(fref, 1.0)
    nh = max(1, min(maxh, int(maxf // fref)))
    out = np.zeros(len(freq))
    for h in range(1, nh + 1):
        a = harmonic_coef(shape, h, duty)
        if a == 0.0:
            continue
        a *= 1.0 / np.sqrt(1.0 + (h * fref / bright) ** 4)
        out += a * np.sin(TWO_PI * h * ph)
    return out


def noise(n, seed):
    return np.random.default_rng(seed).standard_normal(n)


def fft_filter(x, lo=None, hi=None, order=2, circular=False):
    """Zero-phase Butterworth-magnitude high/low/band-pass via FFT."""
    n = len(x)
    pad = 0 if circular else min(n, 8192)
    N = n + pad
    X = np.fft.rfft(x, N)
    f = np.fft.rfftfreq(N, 1.0 / SR)
    f[0] = 1e-6
    H = np.ones_like(f)
    if lo:
        H *= 1.0 / np.sqrt(1.0 + (lo / f) ** (2 * order))
    if hi:
        H *= 1.0 / np.sqrt(1.0 + (f / hi) ** (2 * order))
    y = np.fft.irfft(X * H, N)
    return y[:n]


def svf(x, fc, q=0.707, mode="bp"):
    """Time-varying TPT state-variable filter (python loop; for short sounds)."""
    n = len(x)
    fc = np.broadcast_to(np.asarray(fc, dtype=float), (n,))
    fc = np.clip(fc, 20.0, SR * 0.45)
    g = np.tan(np.pi * fc / SR)
    k = 1.0 / q
    a1 = 1.0 / (1.0 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    ic1 = ic2 = 0.0
    out = np.zeros(n)
    xs = x.tolist()
    a1l, a2l, a3l = a1.tolist(), a2.tolist(), a3.tolist()
    for i in range(n):
        v3 = xs[i] - ic2
        v1 = a1l[i] * ic1 + a2l[i] * v3
        v2 = ic2 + a2l[i] * ic1 + a3l[i] * v3
        ic1 = 2.0 * v1 - ic1
        ic2 = 2.0 * v2 - ic2
        if mode == "bp":
            out[i] = v1
        elif mode == "lp":
            out[i] = v2
        else:
            out[i] = xs[i] - k * v1 - v2
    return out


def env_ad(n, attack, decay, curve_hold=0.0):
    """Linear attack then exponential decay (decay = time constant in s)."""
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    d = np.exp(-np.maximum(t - attack - curve_hold, 0) / decay)
    return a * d


def env_note(n, dur, attack=0.005, dtau=0.15, sus=0.6, rel=0.05):
    """Gate-style envelope: attack, decay to sustain, release after `dur`."""
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    ds = sus + (1 - sus) * np.exp(-np.maximum(t - attack, 0) / dtau)
    r = np.where(t < dur, 1.0, np.exp(-(t - dur) / max(rel, 1e-4)))
    return a * ds * r


def fades(x, fin=0.002, fout=0.012):
    x = x.copy()
    a, b = ns(fin), ns(fout)
    if a > 0:
        x[:a] *= np.linspace(0, 1, a) ** 2
    if b > 0:
        x[-b:] *= np.linspace(1, 0, b) ** 2
    return x


def place(buf, sig, start_sec, gain=1.0):
    i = ns(start_sec)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += gain * sig[: j - i]


def mix_len(sec):
    return np.zeros(ns(sec))


def db(x):
    return 20 * np.log10(max(x, 1e-12))


def normalize(x, peak_db=-1.0):
    p = np.max(np.abs(x))
    if p <= 0:
        return x
    return x * (10 ** (peak_db / 20) / p)


def finish_sfx(x, fin=0.002, fout=0.015, peak_db=-1.0):
    x = fft_filter(x, lo=35, order=2)  # remove DC / sub rumble
    x = fades(x, fin, fout)
    return normalize(x, peak_db)


# ---------------------------------------------------------------------------
# Shared instruments (used by both sfx jingles and music)
# ---------------------------------------------------------------------------

_cache = {}


def cached(key, fn):
    if key not in _cache:
        _cache[key] = fn()
    return _cache[key]


def inst_lead(f, dur, duty=0.25, bright=3000.0, vib=0.006, shape="pulse"):
    def make():
        rel = 0.07
        n = ns(dur + rel * 4)
        t = np.arange(n) / SR
        vdepth = vib * np.clip((t - 0.18) / 0.2, 0, 1)
        fv = f * (1 + vdepth * np.sin(TWO_PI * 5.5 * t))
        x = osc(fv, shape=shape, duty=duty, bright=bright)
        return x * env_note(n, dur, 0.006, 0.14, 0.55, rel)
    return cached(("lead", round(f, 3), round(dur, 4), duty, bright, vib, shape), make)


def inst_pluck(f, dur, shape="tri", duty=0.5, bright=2500.0, tau=0.2):
    def make():
        n = ns(min(dur, 4 * tau) + 0.08)
        x = osc(f, n, shape=shape, duty=duty, bright=bright)
        x += 0.35 * osc(f, n, shape="pulse", duty=0.5, bright=bright * 0.7)
        return x * env_note(n, dur, 0.003, tau, 0.0, 0.03)
    return cached(("pluck", round(f, 3), round(dur, 4), shape, duty, bright, tau), make)


def inst_bell(f, dur=None, tau=0.9, bright_ratio=1.0):
    """Music-box / glockenspiel-ish chime."""
    def make():
        length = min(max(tau * 3.0, 0.3), 2.5)
        n = ns(length)
        t = np.arange(n) / SR
        x = np.sin(TWO_PI * f * t) * np.exp(-t / tau)
        x += 0.28 * bright_ratio * np.sin(TWO_PI * f * 2.0 * t) * np.exp(-t / (tau * 0.45))
        x += 0.12 * bright_ratio * np.sin(TWO_PI * f * 4.01 * t) * np.exp(-t / (tau * 0.18))
        a = np.clip(t / 0.002, 0, 1)
        return x * a
    return cached(("bell", round(f, 3), tau, bright_ratio), make)


def inst_pad(f, dur, bright=1600.0, attack=0.25, rel=0.5):
    def make():
        n = ns(dur + rel * 3)
        x = np.zeros(n)
        for cents in (-6, 0, 6):
            fc = f * 2 ** (cents / 1200)
            x += osc(fc, n, shape="tri", bright=bright, phase0=(cents + 7) / 23.0)
        x += 0.25 * osc(f, n, shape="pulse", duty=0.35, bright=bright * 0.6)
        x /= 3.2
        return x * env_note(n, dur, attack, 0.6, 0.85, rel)
    return cached(("pad", round(f, 3), round(dur, 4), bright, attack, rel), make)


def inst_bass(f, dur, bright=900.0, tau=0.35, sus=0.5):
    def make():
        n = ns(dur + 0.12)
        x = osc(f, n, shape="tri", bright=2000)
        # a little pulse body so phone speakers can hear the bass line
        x += 0.45 * osc(f, n, shape="pulse", duty=0.5, bright=bright)
        return x * env_note(n, dur, 0.004, tau, sus, 0.03)
    return cached(("bass", round(f, 3), round(dur, 4), bright, tau, sus), make)


def inst_brass(f, dur):
    """Soft 'toy trumpet': pulse through a swelling low-pass."""
    def make():
        n = ns(dur + 0.15)
        t = np.arange(n) / SR
        fv = f * (1 + 0.007 * np.clip((t - 0.15) / 0.2, 0, 1) * np.sin(TWO_PI * 5.2 * t))
        x = osc(fv, shape="pulse", duty=0.4, bright=2600)
        cut = 900 + 2200 * (1 - np.exp(-t / 0.05)) * (0.7 + 0.3 * np.exp(-t / 0.3))
        x = svf(x, cut, 0.9, "lp")
        return x * env_note(n, dur, 0.012, 0.25, 0.7, 0.06)
    return cached(("brass", round(f, 3), round(dur, 4)), make)


# --- drums -----------------------------------------------------------------

def drum_kick():
    def make():
        n = ns(0.32)
        t = np.arange(n) / SR
        f = 48 + 110 * np.exp(-t / 0.035)
        x = np.sin(TWO_PI * np.cumsum(f) / SR) * np.exp(-t / 0.11)
        # body harmonic so small speakers get a "thud"
        x += 0.25 * np.sin(2 * TWO_PI * np.cumsum(f) / SR) * np.exp(-t / 0.05)
        click = fft_filter(noise(n, 11), lo=800, hi=3000) * np.exp(-t / 0.004) * 0.25
        return fades(x + click, 0.0005, 0.02)
    return cached("kick", make)


def drum_snare():
    def make():
        n = ns(0.25)
        t = np.arange(n) / SR
        nz = fft_filter(noise(n, 12), lo=900, hi=6000) * np.exp(-t / 0.07)
        tone = np.sin(TWO_PI * 190 * t) * np.exp(-t / 0.04) * 0.6
        return fades(0.55 * nz / np.max(np.abs(nz)) + tone, 0.0005, 0.02)
    return cached("snare", make)


def drum_clap():
    def make():
        n = ns(0.22)
        t = np.arange(n) / SR
        nz = fft_filter(noise(n, 13), lo=900, hi=4500)
        e = np.zeros(n)
        for k, off in enumerate((0.0, 0.009, 0.018)):
            e += (0.6 if k < 2 else 1.0) * np.exp(-np.maximum(t - off, 0) / (0.012 if k < 2 else 0.06)) * (t >= off)
        x = nz * e
        return fades(x / np.max(np.abs(x)), 0.0005, 0.02)
    return cached("clap", make)


def drum_hat(open_=False):
    def make():
        n = ns(0.25 if open_ else 0.08)
        t = np.arange(n) / SR
        nz = fft_filter(noise(n, 14 + open_), lo=5500, hi=10000)
        x = nz * np.exp(-t / (0.08 if open_ else 0.018))
        return fades(x / np.max(np.abs(x)), 0.0005, 0.01)
    return cached(("hat", open_), make)


def drum_shaker():
    def make():
        n = ns(0.09)
        t = np.arange(n) / SR
        nz = fft_filter(noise(n, 16), lo=3500, hi=8000)
        e = np.clip(t / 0.012, 0, 1) * np.exp(-np.maximum(t - 0.012, 0) / 0.025)
        x = nz * e
        return fades(x / np.max(np.abs(x)), 0.0005, 0.01)
    return cached("shaker", make)


def drum_crash():
    def make():
        n = ns(1.6)
        t = np.arange(n) / SR
        nz = fft_filter(noise(n, 17), lo=3000, hi=9000)
        x = nz * np.exp(-t / 0.5)
        return fades(x / np.max(np.abs(x)), 0.001, 0.05)
    return cached("crash", make)


def drum_tom(f0):
    def make():
        n = ns(0.3)
        t = np.arange(n) / SR
        f = f0 * (1 + 0.5 * np.exp(-t / 0.03))
        x = np.sin(TWO_PI * np.cumsum(f) / SR) * np.exp(-t / 0.1)
        x += 0.15 * fft_filter(noise(n, 18), lo=500, hi=3000) * np.exp(-t / 0.01)
        return fades(x, 0.0005, 0.02)
    return cached(("tom", f0), make)


# ---------------------------------------------------------------------------
# Sound effects
# ---------------------------------------------------------------------------

def sfx_jump():
    d = 0.26
    n = ns(d)
    t = np.arange(n) / SR
    f = 230 * 2 ** (1.35 * (1 - np.exp(-t / 0.06)))
    f *= 1 + 0.035 * np.sin(TWO_PI * 16 * t) * np.clip(t / 0.08, 0, 1)
    x = osc(f, shape="pulse", duty=0.35, bright=2600)
    x += 0.5 * osc(f * 0.5, shape="tri", bright=3000)
    return finish_sfx(x * env_ad(n, 0.004, 0.09, 0.03))


def sfx_double_jump():
    d = 0.42
    n = ns(d)
    t = np.arange(n) / SR
    f = 420 * 2 ** (1.4 * (1 - np.exp(-t / 0.05)))
    f *= 1 + 0.03 * np.sin(TWO_PI * 20 * t)
    x = osc(f, shape="pulse", duty=0.3, bright=3200) * env_ad(n, 0.003, 0.08, 0.02)
    x += 0.4 * osc(f * 0.5, shape="tri", bright=3000) * env_ad(n, 0.003, 0.08, 0.02)
    sparkle = np.zeros(n)
    for i, nm in enumerate(("E6", "G6", "C7", "E7")):
        place(sparkle, inst_bell(hz(nm), tau=0.09, bright_ratio=0.6), 0.05 + 0.045 * i, 0.35 - 0.04 * i)
    return finish_sfx(x + sparkle)


def sfx_land():
    d = 0.2
    n = ns(d)
    t = np.arange(n) / SR
    f = 55 + 95 * np.exp(-t / 0.025)
    body = np.sin(TWO_PI * np.cumsum(f) / SR) * np.exp(-t / 0.05)
    body += 0.35 * np.sin(2 * TWO_PI * np.cumsum(f) / SR) * np.exp(-t / 0.03)
    puff = fft_filter(noise(n, 21), lo=150, hi=900) * env_ad(n, 0.002, 0.03)
    return finish_sfx(body + 0.35 * puff / np.max(np.abs(puff)), fin=0.0008)


def sfx_slide():
    d = 0.32
    n = ns(d)
    t = np.arange(n) / SR
    nz = noise(n, 22)
    cut = 2600 * np.exp(-t / 0.25) + 700
    x = svf(nz, cut, 1.4, "bp")
    e = np.clip(t / 0.03, 0, 1) * np.exp(-np.maximum(t - 0.12, 0) / 0.07)
    x = fft_filter(x * e, hi=6000)
    return finish_sfx(x, fin=0.004, fout=0.03)


def _woof(dur, f_start, f_peak, f_end, formant_scale, seed, growl=0.25):
    n = ns(dur)
    t = np.arange(n) / SR
    # pitch: quick rise into the "WOO", then a fast drop on "-oof"
    f = f_end + (f_peak - f_end) * np.exp(-np.maximum(t - 0.025, 0) / (dur * 0.28))
    rise = np.clip(t / 0.025, 0, 1)
    f = f_start + (f - f_start) * rise
    src = osc(f, shape="pulse", duty=0.32, bright=4500, maxf=11000)
    src *= 1 + growl * np.sin(TWO_PI * 38 * t)  # a little throaty roughness
    breath = noise(n, seed + 1)
    src = src + 0.55 * breath
    # vowel formants: "w" (low, closed) -> "aw" (open) -> "oo" (closing)
    shape = np.interp(t / dur, [0, 0.12, 0.45, 1.0], [0.0, 1.0, 0.85, 0.15])
    f1 = (330 + 420 * shape) * formant_scale
    f2 = (800 + 500 * shape) * formant_scale
    f3 = 2400 * formant_scale
    y = 1.0 * svf(src, f1, 4.0) + 0.6 * svf(src, f2, 5.0) + 0.15 * svf(src, f3, 6.0)
    amp = np.clip(t / 0.012, 0, 1) * np.exp(-np.maximum(t - 0.05, 0) / (dur * 0.3))
    y = y * amp
    # soft "f" puff at the end
    puff = fft_filter(noise(n, seed + 2), lo=1500, hi=5000)
    pe = np.exp(-((t - dur * 0.55) / (dur * 0.12)) ** 2)
    y += 0.08 * puff * pe * np.max(np.abs(y)) / max(np.max(np.abs(puff)), 1e-9)
    return y


def sfx_bark():
    x = _woof(0.26, 380, 560, 250, 1.0, 31)
    return finish_sfx(x, fin=0.002, fout=0.03)


def sfx_bark_big():
    n = ns(0.78)
    out = np.zeros(n)
    w1 = _woof(0.32, 220, 330, 140, 0.78, 41, growl=0.35)
    w2 = _woof(0.36, 200, 300, 120, 0.74, 51, growl=0.35)
    place(out, w1 / np.max(np.abs(w1)), 0.0, 0.9)
    place(out, w2 / np.max(np.abs(w2)), 0.34, 1.0)
    # chest thump under each woof
    for st in (0.0, 0.34):
        tt = tvec(0.18)
        thump = np.sin(TWO_PI * np.cumsum(70 + 60 * np.exp(-tt / 0.03)) / SR) * np.exp(-tt / 0.06)
        place(out, thump, st + 0.01, 0.35)
    return finish_sfx(out, fout=0.04)


def sfx_bone():
    n = ns(0.42)
    out = np.zeros(n)
    a = osc(hz("B5"), ns(0.07), shape="pulse", duty=0.5, bright=4200)
    a *= env_note(len(a), 0.06, 0.002, 0.2, 0.8, 0.008)
    b_n = ns(0.36)
    b = osc(hz("E6"), b_n, shape="pulse", duty=0.5, bright=4200)
    b += 0.6 * osc(hz("E6"), b_n, shape="tri", bright=6000)
    b *= env_ad(b_n, 0.002, 0.11)
    place(out, a, 0.0, 0.7)
    place(out, b, 0.065, 0.75)
    return finish_sfx(out, fout=0.03)


def sfx_bone_gold():
    n = ns(1.0)
    out = np.zeros(n)
    notes = ["C6", "E6", "G6", "C7"]
    for i, nm in enumerate(notes):
        f = hz(nm)
        k = ns(0.09)
        x = osc(f, k, shape="pulse", duty=0.5, bright=4200) * env_note(k, 0.07, 0.002, 0.2, 0.8, 0.01)
        place(out, x, 0.055 * i, 0.55)
    # sustained shimmering chord at the top
    k = ns(0.75)
    t = np.arange(k) / SR
    chord = np.zeros(k)
    for nm in ("C6", "E6", "G6"):
        f = hz(nm) * (1 + 0.004 * np.sin(TWO_PI * 6 * t))
        chord += osc(f, shape="tri", bright=6000) + 0.3 * osc(f, shape="pulse", duty=0.5, bright=3500)
    chord *= env_ad(k, 0.004, 0.22)
    place(out, chord, 0.22, 0.35)
    for i, nm in enumerate(("G7", "E7", "C8", "G7", "E7")):
        place(out, inst_bell(hz(nm) * 0.5, tau=0.07, bright_ratio=0.4), 0.28 + 0.07 * i, 0.12)
    return finish_sfx(out, fout=0.05)


def sfx_hurt():
    n = ns(0.55)
    out = np.zeros(n)
    k = ns(0.12)
    t = np.arange(k) / SR
    f = 160 + 260 * np.exp(-t / 0.02)
    bonk = np.sin(TWO_PI * np.cumsum(f) / SR) * np.exp(-t / 0.04)
    bonk += 0.4 * np.sin(TWO_PI * np.cumsum(f * 2.7) / SR) * np.exp(-t / 0.015)
    click = fft_filter(noise(k, 61), lo=900, hi=3000) * np.exp(-t / 0.006)
    place(out, bonk + 0.3 * click / np.max(np.abs(click)), 0.0, 1.0)
    # descending stepped blip
    k = ns(0.36)
    t = np.arange(k) / SR
    steps = np.floor(t / 0.06)
    f = 620 * 2 ** (-steps * 0.33) * (1 - 0.15 * (t % 0.06) / 0.06)
    blip = osc(f, shape="pulse", duty=0.4, bright=2600) * env_note(k, 0.3, 0.003, 0.4, 0.6, 0.03)
    place(out, blip, 0.12, 0.45)
    return finish_sfx(out, fout=0.03)


def sfx_squirrel_chitter():
    rng = np.random.default_rng(71)
    n = ns(0.5)
    out = np.zeros(n)
    tpos = 0.0
    while tpos < 0.42:
        d = rng.uniform(0.022, 0.034)
        k = ns(d)
        t = np.arange(k) / SR
        f0 = rng.uniform(1500, 2200)
        f = f0 * (1 + 0.25 * np.exp(-t / 0.008)) * (1 - 0.18 * t / d)
        x = osc(f, shape="pulse", duty=0.4, bright=2800, maxf=7000)
        x *= np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.5
        place(out, x, tpos, rng.uniform(0.55, 1.0))
        tpos += d + rng.uniform(0.008, 0.02)
        if rng.random() < 0.18:
            tpos += 0.04
    out = fft_filter(out, hi=6000)
    return finish_sfx(out)


def sfx_squirrel_stun():
    n = ns(1.05)
    t = np.arange(n) / SR
    # wobbly tones that step downward, with a continuous slide in between
    seq = [note("G5"), note("E5"), note("C5"), note("A4"), note("G4")]
    idx = np.minimum((t / 0.19).astype(int), len(seq) - 1)
    base = np.array([mtof(m) for m in seq])[idx]
    glide = 2 ** (-0.25 * (t % 0.19) / 0.19)
    f = base * glide * (1 + 0.045 * np.sin(TWO_PI * 9 * t))
    x = osc(f, shape="tri", bright=4000) + 0.35 * osc(f, shape="pulse", duty=0.5, bright=2200)
    gate = 0.65 + 0.35 * np.cos(TWO_PI * t / 0.19) ** 2
    x *= gate * env_note(n, 0.85, 0.004, 0.6, 0.7, 0.06)
    # little circling "stars"
    for i, nm in enumerate(("E7", "C7", "E7", "C7", "G6")):
        place(x, inst_bell(hz(nm) * 0.5, tau=0.05, bright_ratio=0.3), 0.08 + 0.18 * i, 0.15)
    return finish_sfx(x, fout=0.04)


def sfx_acorn_throw():
    n = ns(0.3)
    t = np.arange(n) / SR
    cut = 700 + 2300 * np.sin(np.pi * np.clip(t / 0.28, 0, 1)) ** 2
    x = svf(noise(n, 81), cut, 2.0, "bp")
    e = np.sin(np.pi * np.clip(t / 0.28, 0, 1)) ** 2
    return finish_sfx(fft_filter(x * e, hi=6000), fin=0.004, fout=0.02)


def sfx_acorn_hit():
    n = ns(0.16)
    t = np.arange(n) / SR
    x = np.sin(TWO_PI * 880 * t) * np.exp(-t / 0.028)
    x += 0.5 * np.sin(TWO_PI * 1620 * t) * np.exp(-t / 0.016)
    x += 0.25 * np.sin(TWO_PI * 2470 * t) * np.exp(-t / 0.01)
    click = fft_filter(noise(n, 91), lo=1200, hi=5000) * np.exp(-t / 0.003)
    x += 0.4 * click / np.max(np.abs(click))
    return finish_sfx(x, fin=0.0005, fout=0.02)


def sfx_cat_hiss():
    n = ns(0.75)
    t = np.arange(n) / SR
    nz = fft_filter(noise(n, 101), lo=2200, hi=7000, order=2)
    nz = svf(nz, 4200 + 600 * np.sin(TWO_PI * 1.3 * t), 1.2, "bp") + 0.4 * nz
    e = np.clip(t / 0.06, 0, 1) * (1 - 0.15 * np.sin(TWO_PI * 11 * t) ** 2)
    e *= np.where(t < 0.5, 1.0, np.exp(-(t - 0.5) / 0.07))
    return finish_sfx(nz * e, fin=0.01, fout=0.04)


def sfx_vacuum():
    """Exactly 1.000 s; every component completes whole cycles so it loops seamlessly."""
    n = SR  # 1.0 s
    t = np.arange(n) / SR
    motor = osc(110.0, n, shape="saw", bright=1400, maxf=6000)
    motor += 0.5 * osc(220.0, n, shape="square", bright=1800, maxf=6000)
    am = 1 + 0.22 * np.sin(TWO_PI * 18 * t)  # 18 Hz whirr, 18 whole cycles
    whirr = fft_filter(noise(n, 111), lo=900, hi=2200, order=2, circular=True)
    whirr /= np.max(np.abs(whirr))
    whine = np.sin(TWO_PI * 1320 * t + 0.6 * np.sin(TWO_PI * 6 * t)) * 0.12
    x = 0.55 * motor * am + 0.35 * whirr * (1 + 0.3 * np.sin(TWO_PI * 9 * t)) + whine
    x = fft_filter(x, lo=60, hi=5000, circular=True)
    return normalize(x, -1.5)  # no fades: designed to loop


def metal_clank(n, seed, partials, decays):
    t = np.arange(n) / SR
    x = np.zeros(n)
    rng = np.random.default_rng(seed)
    for p, d in zip(partials, decays):
        x += rng.uniform(0.5, 1.0) * np.sin(TWO_PI * p * t + rng.uniform(0, 6.28)) * np.exp(-t / d)
    strike = fft_filter(noise(n, seed + 1), lo=1500, hi=6000) * np.exp(-t / 0.005)
    return x + 0.6 * strike / np.max(np.abs(strike))


def sfx_cage_open():
    n = ns(1.15)
    out = np.zeros(n)
    c1 = metal_clank(ns(0.4), 121, [410, 1083, 1730, 2410, 3120], [0.12, 0.08, 0.06, 0.04, 0.03])
    c2 = metal_clank(ns(0.3), 123, [520, 1290, 2050, 2890], [0.08, 0.06, 0.04, 0.03])
    place(out, c1, 0.0, 0.8)
    place(out, c2, 0.085, 0.5)
    for i, nm in enumerate(("C6", "E6", "G6", "C7", "E7")):
        place(out, inst_bell(hz(nm), tau=0.18, bright_ratio=0.5), 0.3 + 0.06 * i, 0.3)
    return finish_sfx(out, fout=0.05)


def render_notes(notes, total, inst, gain=1.0):
    """notes: list of (start_sec, dur_sec, midi)."""
    out = np.zeros(ns(total))
    for st, d, m in notes:
        if m is None:
            continue
        place(out, inst(mtof(m), d), st, gain)
    return out


def sfx_rescue():
    total = 2.0
    b = 60 / 168  # beat at 168 bpm
    mel = [("C5", 0.5), ("E5", 0.5), ("G5", 0.5), ("C6", 1.0), ("A5", 0.5), ("C6", 0.5), ("D6", 0.5), ("E6", 2.0)]
    notes, pos = [], 0.0
    for nm, d in mel:
        notes.append((pos * b, d * b * 0.9, note(nm)))
        pos += d
    lead = render_notes(notes, total, lambda f, d: inst_lead(f, d, duty=0.5, bright=3200), 0.5)
    bass_n = [(0, 1.4 * b, note("C3")), (1.5 * b, 1.4 * b, note("F3")), (3.0 * b, 1.0 * b, note("G3")),
              (4.0 * b, 2.0 * b, note("C3"))]
    bass = render_notes(bass_n, total, lambda f, d: inst_bass(f, d), 0.35)
    harm = np.zeros(ns(total))
    for m in (note("E5"), note("G5"), note("C5")):
        place(harm, inst_pluck(mtof(m), 2.0 * b, tau=0.4, bright=3000), 4.0 * b, 0.13)
    spark = np.zeros(ns(total))
    for i, nm in enumerate(("G6", "C7", "E7", "G7")):
        place(spark, inst_bell(hz(nm) * 0.5, tau=0.25, bright_ratio=0.5), 4.0 * b + 0.06 * i, 0.12)
    x = lead + bass + harm + spark
    return finish_sfx(x, fout=0.25)


def sfx_checkpoint():
    n = ns(1.45)
    out = np.zeros(n)
    k = ns(0.72)
    t = np.arange(k) / SR
    # balloon inflating: breathy rising squeak with rubbery flutter
    f = 180 * 2 ** (1.7 * (t / 0.72) ** 0.8)
    f *= 1 + 0.02 * np.sin(TWO_PI * 23 * t)
    tone = osc(f, shape="tri", bright=2500) + 0.25 * osc(f, shape="pulse", duty=0.5, bright=1600)
    breath = svf(noise(k, 131), f * 3.0, 3.0, "bp")
    breath /= np.max(np.abs(breath))
    puffs = 0.7 + 0.3 * np.sin(TWO_PI * 5 * t) ** 2
    e = np.clip(t / 0.08, 0, 1) * np.where(t < 0.66, 1.0, np.exp(-(t - 0.66) / 0.015))
    place(out, (0.35 * tone + 0.35 * breath) * puffs * e, 0.0, 1.0)
    # ding!
    place(out, inst_bell(hz("E6"), tau=0.35), 0.72, 0.6)
    place(out, inst_bell(hz("B6"), tau=0.35), 0.80, 0.45)
    return finish_sfx(out, fout=0.06)


def sfx_boss_hit():
    n = ns(0.62)
    out = np.zeros(n)
    k = ns(0.45)
    t = np.arange(k) / SR
    f = 42 + 90 * np.exp(-t / 0.04)
    boom = np.sin(TWO_PI * np.cumsum(f) / SR) * np.exp(-t / 0.14)
    boom += 0.4 * np.sin(2 * TWO_PI * np.cumsum(f) / SR) * np.exp(-t / 0.07)
    crunch = fft_filter(noise(k, 141), lo=200, hi=1800) * np.exp(-t / 0.05)
    place(out, boom + 0.5 * crunch / np.max(np.abs(crunch)), 0.0, 1.0)
    k = ns(0.16)
    t = np.arange(k) / SR
    f = 1150 * (1 + 0.45 * np.sin(np.pi * t / 0.16)) * (1 + 0.03 * np.sin(TWO_PI * 30 * t))
    squeak = osc(f, shape="tri", bright=4000) * np.sin(np.pi * t / 0.16) ** 1.2
    place(out, squeak, 0.1, 0.45)
    return finish_sfx(out, fin=0.0008, fout=0.04)


def sfx_boss_laugh():
    n = ns(0.9)
    out = np.zeros(n)
    pitches = [820, 780, 730, 660]
    for i, p in enumerate(pitches):
        d = 0.12 if i < 3 else 0.2
        k = ns(d)
        t = np.arange(k) / SR
        f = p * (1 + 0.18 * np.exp(-t / 0.02)) * (1 - 0.12 * t / d)
        src = osc(f, shape="pulse", duty=0.3, bright=5000, maxf=10000) + 0.25 * noise(k, 151 + i)
        # "eh" vowel formants
        y = svf(src, 650, 4.0) + 0.7 * svf(src, 1900, 5.0) + 0.2 * svf(src, 2700, 6.0)
        # "h" breath at the onset
        h = fft_filter(noise(k, 161 + i), lo=1200, hi=5000) * np.exp(-t / 0.015) * 0.6
        y = y / np.max(np.abs(y)) + h
        y *= np.clip(t / 0.006, 0, 1) * np.exp(-np.maximum(t - 0.02, 0) / (d * 0.45))
        place(out, y, 0.16 * i, 1.0 - 0.08 * i)
    return finish_sfx(fft_filter(out, hi=6000), fout=0.04)


def sfx_victory():
    total = 4.0
    bpm = 150
    b = 60 / bpm
    third = 1 / 3
    mel = [("G4", third), ("C5", third), ("E5", third), ("G5", 1), ("E5", 0.5), ("G5", 0.5),
           ("A5", 0.5), ("F5", 0.5), ("A5", 0.5), ("C6", 0.5), ("B5", 0.5), ("D6", 0.5), ("C6", 3.0)]
    notes, pos = [], 0.0
    for nm, d in mel:
        notes.append((pos * b, d * b * (0.85 if d < 3 else 0.97), note(nm)))
        pos += d
    lead = render_notes(notes, total, inst_brass, 0.5)
    lead += render_notes([(s, d, m - 12) for s, d, m in notes], total,
                         lambda f, d: inst_lead(f, d, duty=0.5, bright=2200), 0.16)
    chords = [(0, 3, ["C4", "E4", "G4"]), (3, 2, ["F4", "A4", "C5"]), (5, 1, ["G4", "B4", "D5"]),
              (6, 3, ["E4", "G4", "C5"])]
    pads = np.zeros(ns(total))
    for st, d, nms in chords:
        for nm in nms:
            place(pads, inst_pad(hz(nm), d * b * 0.95, attack=0.03, rel=0.25), st * b, 0.13)
    bass_line = [(0, 3, "C3"), (3, 2, "F2"), (5, 1, "G2"), (6, 3, "C3")]
    bass = render_notes([(s * b, d * b * 0.9, note(nm)) for s, d, nm in bass_line], total,
                        lambda f, d: inst_bass(f, d, tau=0.6, sus=0.7), 0.4)
    drums = np.zeros(ns(total))
    place(drums, drum_kick(), 0, 0.6)
    place(drums, drum_kick(), 3 * b, 0.5)
    place(drums, drum_kick(), 6 * b, 0.6)
    for i in range(8):  # snare roll into the final chord
        place(drums, drum_snare(), (5 + i / 8) * b, 0.12 + 0.03 * i)
    place(drums, drum_crash(), 6 * b, 0.22)
    spark = np.zeros(ns(total))
    for i, nm in enumerate(("C7", "E7", "G7", "C8", "G7", "E7", "C8")):
        place(spark, inst_bell(hz(nm) * 0.5, tau=0.2, bright_ratio=0.4), 6 * b + 0.08 * i, 0.1)
    x = lead + pads + bass + drums + spark
    x = x + 0.18 * simple_reverb_mono(x, 141)
    return finish_sfx(x[: ns(total)], fout=0.4)


def sfx_game_over():
    total = 2.5
    out = np.zeros(ns(total))
    seq = [("G4", 0.36), ("F#4", 0.36), ("F4", 0.36), ("E4", 1.2)]
    pos = 0.0
    for i, (nm, d) in enumerate(seq):
        k = ns(d + 0.1)
        t = np.arange(k) / SR
        f0 = hz(nm)
        bend = 1 - 0.02 * np.clip(t / d, 0, 1)
        vib = 1 + (0.03 * np.clip((t - 0.25) / 0.2, 0, 1) * np.sin(TWO_PI * 6.5 * t) if i == 3 else 0)
        f = f0 * bend * vib
        src = osc(f, shape="pulse", duty=0.45, bright=3000)
        # "wah" mute: filter opens then closes on each note
        wah = 450 + 1300 * np.sin(np.pi * np.clip(t / (d * 0.9), 0, 1)) ** 0.7
        if i == 3:
            wah = 450 + 1100 * (0.6 + 0.4 * np.sin(TWO_PI * 3.2 * t)) * np.clip(t / 0.08, 0, 1) * np.exp(-t / 1.4)
        y = svf(src, wah, 2.2, "lp")
        y *= env_note(k, d * 0.92, 0.015, 0.4, 0.8, 0.04)
        place(out, y, pos, 1.0)
        pos += d
    # small cute "boop" at the very end
    place(out, inst_bell(hz("C5"), tau=0.12, bright_ratio=0.3), 2.2, 0.2)
    return finish_sfx(out, fout=0.08)


def sfx_button():
    n = ns(0.09)
    t = np.arange(n) / SR
    x = np.sin(TWO_PI * 880 * t) * np.exp(-t / 0.018)
    x += 0.4 * osc(1320, n, shape="tri", bright=5000) * np.exp(-t / 0.01)
    click = fft_filter(noise(n, 171), lo=2000, hi=6000) * np.exp(-t / 0.0015)
    x += 0.25 * click / np.max(np.abs(click))
    return finish_sfx(x, fin=0.0005, fout=0.02)


def sfx_blip():
    n = ns(0.04)
    t = np.arange(n) / SR
    x = osc(1050, n, shape="pulse", duty=0.5, bright=3500) * np.exp(-t / 0.012)
    return finish_sfx(x, fin=0.0008, fout=0.008)


def sfx_whoosh():
    n = ns(0.7)
    t = np.arange(n) / SR
    u = np.clip(t / 0.66, 0, 1)
    cut = 300 + 2800 * np.sin(np.pi * u ** 0.8) ** 2
    x = svf(noise(n, 181), cut, 1.6, "bp") + 0.3 * svf(noise(n, 182), cut * 1.5, 2.5, "bp")
    e = np.sin(np.pi * u ** 0.7) ** 2
    return finish_sfx(fft_filter(x * e, hi=7000), fin=0.005, fout=0.04)


SFX = {
    "jump": sfx_jump, "double_jump": sfx_double_jump, "land": sfx_land, "slide": sfx_slide,
    "bark": sfx_bark, "bark_big": sfx_bark_big, "bone": sfx_bone, "bone_gold": sfx_bone_gold,
    "hurt": sfx_hurt, "squirrel_chitter": sfx_squirrel_chitter, "squirrel_stun": sfx_squirrel_stun,
    "acorn_throw": sfx_acorn_throw, "acorn_hit": sfx_acorn_hit, "cat_hiss": sfx_cat_hiss,
    "vacuum": sfx_vacuum, "cage_open": sfx_cage_open, "rescue": sfx_rescue,
    "checkpoint": sfx_checkpoint, "boss_hit": sfx_boss_hit, "boss_laugh": sfx_boss_laugh,
    "victory": sfx_victory, "game_over": sfx_game_over, "button": sfx_button, "blip": sfx_blip,
    "whoosh": sfx_whoosh,
}
SFX_LOOP = {"vacuum"}


# ---------------------------------------------------------------------------
# Reverb
# ---------------------------------------------------------------------------

def make_ir(seed, rt=1.3, length=1.8, predelay=0.012, hi=5000):
    n = ns(length)
    t = np.arange(n) / SR
    ir = noise(n, seed) * np.exp(-t * 6.9 / rt)
    ir = fft_filter(ir, lo=150, hi=hi)
    ir = np.concatenate([np.zeros(ns(predelay)), ir])
    return ir / np.sqrt(np.sum(ir ** 2))


def fft_convolve(x, h):
    N = 1
    while N < len(x) + len(h):
        N *= 2
    y = np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(h, N), N)
    return y[: len(x) + len(h) - 1]


def simple_reverb_mono(x, seed):
    y = fft_convolve(x, make_ir(seed, rt=1.0, length=1.2))
    return y[: len(x)]


# ---------------------------------------------------------------------------
# Music: notation helpers and a tiny sequencer
# ---------------------------------------------------------------------------

def parse_melody(text, beats_per_bar=4):
    """'E5:1 G5:0.5 r:0.5 | ...' -> list of (start_beat, dur_beats, midi or None).

    '|' separates bars and every bar is checked to add up to `beats_per_bar`.
    """
    out = []
    pos = 0.0
    for bi, bar in enumerate(text.split("|")):
        bar_start = pos
        for tok in bar.split():
            nm, d = tok.split(":")
            d = float(d)
            out.append((pos, d, None if nm == "r" else note(nm)))
            pos += d
        if abs((pos - bar_start) - beats_per_bar) > 1e-6:
            raise ValueError(f"bar {bi + 1} has {pos - bar_start} beats: {bar.strip()}")
    return out


CHORD_Q = {"": [0, 4, 7], "m": [0, 3, 7], "7": [0, 4, 7, 10], "m7": [0, 3, 7, 10],
           "maj7": [0, 4, 7, 11], "dim": [0, 3, 6], "sus4": [0, 5, 7]}


def parse_chord(sym):
    """'Am', 'C/E', 'Bb', 'E7' -> (root_pc, bass_pc, [intervals])."""
    bass = None
    if "/" in sym:
        sym, bass = sym.split("/")

    def pitch_class(txt):
        pc, i = NOTE_PC[txt[0]], 1
        while i < len(txt) and txt[i] in "#b":
            pc += 1 if txt[i] == "#" else -1
            i += 1
        return pc % 12, txt[i:]

    root, q = pitch_class(sym)
    bpc = pitch_class(bass)[0] if bass else root
    return root, bpc, CHORD_Q[q]


def voice(pcs, lo):
    """Place pitch classes in the octave window [lo, lo+12)."""
    return sorted(lo + ((pc - lo) % 12) for pc in pcs)


def chord_tones(sym, lo=55):
    root, _, iv = parse_chord(sym)
    return voice([(root + x) % 12 for x in iv], lo)


def chord_bass(sym, lo=40):
    _, bpc, _ = parse_chord(sym)
    return lo + ((bpc - lo) % 12)


def chord_root(sym, lo=40):
    root, _, _ = parse_chord(sym)
    return lo + ((root - lo) % 12)


def pan_gains(p):
    a = (p + 1) * np.pi / 4
    return np.cos(a), np.sin(a)


class Song:
    def __init__(self, bpm, bars, beats_per_bar=4, tail_sec=None):
        self.bpm = bpm
        self.bars = bars
        self.beat = 60.0 / bpm
        self.length_sec = bars * beats_per_bar * self.beat
        self.L = ns(self.length_sec)
        tail = tail_sec if tail_sec is not None else 2 * beats_per_bar * self.beat + 2.5
        self.N = self.L + ns(tail)
        self.buses = {}
        self.rng = np.random.default_rng(bpm * 1000 + bars)

    def bus(self, name):
        if name not in self.buses:
            self.buses[name] = np.zeros((2, self.N))
        return self.buses[name]

    def add(self, bus, sig, beat_pos, gain=1.0, pan=0.0, humanize=True):
        b = self.bus(bus)
        if humanize:
            gain *= 1 + self.rng.uniform(-0.06, 0.06)
        i = ns(beat_pos * self.beat)
        if i >= self.L:  # never schedule notes beyond the loop; the tail only holds ring-outs
            return
        j = min(self.N, i + len(sig))
        gl, gr = pan_gains(pan)
        b[0, i:j] += gain * gl * sig[: j - i]
        b[1, i:j] += gain * gr * sig[: j - i]

    def echo(self, bus, beats, fb=0.3, taps=3, cross=True):
        b = self.bus(bus)
        d = ns(beats * self.beat)
        out = b.copy()
        for k in range(1, taps + 1):
            g = fb ** k
            src = b[::-1] if (cross and k % 2 == 1) else b  # ping-pong
            out[:, d * k:] += g * src[:, : self.N - d * k]
        self.buses[bus] = out

    def render(self, levels, sends, rt=1.4, wet=0.22, seed=7):
        dry = np.zeros((2, self.N))
        send = np.zeros((2, self.N))
        for name, b in self.buses.items():
            dry += levels.get(name, 1.0) * b
            send += sends.get(name, 0.0) * levels.get(name, 1.0) * b
        irl, irr = make_ir(seed, rt=rt), make_ir(seed + 1, rt=rt)
        wl = fft_convolve(send[0], irl)[: self.N]
        wr = fft_convolve(send[1], irr)[: self.N]
        mix = dry + wet * np.vstack([wl, wr])
        # seamless loop: fold everything that rang past the loop end back over the start
        out = mix[:, : self.L].copy()
        tail = mix[:, self.L:]
        k = 0
        while k < tail.shape[1]:
            seg = tail[:, k: k + self.L]
            out[:, : seg.shape[1]] += seg
            k += self.L
        # remove DC with a circular (loop-safe) high-pass
        out = np.vstack([fft_filter(out[0], lo=30, circular=True), fft_filter(out[1], lo=30, circular=True)])
        return normalize(out, -1.0)


def add_melody(song, bus, melody, inst, gain, pan=0.0, gate=0.9, offset_beats=0, transpose=0):
    for st, d, m in melody:
        if m is None:
            continue
        sig = inst(mtof(m + transpose), d * song.beat * gate)
        song.add(bus, sig, st + offset_beats, gain, pan)


def add_drum_pattern(song, bar, pattern, bus="drums"):
    """pattern: list of (beat_in_bar, sample, gain, pan)."""
    for b, smp, g, p in pattern:
        song.add(bus, smp, bar * 4 + b, g, p)


# ---------------------------------------------------------------------------
# Track 1: Menu - cheerful, relaxed, C major, 100 bpm, 16 bars
# ---------------------------------------------------------------------------

MENU_CHORDS = "C G Am F  C F G C  Am F C G  F G C C".split()
MENU_MELODY = (
    "E5:1 G5:1 C6:1 G5:1 | B4:1 D5:1 G5:2 | A5:1 G5:0.5 E5:0.5 C5:1 E5:1 | F5:1.5 E5:0.5 D5:2 |"
    "E5:1 G5:1 C6:1 E6:1 | D6:1 C6:0.5 A5:0.5 F5:2 | G5:1 B5:0.5 D6:0.5 B5:1 G5:1 | C6:3 r:1 |"
    "C5:0.5 E5:0.5 A5:1 A5:0.5 G5:0.5 E5:1 | F5:0.5 A5:0.5 C6:1 A5:1 F5:1 | E5:0.5 G5:0.5 C6:1 E6:1 C6:1 | D6:1 B5:1 G5:2 |"
    "A5:1 C6:1 F6:1 E6:0.5 D6:0.5 | D6:1 B5:1 G5:1 D6:1 | C6:2 G5:1 E5:1 | C5:2 r:1 G4:1"
)


def music_menu():
    s = Song(100, 16)
    mel = parse_melody(MENU_MELODY)
    add_melody(s, "lead", mel, lambda f, d: inst_lead(f, d, duty=0.25, bright=2800), 0.30, 0.0, gate=0.88)
    s.echo("lead", 0.75, fb=0.22, taps=2)
    for bar, ch in enumerate(MENU_CHORDS):
        tones = chord_tones(ch, 55)
        # ukulele-ish offbeat strums
        for beat in (0.5, 1.5, 2.5, 3.5):
            for k, m in enumerate(tones):
                s.add("strum", inst_pluck(mtof(m), 0.28 * s.beat * 2, tau=0.09, bright=2300),
                      bar * 4 + beat + k * 0.012, 0.11, -0.3)
        # bouncy bass: root, root, fifth, octave
        r = chord_root(ch, 40)
        for beat, m, d in ((0, r, 1.2), (1.5, r, 0.4), (2, r + 7, 0.9), (3, r + 12, 0.9)):
            s.add("bass", inst_bass(mtof(m), d * s.beat * 0.85, tau=0.25, sus=0.35), bar * 4 + beat, 0.36, 0.0)
        # glockenspiel arpeggio in the second half
        if bar >= 8:
            up = chord_tones(ch, 72)
            seq = [up[0], up[1], up[2], up[1] + 12 if len(up) > 1 else up[0]]
            for i, m in enumerate(seq):
                s.add("glock", inst_bell(mtof(m), tau=0.35, bright_ratio=0.5), bar * 4 + i + 0.5, 0.07, 0.45)
        # light drums
        pat = [(0, drum_kick(), 0.45, 0), (2, drum_kick(), 0.4, 0),
               (1, drum_clap(), 0.16, 0.1), (3, drum_clap(), 0.16, 0.1)]
        if bar % 2 == 1:
            pat.append((2.5, drum_kick(), 0.28, 0))
        for i in range(8):
            pat.append((i * 0.5, drum_shaker(), 0.07 if i % 2 == 0 else 0.11, -0.2))
        add_drum_pattern(s, bar, pat)
    return s.render(levels={"lead": 1.0, "strum": 1.0, "bass": 1.0, "glock": 1.0, "drums": 1.0},
                    sends={"lead": 0.35, "strum": 0.3, "glock": 0.5, "drums": 0.1}, rt=1.3, wet=0.25), s


# ---------------------------------------------------------------------------
# Track 2: Story - gentle storybook underscore, F major, 88 bpm, 16 bars
# ---------------------------------------------------------------------------

STORY_CHORDS = "F C/E Dm Bb  F Bb C C  Dm Bb F C  Bb C F F".split()
STORY_MELODY = (
    "A5:1.5 G5:0.5 F5:1 C5:1 | E5:2 G5:2 | F5:1.5 E5:0.5 D5:1 A4:1 | D5:3 r:1 |"
    "C5:1 F5:1 A5:1 C6:1 | Bb5:1.5 A5:0.5 G5:1 F5:1 | G5:2 E5:1 C5:1 | G5:3 r:1 |"
    "A5:1.5 G5:0.5 F5:1 D5:1 | F5:1 D5:1 Bb4:2 | C5:1 F5:1 A5:1.5 G5:0.5 | G5:2 E5:1 G5:1 |"
    "F5:1.5 D5:0.5 Bb5:1 A5:1 | G5:1 E5:1 C6:1 Bb5:1 | A5:4 | r:2 C5:1 E5:1"
)


def music_story():
    s = Song(88, 16)
    mel = parse_melody(STORY_MELODY)
    for st, d, m in mel:
        if m is None:
            continue
        s.add("box", inst_bell(mtof(m), tau=0.7 + 0.15 * min(d, 2)), st, 0.30, 0.1)
        # a soft sustained double an octave down for long notes
        if d >= 1.5:
            s.add("flute", inst_lead(mtof(m - 12), d * s.beat * 0.95, duty=0.5, bright=1400, vib=0.008,
                                     shape="tri"), st, 0.10, 0.15)
    for bar, ch in enumerate(STORY_CHORDS):
        for m in chord_tones(ch, 53):
            s.add("pad", inst_pad(mtof(m), 4 * s.beat * 0.98, bright=1300, attack=0.35, rel=0.6), bar * 4, 0.075, 0.0)
        tones = chord_tones(ch, 60)
        arp = [tones[0], tones[1], tones[2], tones[0] + 12, tones[2], tones[1], tones[2], tones[0] + 12]
        for i, m in enumerate(arp):
            s.add("harp", inst_pluck(mtof(m), 0.5 * s.beat * 1.6, tau=0.3, bright=1800), bar * 4 + i * 0.5,
                  0.075 if i % 2 == 0 else 0.055, -0.35)
        b = chord_bass(ch, 41)
        s.add("bass", inst_bass(mtof(b), 3.6 * s.beat, bright=600, tau=0.9, sus=0.45), bar * 4, 0.28, 0.0)
        s.add("bass", inst_bass(mtof(b + 7 if b + 7 < 53 else b - 5), 0.9 * s.beat, bright=600, tau=0.4, sus=0.3),
              bar * 4 + 3, 0.16, 0.0)
    return s.render(levels={}, sends={"box": 0.55, "flute": 0.5, "pad": 0.5, "harp": 0.45, "bass": 0.15},
                    rt=1.8, wet=0.3), s


# ---------------------------------------------------------------------------
# Track 3: Living Room - upbeat level theme, G major, 132 bpm, 32 bars
# ---------------------------------------------------------------------------

LIVING_CHORDS = ("G D Em C  G D C D  G D Em C  G D C G  "
                 "C D Bm Em  C D G G  Am D G Em  C D G D").split()
LIVING_MELODY = (
    # A section
    "B4:0.5 D5:0.5 G5:1 F#5:0.5 G5:0.5 A5:1 | F#5:1.5 E5:0.5 D5:1 A4:1 |"
    "G5:0.5 F#5:0.5 E5:0.5 B4:0.5 E5:1 G5:1 | E5:1.5 D5:0.5 C5:1 r:1 |"
    "B4:0.5 D5:0.5 G5:1 B5:1 A5:0.5 G5:0.5 | A5:1.5 F#5:0.5 D5:1 F#5:1 |"
    "E5:0.5 G5:0.5 C6:1 B5:0.5 A5:0.5 G5:1 | A5:2 r:1 D5:1 |"
    "G5:0.5 G5:0.5 B5:1 A5:0.5 G5:0.5 D5:1 | F#5:0.5 A5:0.5 D6:1 C6:0.5 A5:0.5 F#5:1 |"
    "G5:1 E5:0.5 G5:0.5 B5:1 G5:1 | C6:1.5 B5:0.5 A5:1 G5:1 |"
    "B5:0.5 A5:0.5 G5:0.5 D5:0.5 G5:1 B5:1 | A5:1 F#5:0.5 A5:0.5 D6:2 |"
    "C6:0.5 B5:0.5 A5:0.5 G5:0.5 E5:1 A5:1 | G5:2 D5:0.5 E5:0.5 F#5:1 |"
    # B section
    "G5:1 E5:0.5 G5:0.5 C6:1 G5:1 | A5:1 F#5:0.5 A5:0.5 D6:1 A5:1 |"
    "B5:1.5 A5:0.5 F#5:1 D5:1 | E5:0.5 F#5:0.5 G5:0.5 A5:0.5 B5:2 |"
    "C6:1 B5:0.5 A5:0.5 G5:1 E5:1 | F#5:1 A5:0.5 F#5:0.5 D5:1 E5:0.5 F#5:0.5 |"
    "G5:1 B5:1 D6:1 B5:1 | G5:3 r:1 |"
    "A5:0.5 C6:0.5 E6:1 D6:0.5 C6:0.5 A5:1 | F#5:0.5 A5:0.5 D6:1 C6:0.5 A5:0.5 F#5:1 |"
    "G5:0.5 B5:0.5 D6:1 B5:0.5 G5:0.5 D5:1 | E5:0.5 G5:0.5 B5:1 A5:0.5 G5:0.5 E5:1 |"
    "C5:0.5 E5:0.5 G5:0.5 C6:0.5 B5:1 A5:1 | A5:1 B5:0.5 A5:0.5 F#5:1 D5:1 |"
    "G5:1.5 F#5:0.5 G5:1 B5:1 | A5:1 F#5:1 D5:1 r:1"
)


def music_living():
    s = Song(132, 32)
    mel = parse_melody(LIVING_MELODY)
    add_melody(s, "lead", mel, lambda f, d: inst_lead(f, d, duty=0.5, bright=2600, vib=0.005), 0.28, 0.0, gate=0.85)
    # B section: a triangle doubling an octave below for extra lift
    add_melody(s, "lead2", [n for n in mel if n[0] >= 64], lambda f, d: inst_lead(f, d, duty=0.5, bright=2000,
               shape="tri", vib=0.0), 0.16, 0.2, gate=0.85, transpose=-12)
    s.echo("lead", 0.75, fb=0.2, taps=2)
    for bar, ch in enumerate(LIVING_CHORDS):
        tones = chord_tones(ch, 57)
        for beat in (0.5, 1.5, 2.5, 3.5):
            for m in tones:
                s.add("stabs", inst_pluck(mtof(m), 0.3 * s.beat, shape="pulse", duty=0.25, bright=2000, tau=0.06),
                      bar * 4 + beat, 0.075, 0.3)
        if 8 <= bar < 16 or bar >= 24:
            up = chord_tones(ch, 74)
            seq = [up[0], up[1], up[2], up[0] + 12, up[2], up[1], up[2], up[0] + 12]
            for i, m in enumerate(seq):
                s.add("arp", inst_pluck(mtof(m), 0.45 * s.beat, shape="tri", bright=3000, tau=0.08),
                      bar * 4 + i * 0.5, 0.06, -0.45)
        r = chord_root(ch, 40)
        for i in range(8):
            m = r if i % 2 == 0 else r + 12
            if i == 7 and bar % 4 == 3:
                m = r + 7
            s.add("bass", inst_bass(mtof(m), 0.42 * s.beat, tau=0.15, sus=0.4), bar * 4 + i * 0.5,
                  0.34 if i % 2 == 0 else 0.26, 0.0)
        fill = bar % 8 == 7
        pat = [(0, drum_kick(), 0.5, 0), (1, drum_snare(), 0.24, 0.05)]
        if not fill:
            pat += [(2, drum_kick(), 0.45, 0), (2.5, drum_kick(), 0.3, 0), (3, drum_snare(), 0.24, 0.05)]
            for i in range(8):
                pat.append((i * 0.5, drum_hat(), 0.06 if i % 2 == 0 else 0.09, -0.25))
        else:
            pat += [(1.5, drum_kick(), 0.35, 0), (2, drum_kick(), 0.45, 0)]
            for i in range(4):
                pat.append((1.5 + i * 0.5, drum_hat(), 0.07, -0.25))
            for i, b in enumerate((3.0, 3.25, 3.5, 3.75)):
                pat.append((b, drum_snare(), 0.13 + 0.03 * i, 0.05))
        if bar in (0, 16):
            pat.append((0, drum_crash(), 0.12, 0.3))
        if bar % 2 == 1 and not fill:
            pat.append((3.5, drum_hat(True), 0.06, -0.25))
        add_drum_pattern(s, bar, pat)
    return s.render(levels={}, sends={"lead": 0.3, "lead2": 0.2, "stabs": 0.2, "arp": 0.4, "drums": 0.08},
                    rt=1.2, wet=0.22), s


# ---------------------------------------------------------------------------
# Track 4: Boss - driving playful villain, A minor, 150 bpm, 16 bars
# ---------------------------------------------------------------------------

BOSS_CHORDS = "Am Am F G  Am Am F E  Dm Am F E  Am F G E".split()
BOSS_MELODY = (
    "A4:0.5 r:0.5 A4:0.5 C5:0.5 E5:0.5 r:0.5 D#5:0.5 E5:0.5 | C5:0.5 A4:0.5 r:0.5 E4:0.5 A4:1 r:1 |"
    "F5:0.5 r:0.5 F5:0.5 E5:0.5 D5:0.5 C5:0.5 A4:1 | G4:0.5 B4:0.5 D5:0.5 G5:0.5 F5:1 D5:1 |"
    "A5:0.5 r:0.5 A5:0.5 G5:0.5 E5:0.5 r:0.5 C5:0.5 E5:0.5 | D#5:0.5 E5:0.5 C5:0.5 A4:0.5 E5:1 r:1 |"
    "F5:0.5 A5:0.5 C6:1 A5:0.5 F5:0.5 C5:1 | B4:0.5 G#4:0.5 B4:0.5 E5:0.5 G#5:2 |"
    "D5:0.5 F5:0.5 A5:1 G#5:0.5 A5:0.5 F5:1 | E5:0.5 C5:0.5 A4:1 C5:0.5 E5:0.5 A5:1 |"
    "A5:0.5 G5:0.5 F5:0.5 E5:0.5 F5:0.5 A5:0.5 C6:1 | B5:1 G#5:0.5 E5:0.5 B4:1 E5:1 |"
    "A5:0.5 E5:0.5 C5:0.5 E5:0.5 A5:0.5 B5:0.5 C6:1 | C6:0.5 B5:0.5 A5:0.5 F5:0.5 C6:1 A5:1 |"
    "B5:0.5 A5:0.5 G5:0.5 D5:0.5 G5:1 B5:1 | G#5:1 E5:0.5 F5:0.5 G#5:0.5 A5:0.5 B5:1"
)


def music_boss():
    s = Song(150, 16)
    mel = parse_melody(BOSS_MELODY)
    add_melody(s, "lead", mel, lambda f, d: inst_lead(f, d, duty=0.25, bright=2700, vib=0.004), 0.27, 0.0, gate=0.8)
    add_melody(s, "lead2", mel, lambda f, d: inst_lead(f, d, duty=0.5, bright=1600, vib=0.0, shape="square"),
               0.11, -0.15, gate=0.7, transpose=-12)
    s.echo("lead", 0.5, fb=0.18, taps=2)
    for bar, ch in enumerate(BOSS_CHORDS):
        tones = chord_tones(ch, 57)
        for beat, d in ((0.5, 0.35), (1.5, 0.35), (3.0, 0.6)):
            for m in tones:
                s.add("stabs", inst_pluck(mtof(m), d * s.beat, shape="pulse", duty=0.5, bright=1700, tau=0.1),
                      bar * 4 + beat, 0.07, 0.35)
        r = chord_root(ch, 40)
        offs = [0, 0, 12, 0, 0, 12, 0, 7]
        for i, o in enumerate(offs):
            s.add("bass", inst_bass(mtof(r + o), 0.4 * s.beat, bright=1000, tau=0.12, sus=0.45),
                  bar * 4 + i * 0.5, 0.33 if i % 2 == 0 else 0.27, 0.0)
        fill = bar % 8 == 7
        pat = []
        for b in range(4 if not fill else 2):
            pat.append((b, drum_kick(), 0.5, 0))
        pat += [(1, drum_snare(), 0.25, 0.05)]
        if not fill:
            pat.append((3, drum_snare(), 0.25, 0.05))
            for i in range(8):
                pat.append((i * 0.5, drum_hat(), 0.06 if i % 2 == 0 else 0.1, -0.25))
        else:
            for i, f0 in enumerate((240, 210, 180, 150)):
                pat.append((2 + i * 0.5, drum_tom(f0), 0.38, -0.3 + 0.2 * i))
            pat.append((3.5, drum_snare(), 0.2, 0.05))
            pat.append((3.75, drum_snare(), 0.24, 0.05))
        if bar in (0, 8):
            pat.append((0, drum_crash(), 0.13, 0.3))
        add_drum_pattern(s, bar, pat)
    return s.render(levels={}, sends={"lead": 0.25, "lead2": 0.15, "stabs": 0.2, "drums": 0.08},
                    rt=1.1, wet=0.2), s


MUSIC = {"music_menu": music_menu, "music_story": music_story,
         "music_living": music_living, "music_boss": music_boss}


# ---------------------------------------------------------------------------
# Encoding
# ---------------------------------------------------------------------------

def decoded_peak(path, channels):
    r = subprocess.run([FFMPEG, "-loglevel", "error", "-i", path, "-f", "f32le", "-ac", str(channels), "-"],
                       capture_output=True, check=True)
    x = np.frombuffer(r.stdout, dtype=np.float32)
    return float(np.max(np.abs(x))) if len(x) else 0.0


def encode(path, data, channels, bitrate, target_db=-1.0):
    """Encode to AAC, then re-check the decoded peak (AAC can overshoot the source
    peak by a few dB on transient, bass-heavy sounds) and re-encode quieter if needed."""
    data = np.asarray(data, dtype=np.float64)
    target = 10 ** (target_db / 20)
    for _ in range(4):
        pcm = np.asarray(data, dtype=np.float32)
        interleaved = pcm.T.reshape(-1) if channels == 2 else pcm
        cmd = [FFMPEG, "-y", "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", str(channels),
               "-i", "-", "-c:a", "aac", "-aac_coder", "fast", "-b:a", bitrate, "-ar", str(SR), "-movflags", "+faststart", path]
        subprocess.run(cmd, input=interleaved.tobytes(), check=True)
        pk = decoded_peak(path, channels)
        if pk <= target * 1.02:
            break
        data = data * (target / pk) * 0.99


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    only = set(sys.argv[1:])
    manifest_path = os.path.join(OUT_DIR, "manifest.json")
    manifest = {}
    if os.path.exists(manifest_path) and only:
        with open(manifest_path) as fh:
            manifest = json.load(fh)
    for name, fn in SFX.items():
        if only and name not in only:
            continue
        x = fn()
        encode(os.path.join(OUT_DIR, name + ".m4a"), x, 1, "96k")
        manifest[name + ".m4a"] = {"seconds": round(len(x) / SR, 3), "loop": name in SFX_LOOP, "samples": len(x)}
        print(f"{name:18s} {len(x) / SR:6.3f}s  peak {db(np.max(np.abs(x))):6.2f} dBFS")
    for name, fn in MUSIC.items():
        if only and name not in only:
            continue
        x, song = fn()
        encode(os.path.join(OUT_DIR, name + ".m4a"), x, 2, "128k")
        manifest[name + ".m4a"] = {"seconds": round(song.L / SR, 3), "loop": True,
                                   "samples": song.L, "bpm": song.bpm, "bars": song.bars}
        rms = np.sqrt(np.mean(x ** 2))
        print(f"{name:18s} {song.L / SR:6.3f}s  peak {db(np.max(np.abs(x))):6.2f} dBFS  rms {db(rms):6.2f} dBFS")
    manifest = dict(sorted(manifest.items()))
    with open(manifest_path, "w") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")


if __name__ == "__main__":
    main()
