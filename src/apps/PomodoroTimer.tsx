import { useState, useEffect, useCallback, useRef } from 'react';
import { useWidgetSettings } from '../shell/Modal';
import WidgetSettingsModal, { loadAppearance, type WidgetAppearance } from '../shell/WidgetSettingsModal';

type Mode = 'focus' | 'short' | 'long';
const POMO_SETTINGS_KEY = 'pomodoro_appearance';
const DURATIONS: Record<Mode, number> = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
const LABELS: Record<Mode, string> = { focus: 'Focus', short: 'Short', long: 'Long' };
const COLORS: Record<Mode, { ring: string; text: string }> = {
  focus: { ring: 'stroke-blue-500', text: 'text-blue-600' },
  short: { ring: 'stroke-emerald-500', text: 'text-emerald-600' },
  long: { ring: 'stroke-emerald-600', text: 'text-emerald-700' },
};

function getTodayKey() { return `pomodoro-${new Date().toISOString().slice(0, 10)}`; }
function loadCount() { return parseInt(localStorage.getItem(getTodayKey()) || '0', 10); }
function saveCount(n: number) { localStorage.setItem(getTodayKey(), String(n)); }

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 830; osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.start(); osc.stop(ctx.currentTime + 0.8);
    setTimeout(() => ctx.close(), 1000);
  } catch { /* silent fallback */ }
}

export default function PomodoroTimer() {
  const [mode, setMode] = useState<Mode>('focus');
  const [remaining, setRemaining] = useState(DURATIONS.focus);
  const [running, setRunning] = useState(false);
  const [count, setCount] = useState(loadCount);
  const [streak, setStreak] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const [appearance, setAppearance] = useState(() => loadAppearance(POMO_SETTINGS_KEY));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configAppearance, setConfigAppearance] = useState<WidgetAppearance>(appearance);

  useWidgetSettings(useCallback(() => {
    setConfigAppearance({ ...appearance });
    setSettingsOpen(true);
  }, [appearance]));

  const total = DURATIONS[mode];
  const progress = 1 - remaining / total;
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  const c = COLORS[mode];
  const R = 54, C = 2 * Math.PI * R;

  const notify = useCallback((title: string) => {
    beep();
    if (Notification.permission === 'granted') new Notification(title);
    else if (Notification.permission !== 'denied') Notification.requestPermission();
  }, []);

  const switchMode = useCallback((next: Mode) => {
    setMode(next); setRemaining(DURATIONS[next]); setRunning(false);
  }, []);

  useEffect(() => {
    if (!running) { clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => setRemaining(r => {
      if (r <= 1) { clearInterval(intervalRef.current); return 0; }
      return r - 1;
    }), 1000);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  useEffect(() => {
    if (remaining > 0 || running === false) return;
    setRunning(false);
    if (mode === 'focus') {
      const next = streak + 1;
      const newCount = count + 1;
      setStreak(next); setCount(newCount); saveCount(newCount);
      notify(next % 4 === 0 ? 'Time for a long break!' : 'Time for a short break!');
      switchMode(next % 4 === 0 ? 'long' : 'short');
    } else {
      notify('Back to work!');
      switchMode('focus');
    }
  }, [remaining, running, mode, streak, count, notify, switchMode]);

  const reset = () => { setRunning(false); setRemaining(DURATIONS[mode]); };

  return (
    <>
    <div className="flex flex-col items-center justify-between h-full p-3 select-none"
      style={{ opacity: appearance.activeOpacity / 100, backdropFilter: appearance.activeBlur > 0 ? `blur(${appearance.activeBlur}px)` : undefined }}>
      {/* Mode tabs */}
      <div className="flex gap-0.5 rounded-lg bg-gray-100 p-0.5 text-xs font-medium w-full">
        {(['focus', 'short', 'long'] as Mode[]).map(m => (
          <button key={m} onClick={() => switchMode(m)}
            className={`flex-1 px-2 py-1 rounded-md transition ${mode === m ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-200'}`}>
            {LABELS[m]}
          </button>
        ))}
      </div>

      {/* Circular timer */}
      <div className="relative" style={{ width: 210, height: 210 }}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={R} fill="none" strokeWidth="6" className="stroke-gray-200" />
          <circle cx="60" cy="60" r={R} fill="none" strokeWidth="6"
            className={`${c.ring} transition-all duration-500`}
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-mono font-bold ${c.text}`}>{mm}:{ss}</span>
          <span className="text-[10px] text-gray-400 mt-0.5">{LABELS[mode]}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2 w-full">
        <button onClick={() => setRunning(r => !r)}
          className="flex-1 py-1.5 rounded-lg text-white font-medium text-xs bg-blue-600 hover:bg-blue-700 transition">
          {running ? 'Pause' : 'Start'}
        </button>
        <button onClick={reset}
          className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition">
          Reset
        </button>
      </div>

      {/* Session dots */}
      <div className="flex items-center gap-1 text-xs text-gray-400">
        {count > 0 ? Array.from({ length: Math.min(count, 8) }, (_, i) => (
          <span key={i}>&#x1F345;</span>
        )) : <span>No sessions yet</span>}
        {count > 8 && <span>+{count - 8}</span>}
      </div>
    </div>
    <WidgetSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Pomodoro Settings"
      appearance={configAppearance} onAppearanceChange={setConfigAppearance}
      onSave={() => { setAppearance(configAppearance); localStorage.setItem(POMO_SETTINGS_KEY, JSON.stringify(configAppearance)); setSettingsOpen(false); }} />
    </>
  );
}
