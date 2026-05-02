/**
 * Pomodoro store — module-level singleton that owns the timer state and
 * tick loop. Lifting the state above the widget means:
 *
 *   1. The taskbar indicator (`TaskbarPomodoro`) can subscribe even when
 *      the widget itself is closed.
 *   2. The timer keeps running if the user closes / reopens the widget;
 *      no progress is lost mid-session.
 *
 * The widget acts as a pure controller: it reads the snapshot via
 * `useSyncExternalStore` and calls the action functions below to drive
 * state transitions.
 *
 * The alarm sound on session-end is synthesised through the WebAudio API
 * (no audio file assets to bundle / license). All the presets are tuned
 * to be soft — gentle decay, low peak gain — so they don't startle. The
 * focus-time ambient sound (white / pink / brown noise) is synthesised
 * the same way and looped through an AudioBufferSourceNode.
 */

import toast from './toast';

export type Mode = 'focus' | 'short' | 'long';
export type AlarmSound = 'bell' | 'chime' | 'bowl' | 'wind-chimes' | 'off';
export type FocusSound =
  | 'none'
  | 'white' | 'pink' | 'brown'
  | 'tick-fast' | 'tick-slow'
  | 'rain' | 'fireplace';

export interface PomoDurations {
  /** Focus block, in seconds. */
  focus: number;
  /** Short break, in seconds. */
  short: number;
  /** Long break, in seconds. Triggered every Nth focus where N is
   *  `longBreakInterval` from `setPomoBehaviour`. */
  long: number;
}

export interface PomoBehaviour {
  /** When a focus block ends, automatically start the break. */
  autoStartBreaks: boolean;
  /** When a break ends, automatically start the next focus block. */
  autoStartPomodoros: boolean;
  /** Long break is taken after every Nth focus block. Default 4. */
  longBreakInterval: number;
}

export interface PomoSnapshot {
  running: boolean;
  /** Seconds remaining in the current block. */
  remaining: number;
  mode: Mode;
  /** Seconds in the full current block — used for progress %. */
  total: number;
  /** Pomodoros completed since the page loaded. */
  streak: number;
  /** Today's lifetime count (persisted to localStorage). */
  count: number;
}

export const ALARM_OPTIONS: { id: AlarmSound; label: string; description: string }[] = [
  { id: 'bell',        label: 'Bell',          description: 'Soft bell with one harmonic' },
  { id: 'chime',       label: 'Chime',         description: 'Two-note ascending chime' },
  { id: 'bowl',        label: 'Singing Bowl',  description: 'Long-decay meditation tone' },
  { id: 'wind-chimes', label: 'Wind Chimes',   description: 'Four soft tones in succession' },
  { id: 'off',         label: 'Off (silent)',  description: 'No sound — only desktop notification' },
];

export const FOCUS_SOUND_OPTIONS: { id: FocusSound; label: string }[] = [
  { id: 'none',       label: 'None' },
  { id: 'tick-fast',  label: 'Ticking Fast' },
  { id: 'tick-slow',  label: 'Ticking Slow' },
  { id: 'rain',       label: 'Rain' },
  { id: 'fireplace',  label: 'Fireplace' },
  { id: 'white',      label: 'White Noise' },
  { id: 'pink',       label: 'Pink Noise' },
  { id: 'brown',      label: 'Brown Noise' },
];

const todayKey = () => `pomodoro-${new Date().toISOString().slice(0, 10)}`;
const loadCount = () => {
  try { return parseInt(localStorage.getItem(todayKey()) || '0', 10) || 0; } catch { return 0; }
};
const saveCount = (n: number) => {
  try { localStorage.setItem(todayKey(), String(n)); } catch {}
};

let _durations: PomoDurations = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
let _alarm: AlarmSound = 'bell';
let _alarmVolume = 100; // 0–100
let _alarmRepeat = 1;   // 1–5
let _focusSoundType: FocusSound = 'none';
let _focusVolume = 50;  // 0–100
let _behaviour: PomoBehaviour = { autoStartBreaks: false, autoStartPomodoros: false, longBreakInterval: 4 };

let _state: PomoSnapshot = {
  running: false,
  remaining: _durations.focus,
  mode: 'focus',
  total: _durations.focus,
  streak: 0,
  count: typeof localStorage !== 'undefined' ? loadCount() : 0,
};

let _intervalId: ReturnType<typeof setInterval> | null = null;
const _listeners = new Set<() => void>();

const _notify = () => _listeners.forEach(l => l());
const _set = (s: Partial<PomoSnapshot>) => { _state = { ..._state, ...s }; _notify(); };

export function getPomoSnapshot(): PomoSnapshot { return _state; }
export function subscribePomo(l: () => void) { _listeners.add(l); return () => { _listeners.delete(l); }; }

export function setPomoDurations(d: PomoDurations) {
  _durations = d;
  // If the user changed durations while not running and at the start of the
  // block, sync the visible time to the new value.
  if (!_state.running && _state.remaining === _state.total) {
    _set({ remaining: d[_state.mode], total: d[_state.mode] });
  }
}
export function getPomoDurations(): PomoDurations { return _durations; }

export function setPomoAlarm(a: AlarmSound) { _alarm = a; }
export function getPomoAlarm(): AlarmSound { return _alarm; }

/** Configure the alarm playback volume (0–100) and repeat count (1–5).
 *  Used at session-end. The standalone `playAlarm()` preview button can
 *  still pass overrides. */
export function setPomoAlarmConfig(volume: number, repeat: number) {
  _alarmVolume = Math.max(0, Math.min(100, Math.round(volume)));
  _alarmRepeat = Math.max(1, Math.min(5, Math.round(repeat)));
}
export function getPomoAlarmConfig() { return { volume: _alarmVolume, repeat: _alarmRepeat }; }

export function setPomoBehaviour(b: PomoBehaviour) {
  _behaviour = {
    autoStartBreaks: !!b.autoStartBreaks,
    autoStartPomodoros: !!b.autoStartPomodoros,
    longBreakInterval: Math.max(1, Math.min(20, Math.round(b.longBreakInterval || 4))),
  };
}
export function getPomoBehaviour(): PomoBehaviour { return _behaviour; }

/** Configure the ambient focus-time sound. If a focus block is currently
 *  running the audio is hot-swapped to the new settings. */
export function setPomoFocusSound(type: FocusSound, volume: number) {
  _focusSoundType = type;
  _focusVolume = Math.max(0, Math.min(100, Math.round(volume)));
  // Hot-swap if focus mode is currently running.
  if (_state.running && _state.mode === 'focus') {
    stopFocusAudio();
    startFocusAudio();
  } else if (type === 'none' || _focusVolume === 0) {
    stopFocusAudio();
  }
}
export function getPomoFocusSound() { return { type: _focusSoundType, volume: _focusVolume }; }

export function pomoStart() {
  if (_state.running) return;
  _set({ running: true });
  _intervalId = setInterval(_tick, 1000);
  if (_state.mode === 'focus') startFocusAudio();
}
export function pomoPause() {
  if (!_state.running && _intervalId === null) return;
  if (_intervalId !== null) { clearInterval(_intervalId); _intervalId = null; }
  _set({ running: false });
  stopFocusAudio();
}
export function pomoReset() {
  pomoPause();
  _set({ remaining: _durations[_state.mode], total: _durations[_state.mode] });
}
export function pomoSwitchMode(m: Mode) {
  pomoPause();
  _set({ mode: m, remaining: _durations[m], total: _durations[m] });
}

function _tick() {
  if (_state.remaining <= 1) {
    _onSessionEnd();
    return;
  }
  _set({ remaining: _state.remaining - 1 });
}

function _onSessionEnd() {
  if (_intervalId !== null) { clearInterval(_intervalId); _intervalId = null; }
  stopFocusAudio();
  playAlarm(_alarm, { volume: _alarmVolume, repeat: _alarmRepeat });

  // Notify the user three ways so they don't miss it:
  //   1. The alarm sound (already fired above).
  //   2. A native OS notification — fires even when the tab is in the
  //      background, but only if the user granted permission.
  //   3. The in-app toast — guaranteed to render whenever the page is
  //      open, regardless of OS permission state.
  const justFinishedFocus = _state.mode === 'focus';
  const headline = justFinishedFocus ? 'Pomodoro complete — time for a break! 🍅' : 'Break\'s over — back to work!';
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try { new Notification(headline); } catch {}
  }
  try { toast.info(headline); } catch {}

  if (_state.mode === 'focus') {
    const nextStreak = _state.streak + 1;
    const newCount = _state.count + 1;
    saveCount(newCount);
    const nextMode: Mode = nextStreak % _behaviour.longBreakInterval === 0 ? 'long' : 'short';
    _set({
      running: false,
      streak: nextStreak,
      count: newCount,
      mode: nextMode,
      remaining: _durations[nextMode],
      total: _durations[nextMode],
    });
    if (_behaviour.autoStartBreaks) setTimeout(() => pomoStart(), 50);
  } else {
    _set({
      running: false,
      mode: 'focus',
      remaining: _durations.focus,
      total: _durations.focus,
    });
    if (_behaviour.autoStartPomodoros) setTimeout(() => pomoStart(), 50);
  }
}

/** Synthesise the chosen alarm via WebAudio. All presets are tuned soft —
 *  exponential decay to near-silence, peak gain ≤ 0.22. The `volume`
 *  option scales the peak (0-100). The `repeat` option plays the cue
 *  several times with a 2.5 s gap between starts. */
export function playAlarm(kind: AlarmSound = _alarm, opts: { volume?: number; repeat?: number } = {}) {
  if (kind === 'off') return;
  const volScale = Math.max(0, Math.min(100, opts.volume ?? 100)) / 100;
  if (volScale === 0) return;
  const repeat = Math.max(1, Math.min(5, opts.repeat ?? 1));
  for (let i = 0; i < repeat; i++) {
    setTimeout(() => _playAlarmOnce(kind, volScale), i * 2500);
  }
}

function _playAlarmOnce(kind: AlarmSound, volScale: number) {
  try {
    const Ctor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const playNote = (freq: number, start: number, duration: number, vol = 0.22, type: OscillatorType = 'sine') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + start;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(vol * volScale, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.start(t0);
      osc.stop(t0 + duration);
    };
    let totalDuration = 2;
    if (kind === 'bell') {
      playNote(880, 0, 1.8);
      playNote(1320, 0, 1.4, 0.10);
      totalDuration = 2;
    } else if (kind === 'chime') {
      playNote(659.25, 0, 0.7);    // E5
      playNote(880, 0.20, 1.3);    // A5
      totalDuration = 2;
    } else if (kind === 'bowl') {
      playNote(440, 0, 3.4, 0.22);
      playNote(660, 0, 3.0, 0.08);
      playNote(880, 0.05, 2.8, 0.05);
      totalDuration = 4;
    } else if (kind === 'wind-chimes') {
      playNote(1175, 0,    1.1, 0.16); // D6
      playNote(880,  0.15, 1.3, 0.16); // A5
      playNote(1318, 0.30, 1.5, 0.16); // E6
      playNote(1047, 0.50, 1.7, 0.13); // C6
      totalDuration = 3;
    }
    setTimeout(() => { try { ctx.close(); } catch {} }, totalDuration * 1000 + 500);
  } catch {}
}

// ── Ambient focus-time sound ──
let _focusAudio: { ctx: AudioContext; src: AudioBufferSourceNode; gain: GainNode } | null = null;

/** Per-type volume cap. Sparse signals (ticking, fireplace pops) need a
 *  higher gain to perceive at the same loudness as a continuous noise
 *  texture. The user-facing slider always shows 0–100; this multiplier
 *  is the headroom mapping. */
const FOCUS_VOL_CAP: Record<FocusSound, number> = {
  none:        0,
  white:       0.30,
  pink:        0.30,
  brown:       0.30,
  'tick-fast': 0.60,
  'tick-slow': 0.60,
  rain:        0.40,
  fireplace:   0.50,
};

function _makeNoiseBuffer(ctx: AudioContext, type: FocusSound): AudioBuffer | null {
  if (type === 'none') return null;
  const sr = ctx.sampleRate;
  // Noise textures use a 2 s loop. Ticking, rain, and fireplace use 4 s
  // so multiple ticks / pops fit in one cycle and the loop seam is masked
  // by the texture itself.
  const dur = (type === 'white' || type === 'pink' || type === 'brown') ? 2 : 4;
  const len = sr * dur;
  const buffer = ctx.createBuffer(1, len, sr);
  const data = buffer.getChannelData(0);

  if (type === 'white') {
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.5;

  } else if (type === 'pink') {
    // Paul Kellet's filter — cheap pink-noise approximation.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11 * 0.55;
      b6 = w * 0.115926;
    }

  } else if (type === 'brown') {
    // 1/f² — leaky integrator on white noise.
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5 * 0.5;
    }

  } else if (type === 'tick-fast' || type === 'tick-slow') {
    // Wall-clock tick: brief noise burst with a sharp exponential decay.
    // Two intervals are even divisors of the 4 s buffer, so the loop is
    // perfectly seamless.
    const intervalSec = type === 'tick-fast' ? 0.5 : 1.0;
    const tickSamples = Math.floor(sr * 0.045);
    for (let t = 0; t < dur; t += intervalSec) {
      const start = Math.floor(t * sr);
      for (let i = 0; i < tickSamples && start + i < len; i++) {
        const env = Math.exp(-i / sr * 180); // ~5 ms attack, ~25 ms decay tail
        const noise = Math.random() * 2 - 1;
        // Mix sharp click (filtered noise) with a faint sine to add body.
        const tone = Math.sin(2 * Math.PI * 1100 * (i / sr));
        data[start + i] += (noise * 0.7 + tone * 0.25) * env * 0.55;
      }
    }

  } else if (type === 'rain') {
    // High-pass filtered white noise (the "patter") plus a slow tremolo
    // for occasional gusts.
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      const filtered = w - prev * 0.93; // high-pass
      prev = w;
      const gust = 0.7 + 0.3 * Math.sin((i / sr) * 2 * Math.PI * 0.25);
      data[i] = filtered * gust * 0.4;
    }

  } else if (type === 'fireplace') {
    // Brown-noise rumble underneath, plus randomly-spaced "pops" (short
    // noise transients with sharp decay) for the crackle.
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 1.6;
    }
    let next = Math.random() * 0.4 * sr;
    while (next < len) {
      const popLen = Math.floor((0.012 + Math.random() * 0.05) * sr);
      const popVol = 0.35 + Math.random() * 0.45;
      const popPos = Math.floor(next);
      for (let i = 0; i < popLen && popPos + i < len; i++) {
        const env = Math.exp(-i / sr * 90);
        data[popPos + i] += (Math.random() * 2 - 1) * env * popVol;
      }
      // Next pop somewhere between 80 ms and 700 ms later.
      next += (0.08 + Math.random() * 0.62) * sr;
    }
  }

  return buffer;
}

function startFocusAudio() {
  if (_focusAudio) return;
  if (_focusSoundType === 'none' || _focusVolume === 0) return;
  try {
    const Ctor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const buffer = _makeNoiseBuffer(ctx, _focusSoundType);
    if (!buffer) { try { ctx.close(); } catch {} return; }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = (_focusVolume / 100) * FOCUS_VOL_CAP[_focusSoundType];
    src.connect(gain).connect(ctx.destination);
    src.start();
    _focusAudio = { ctx, src, gain };
  } catch {}
}

function stopFocusAudio() {
  if (!_focusAudio) return;
  try { _focusAudio.src.stop(); } catch {}
  try { _focusAudio.ctx.close(); } catch {}
  _focusAudio = null;
}

/** Play the configured ambient focus sound for ~3 s as a preview. Used by
 *  the Settings UI when the user adjusts the dropdown / volume slider. */
export function previewFocusSound(type: FocusSound, volume: number) {
  if (type === 'none' || volume === 0) return;
  try {
    const Ctor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const buffer = _makeNoiseBuffer(ctx, type);
    if (!buffer) { try { ctx.close(); } catch {} return; }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = (volume / 100) * FOCUS_VOL_CAP[type];
    src.connect(gain).connect(ctx.destination);
    src.start();
    setTimeout(() => {
      try { src.stop(); } catch {}
      try { ctx.close(); } catch {}
    }, 3000);
  } catch {}
}
