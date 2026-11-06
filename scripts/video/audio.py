"""Sintetiza a trilha e os efeitos sonoros do vídeo (sem samples externos).

Uso: python3 audio.py audio-events.json duracao saida.wav
"""
import json
import math
import sys
import wave

import numpy as np

SR = 44100
rng = np.random.default_rng(7)


# ------------------------------------------------------------------ utilidades
def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def env_ad(n, attack=0.005, decay=0.2, curve=4.0):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    d = np.exp(-curve * np.clip(t - attack, 0, None) / max(decay, 1e-4))
    return a * d


def onepole_lp(x, cutoff):
    """Passa-baixa de 1 polo; cutoff pode ser escalar ou array (varredura)."""
    cut = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    a = np.exp(-2 * np.pi * cut / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def hp(x):
    return np.concatenate([[0.0], np.diff(x)])


def sine(f, dur, phase=0.0):
    t = t_axis(dur)
    f = np.broadcast_to(np.asarray(f, dtype=float), t.shape) if np.ndim(f) else np.full(t.shape, f)
    return np.sin(2 * np.pi * np.cumsum(f) / SR + phase)


def square(f, dur, harmonics=9):
    t = t_axis(dur)
    out = np.zeros_like(t)
    for k in range(1, harmonics + 1, 2):
        out += np.sin(2 * np.pi * f * k * t) / k
    return out * (4 / np.pi) * 0.7


def tri(f, dur):
    t = t_axis(dur)
    return 2 * np.abs(2 * ((t * f) % 1) - 1) - 1


def noise(dur):
    return rng.uniform(-1, 1, int(dur * SR))


def note_hz(n):  # 69 = A4
    return 440.0 * 2 ** ((n - 69) / 12)


class Mix:
    def __init__(self, dur):
        self.L = np.zeros(int(dur * SR) + SR)
        self.R = np.zeros_like(self.L)

    def add(self, t, sig, vol=1.0, pan=0.0):
        i = int(t * SR)
        if i < 0 or i >= len(self.L):
            return
        sig = sig[: len(self.L) - i] * vol
        l = math.cos((pan + 1) * math.pi / 4)
        r = math.sin((pan + 1) * math.pi / 4)
        self.L[i : i + len(sig)] += sig * l
        self.R[i : i + len(sig)] += sig * r


# ------------------------------------------------------------------ efeitos
def sfx_blip(n):
    scale = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96]
    f = note_hz(scale[n % len(scale)])
    d = 0.07
    return square(f, d, 7) * env_ad(int(d * SR), 0.002, 0.05)


def sfx_whoosh(dur=0.55, soft=False):
    n = noise(dur)
    t = t_axis(dur)
    cut = 400 + 5200 * np.sin(np.pi * t / dur) ** 2
    s = onepole_lp(onepole_lp(n, cut), cut)
    e = np.sin(np.pi * t / dur) ** 2
    return s * e * (2.2 if not soft else 1.4)


def sfx_tick(soft=False):
    d = 0.03
    s = sine(3200, d) * env_ad(int(d * SR), 0.0005, 0.012) + hp(noise(d)) * env_ad(int(d * SR), 0.0002, 0.004) * 0.6
    return s * (0.5 if soft else 1.0)


def sfx_scratch():
    d = 0.28
    t = t_axis(d)
    cut = 6000 - 5000 * t / d
    return onepole_lp(noise(d), cut) * env_ad(int(d * SR), 0.01, 0.2, 3) * 1.6


def sfx_pop(n=0):
    d = 0.12
    t = t_axis(d)
    base = 1.0 * 2 ** (n * 4 / 12)
    f = (950 * np.exp(-t * 28) + 260) * base
    s = sine(f, d) * env_ad(int(d * SR), 0.001, 0.09, 3)
    tk = sfx_tick(True) * 0.3
    s[: len(tk)] += tk
    return s


def sfx_click():
    d = 0.06
    a = hp(noise(0.004)) * np.linspace(1, 0, int(0.004 * SR)) * 1.2
    b = sine(4200, 0.012) * env_ad(int(0.012 * SR), 0.0003, 0.004) * 0.6
    out = np.zeros(int(d * SR))
    out[: len(a)] += a
    out[: len(b)] += b
    i = int(0.045 * SR)  # soltar o botão
    out[i : i + len(a)] += a * 0.5
    return out


def sfx_key(soft=False, pitch=1.0):
    d = 0.07
    n = int(d * SR)
    body = sine(180 * pitch, d) * env_ad(n, 0.001, 0.025, 4)
    clack = onepole_lp(noise(d), 2600 * pitch) * env_ad(n, 0.0005, 0.02, 5) * 2.5
    tick = hp(noise(d)) * env_ad(n, 0.0002, 0.006) * 0.5
    s = body * 0.8 + clack + tick
    return s * (0.45 if soft else 1.0)


def sfx_drop():
    d = 0.22
    t = t_axis(d)
    f = 220 + 520 * np.exp(-t * 22)
    thud = sine(f, d) * env_ad(int(d * SR), 0.002, 0.14, 3)
    return thud * 1.1


def sfx_sparkle():
    notes = [88, 91, 95, 100]
    out = np.zeros(int(0.5 * SR))
    for k, nn in enumerate(notes):
        s = square(note_hz(nn), 0.12, 5) * env_ad(int(0.12 * SR), 0.001, 0.08, 3)
        i = int(k * 0.045 * SR)
        out[i : i + len(s)] += s * (1 - k * 0.12)
    return out * 0.6


def sfx_success():
    out = np.zeros(int(0.9 * SR))
    for k, nn in enumerate([84, 91]):
        d = 0.8
        s = (sine(note_hz(nn), d) + 0.3 * sine(note_hz(nn) * 2.01, d)) * env_ad(int(d * SR), 0.003, 0.5, 3)
        i = int(k * 0.09 * SR)
        out[i : i + len(s)] += s[: len(out) - i]
    return out * 0.8


def sfx_paste():
    d = 0.3
    t = t_axis(d)
    thump = sine(150 * np.exp(-t * 6), d) * env_ad(int(d * SR), 0.002, 0.18, 3)
    return thump * 1.2


def sfx_punch(n=0):
    d = 0.45
    t = t_axis(d)
    kick = sine(160 * np.exp(-t * 18) + 48, d) * env_ad(int(d * SR), 0.001, 0.32, 3) * 1.4
    snap = onepole_lp(hp(noise(d)), 7000) * env_ad(int(d * SR), 0.001, 0.08, 4) * 2.2
    tone = square(note_hz([69, 72, 76][n % 3]), d, 5) * env_ad(int(d * SR), 0.002, 0.18, 3) * 0.35
    return kick + snap + tone


def sfx_chime():
    d = 2.6
    out = np.zeros(int(d * SR))
    for k, nn in enumerate([72, 76, 79, 84]):
        f = note_hz(nn)
        s = (sine(f, d) + 0.25 * sine(f * 2.76, d) + 0.1 * sine(f * 5.4, d)) * env_ad(int(d * SR), 0.004, 1.6, 3)
        i = int(k * 0.06 * SR)
        out[i:] += s[: len(out) - i] * 0.5
    return out * 0.7


def sfx_riser(d=1.0):
    t = t_axis(d)
    cut = 300 + 8000 * (t / d) ** 2
    return onepole_lp(noise(d), cut) * (t / d) ** 2 * 1.4


# ------------------------------------------------------------------ trilha
BPM = 124
BEAT = 60 / BPM
BAR = BEAT * 4
# Am – F – C – G
CHORDS = [(57, [69, 72, 76]), (53, [65, 69, 72]), (48, [67, 72, 76]), (55, [67, 71, 74])]


def kick():
    d = 0.32
    t = t_axis(d)
    return sine(130 * np.exp(-t * 20) + 46, d) * env_ad(int(d * SR), 0.001, 0.22, 3)


def hat(open_=False):
    d = 0.09 if open_ else 0.04
    return hp(hp(noise(d))) * env_ad(int(d * SR), 0.0005, d * 0.6, 4) * 0.5


def clap():
    d = 0.18
    s = onepole_lp(hp(noise(d)), 3500) * env_ad(int(d * SR), 0.001, 0.09, 4)
    return s * 1.6


def music(mix, start, end, sc):
    sections = {
        # (início, fim): elementos ativos
        'intro': (start, sc['hook'][0], {'pad'}),
        'hook': (sc['hook'][0], sc['stage'][0], {'pad', 'kick', 'hat'}),
        'demo': (sc['stage'][0], sc['paste'][0], {'pad', 'kick', 'hat', 'clap', 'bass'}),
        'paste': (sc['paste'][0], sc['features'][0], {'pad', 'kick', 'hat', 'clap', 'bass', 'arp'}),
        'feat': (sc['features'][0], sc['outro'][0], {'pad', 'kick', 'hat', 'clap', 'bass', 'arp'}),
        'outro': (sc['outro'][0], end, {'pad', 'kick', 'hat', 'clap', 'bass', 'arp'}),
    }

    def active(t):
        for a, b, els in sections.values():
            if a <= t < b:
                return els
        return set()

    t = start
    step = BEAT / 4  # 16 avos
    i = 0
    while t < end:
        bar = int(i // 16)
        pos = i % 16
        root, chord = CHORDS[bar % 4]
        els = active(t)
        fade = 1.0 if t < end - 1.2 else max(0.0, (end - t) / 1.2)
        if 'kick' in els and pos % 4 == 0:
            mix.add(t, kick(), 0.3 * fade)
        if 'clap' in els and pos in (4, 12):
            mix.add(t, clap(), 0.09 * fade, 0.1)
        if 'hat' in els and pos % 2 == 0 and pos % 4 != 0:
            mix.add(t, onepole_lp(hat(), 9000), 0.12 * fade, -0.3)
        if 'hat' in els and pos % 4 == 2 and pos == 14:
            mix.add(t, hat(True), 0.1 * fade, -0.3)
        if 'bass' in els and pos % 2 == 0:
            n = root - 12 + (12 if pos in (6, 14) else 0)
            d = step * 1.8
            mix.add(t, tri(note_hz(n), d) * env_ad(int(d * SR), 0.004, d * 0.7, 2.5), 0.2 * fade)
        if 'pad' in els and pos == 0:
            d = BAR * 1.02
            sig = np.zeros(int(d * SR))
            for nn in chord:
                sig += (sine(note_hz(nn), d) + 0.2 * sine(note_hz(nn) * 2, d)) / 3
            e = np.minimum(1, t_axis(d) / 0.35) * np.minimum(1, (d - t_axis(d)) / 0.4)
            mix.add(t, sig * e, 0.095 * fade, 0)
        if 'arp' in els:
            nn = chord[[0, 1, 2, 1][pos % 4]] + 12
            d = step * 0.9
            sig = square(note_hz(nn), d, 5) * env_ad(int(d * SR), 0.002, d * 0.5, 3)
            mix.add(t, sig, 0.035 * fade, 0.35 if pos % 2 else -0.35)
        t += step
        i += 1
    # acorde final
    d = 3.0
    sig = np.zeros(int(d * SR))
    for nn in [57, 64, 69, 72, 76]:
        sig += sine(note_hz(nn), d) / 5
    mix.add(end - 0.05, sig * env_ad(int(d * SR), 0.02, 2.0, 3), 0.18)


# ------------------------------------------------------------------ main
def main():
    data = json.load(open(sys.argv[1]))
    events, sc, dur = data['events'], data['scenes'], float(data['duration'])
    out = sys.argv[2]
    mix = Mix(dur)
    music_mix = Mix(dur)
    music(music_mix, 0.5, dur - 1.9, sc)

    for e in events:
        t, k, n = e['t'], e['type'], e.get('n', 0)
        pan = float(rng.uniform(-0.25, 0.25))
        if k == 'blip':
            mix.add(t, sfx_blip(n), 0.16, pan)
        elif k == 'whoosh':
            mix.add(t, sfx_whoosh(), 0.3, 0)
        elif k == 'whoosh-fast':
            mix.add(t, sfx_whoosh(0.4), 0.28, 0)
        elif k == 'whoosh-soft':
            mix.add(t, sfx_whoosh(0.45, True), 0.22, 0)
        elif k == 'tick':
            mix.add(t, sfx_tick(), 0.22, pan)
        elif k == 'tick-soft':
            mix.add(t, sfx_tick(True), 0.16, pan)
        elif k == 'scratch':
            mix.add(t, sfx_scratch(), 0.2, 0)
        elif k == 'pop':
            mix.add(t, sfx_pop(n), 0.42, pan)
        elif k == 'click':
            mix.add(t, sfx_click(), 0.42, pan)
        elif k == 'key':
            mix.add(t, sfx_key(), 0.45, pan)
        elif k == 'type':
            mix.add(t, sfx_key(True, float(rng.uniform(0.85, 1.25))), 0.3, pan)
        elif k == 'drop':
            mix.add(t, sfx_drop(), 0.5, 0)
        elif k == 'sparkle':
            mix.add(t, sfx_sparkle(), 0.2, 0.2)
        elif k == 'success':
            mix.add(t, sfx_success(), 0.32, 0)
        elif k == 'paste':
            mix.add(t, sfx_paste(), 0.55, 0)
            mix.add(t + 0.05, sfx_sparkle(), 0.16, -0.2)
        elif k == 'punch':
            mix.add(t, sfx_punch(n), 0.5, 0)
        elif k == 'chime':
            mix.add(t, sfx_chime(), 0.4, 0)

    # riser antes do encerramento
    mix.add(sc['outro'][0] - 0.9, sfx_riser(0.9), 0.18, 0)

    # "ducking" leve da música sob os efeitos
    sfx_env = onepole_lp(np.abs(mix.L) + np.abs(mix.R), 8.0)
    duck = 1 - np.clip(sfx_env * 1.6, 0, 0.45)
    L = mix.L + music_mix.L * duck
    R = mix.R + music_mix.R * duck

    n = int(dur * SR)
    L, R = L[:n], R[:n]
    # fade de entrada/saída
    fade_out = int(0.35 * SR)
    L[-fade_out:] *= np.linspace(1, 0, fade_out)
    R[-fade_out:] *= np.linspace(1, 0, fade_out)
    peak = max(np.max(np.abs(L)), np.max(np.abs(R)))
    gain = 0.89 / peak
    L, R = np.tanh(L * gain * 1.1) / np.tanh(1.1), np.tanh(R * gain * 1.1) / np.tanh(1.1)
    data = (np.stack([L, R], axis=1) * 32767 * 0.95).astype(np.int16)
    with wave.open(out, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    rms = lambda x: 20 * math.log10(np.sqrt(np.mean(x ** 2)) + 1e-9)
    print(f'ok {out}  pico normalizado, RMS L {rms(L):.1f} dBFS, eventos {len(events)}')


if __name__ == '__main__':
    main()
