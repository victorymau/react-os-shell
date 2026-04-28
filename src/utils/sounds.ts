/**
 * Custom sound effects using Web Audio API.
 * Multiple sound packs — user can choose in Customization > Desktop.
 */

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.15) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = vol;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  } catch { /* Audio not available */ }
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Sound Pack Definitions ──

interface SoundPack {
  label: string;
  success: () => void;
  error: () => void;
  notification: () => void;
  startup: () => void;
  click: () => void;
  timerDone: () => void;
  logout: () => void;
}

const classic: SoundPack = {
  label: 'Classic',
  success: () => { tone(523, 0.1, 'sine', 0.1); setTimeout(() => tone(659, 0.1, 'sine', 0.1), 100); setTimeout(() => tone(784, 0.15, 'sine', 0.1), 200); },
  error: () => { tone(200, 0.15, 'sawtooth', 0.08); setTimeout(() => tone(180, 0.15, 'sawtooth', 0.08), 150); },
  notification: () => { tone(880, 0.08, 'sine', 0.12); setTimeout(() => tone(1100, 0.12, 'sine', 0.1), 100); },
  startup: () => { tone(392, 0.15, 'sine', 0.08); setTimeout(() => tone(523, 0.15, 'sine', 0.08), 150); setTimeout(() => tone(659, 0.15, 'sine', 0.08), 300); setTimeout(() => tone(784, 0.25, 'sine', 0.1), 450); },
  logout: () => { tone(784, 0.15, 'sine', 0.08); setTimeout(() => tone(659, 0.15, 'sine', 0.08), 150); setTimeout(() => tone(523, 0.15, 'sine', 0.08), 300); setTimeout(() => tone(392, 0.25, 'sine', 0.06), 450); },
  click: () => { tone(800, 0.05, 'square', 0.05); },
  timerDone: () => { for (let i = 0; i < 3; i++) { setTimeout(() => tone(1000, 0.15, 'sine', 0.12), i * 300); setTimeout(() => tone(800, 0.15, 'sine', 0.1), i * 300 + 150); } },
};

const minimal: SoundPack = {
  label: 'Minimal',
  success: () => { tone(1200, 0.06, 'sine', 0.08); },
  error: () => { tone(300, 0.1, 'triangle', 0.06); },
  notification: () => { tone(900, 0.06, 'sine', 0.08); },
  startup: () => { tone(600, 0.12, 'sine', 0.06); setTimeout(() => tone(900, 0.15, 'sine', 0.06), 120); },
  click: () => { tone(1000, 0.03, 'sine', 0.03); },
  timerDone: () => { tone(1000, 0.2, 'sine', 0.1); setTimeout(() => tone(1000, 0.2, 'sine', 0.1), 400); },
  logout: () => { tone(900, 0.1, 'sine', 0.06); setTimeout(() => tone(600, 0.15, 'sine', 0.05), 120); },
};

const retro: SoundPack = {
  label: 'Retro',
  success: () => { tone(440, 0.08, 'square', 0.08); setTimeout(() => tone(550, 0.08, 'square', 0.08), 80); setTimeout(() => tone(660, 0.08, 'square', 0.08), 160); setTimeout(() => tone(880, 0.12, 'square', 0.1), 240); },
  error: () => { tone(150, 0.2, 'square', 0.06); setTimeout(() => tone(100, 0.3, 'square', 0.06), 200); },
  notification: () => { tone(660, 0.06, 'square', 0.08); setTimeout(() => tone(880, 0.06, 'square', 0.08), 80); setTimeout(() => tone(660, 0.06, 'square', 0.08), 160); },
  startup: () => { [262, 330, 392, 523].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'square', 0.07), i * 100)); },
  click: () => { tone(600, 0.03, 'square', 0.06); },
  timerDone: () => { for (let i = 0; i < 4; i++) setTimeout(() => tone(880, 0.1, 'square', 0.1), i * 200); },
  logout: () => { [523, 392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'square', 0.07), i * 100)); },
};

const soft: SoundPack = {
  label: 'Soft',
  success: () => { tone(700, 0.2, 'sine', 0.06); setTimeout(() => tone(900, 0.25, 'sine', 0.06), 200); },
  error: () => { tone(250, 0.2, 'sine', 0.05); },
  notification: () => { tone(600, 0.15, 'triangle', 0.06); setTimeout(() => tone(800, 0.2, 'triangle', 0.05), 180); },
  startup: () => { tone(400, 0.3, 'sine', 0.05); setTimeout(() => tone(500, 0.3, 'sine', 0.05), 300); setTimeout(() => tone(600, 0.4, 'sine', 0.06), 600); },
  click: () => { tone(500, 0.04, 'triangle', 0.03); },
  timerDone: () => { tone(700, 0.3, 'triangle', 0.08); setTimeout(() => tone(700, 0.3, 'triangle', 0.08), 500); setTimeout(() => tone(900, 0.4, 'triangle', 0.08), 1000); },
  logout: () => { tone(600, 0.3, 'sine', 0.05); setTimeout(() => tone(400, 0.4, 'sine', 0.04), 300); },
};

const arcade: SoundPack = {
  label: 'Arcade',
  success: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.06, 'square', 0.07), i * 60)); },
  error: () => { tone(100, 0.3, 'sawtooth', 0.06); setTimeout(() => tone(80, 0.4, 'sawtooth', 0.05), 200); },
  notification: () => { tone(1047, 0.05, 'square', 0.08); setTimeout(() => tone(784, 0.05, 'square', 0.08), 60); setTimeout(() => tone(1047, 0.08, 'square', 0.1), 120); },
  startup: () => { [262, 330, 392, 523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.08, 'square', 0.06), i * 80)); },
  click: () => { tone(1200, 0.02, 'square', 0.05); },
  timerDone: () => { for (let i = 0; i < 5; i++) setTimeout(() => tone(1200, 0.05, 'square', 0.1), i * 120); },
  logout: () => { [784, 659, 523, 392, 262].forEach((f, i) => setTimeout(() => tone(f, 0.06, 'square', 0.06), i * 60)); },
};

const silent: SoundPack = {
  label: 'Silent',
  success: () => {}, error: () => {}, notification: () => {},
  startup: () => {}, click: () => {}, timerDone: () => {}, logout: () => {},
};

export const SOUND_PACKS: Record<string, SoundPack> = { classic, minimal, retro, soft, arcade, silent };

/** All pack keys including silent */
export const SOUND_PACK_KEYS = Object.keys(SOUND_PACKS) as string[];

// ── Sound types ──
export const SOUND_TYPES = ['click', 'success', 'error', 'notification', 'startup', 'timerDone', 'logout'] as const;
export type SoundType = typeof SOUND_TYPES[number];

export const SOUND_TYPE_LABELS: Record<SoundType, string> = {
  click: 'Click', success: 'Success', error: 'Error',
  notification: 'Notification', startup: 'Startup', timerDone: 'Timer', logout: 'Logout',
};

// ── State: per-sound pack selection ──

const STORAGE_KEY = 'erp_sound_config';

export function soundsEnabled(): boolean {
  return localStorage.getItem('erp_sounds') !== 'false';
}

export function toggleSounds(): boolean {
  const next = !soundsEnabled();
  localStorage.setItem('erp_sounds', String(next));
  return next;
}

/** Get the per-sound configuration: { click: 'classic', success: 'retro', ... } */
export function getSoundConfig(): Record<SoundType, string> {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '');
    if (stored && typeof stored === 'object') return { click: 'classic', success: 'classic', error: 'classic', notification: 'classic', startup: 'classic', timerDone: 'classic', logout: 'classic', ...stored };
  } catch {}
  return { click: 'classic', success: 'classic', error: 'classic', notification: 'classic', startup: 'classic', timerDone: 'classic', logout: 'classic' };
}

/** Set the pack for a specific sound type */
export function setSoundForType(soundType: SoundType, packKey: string) {
  const config = getSoundConfig();
  config[soundType] = packKey;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

/** Set all sounds to a specific pack */
export function setAllSounds(packKey: string) {
  const config: Record<string, string> = {};
  SOUND_TYPES.forEach(t => { config[t] = packKey; });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function getPackForType(soundType: SoundType): SoundPack {
  const config = getSoundConfig();
  return SOUND_PACKS[config[soundType]] || classic;
}

// ── Public API ──

export function playClick() { if (soundsEnabled()) getPackForType('click').click(); }
export function playSuccess() { if (soundsEnabled()) getPackForType('success').success(); }
export function playError() { if (soundsEnabled()) getPackForType('error').error(); }
export function playNotification() { if (soundsEnabled()) getPackForType('notification').notification(); }
export function playStartup() { if (soundsEnabled()) getPackForType('startup').startup(); }
export function playTimerDone() { if (soundsEnabled()) getPackForType('timerDone').timerDone(); }
export function playLogout() { if (soundsEnabled()) getPackForType('logout').logout(); }

/** Preview a specific sound from a specific pack (ignores enabled state) */
export function previewSound(packKey: string, sound: SoundType) {
  const pack = SOUND_PACKS[packKey];
  if (pack && typeof pack[sound] === 'function') (pack[sound] as () => void)();
}
