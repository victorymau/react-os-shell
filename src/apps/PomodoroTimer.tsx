import { useEffect, useState, useCallback, useSyncExternalStore, useRef } from 'react';
import { useWidgetSettings } from '../shell/Modal';
import WidgetSettingsModal, { loadAppearance, type WidgetAppearance } from '../shell/WidgetSettingsModal';
import { useShellPrefs } from '../shell/ShellPrefs';
import {
  ALARM_OPTIONS, FOCUS_SOUND_OPTIONS,
  getPomoSnapshot, subscribePomo,
  setPomoDurations, setPomoAlarm, setPomoAlarmConfig, setPomoBehaviour, setPomoFocusSound,
  pomoStart, pomoPause, pomoSwitchMode,
  playAlarm, previewFocusSound,
  type AlarmSound, type FocusSound, type Mode,
} from '../shell/pomodoroStore';

const POMO_SETTINGS_KEY = 'pomodoro_appearance';
const TASKS_KEY = 'pomodoro_tasks';
const ACTIVE_TASK_KEY = 'pomodoro_active_task_id';

const MODE_LABELS: Record<Mode, string> = { focus: 'Pomodoro', short: 'Short Break', long: 'Long Break' };
/**
 * Per-mode background colour. The break modes keep their own colours so
 * a glance at the panel tells you what state you're in. Focus mode is
 * special — its panel uses `--taskbar-bg-rgb` so the widget matches the
 * taskbar (and the rest of the dashboard widgets) across light and dark
 * themes. The hex below is only used for the START / Save accent colour
 * in focus mode.
 */
const MODE_COLORS: Record<Mode, string> = {
  focus: '#0f172a',  // unused for the panel; only for focus-mode accents
  short: '#508a52',  // muted green
  long:  '#5b7898',  // slate blue
};

/** Convert `#rrggbb` to an `rgba(r, g, b, alpha)` string so the break
 *  panels pick up the user's translucency setting via the alpha channel
 *  (instead of an `opacity` on the whole element, which would also fade
 *  the text and the START button). */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface PomoPrefs {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  autoStartBreaks: boolean;
  autoStartPomodoros: boolean;
  longBreakInterval: number;
  autoCheckTasks: boolean;
  checkToBottom: boolean;
  alarmSound: AlarmSound;
  alarmVolume: number;
  alarmRepeat: number;
  focusSound: FocusSound;
  focusVolume: number;
}
const DEFAULT_PREFS: PomoPrefs = {
  focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15,
  autoStartBreaks: false, autoStartPomodoros: false, longBreakInterval: 4,
  autoCheckTasks: true, checkToBottom: true,
  alarmSound: 'bell', alarmVolume: 100, alarmRepeat: 1,
  focusSound: 'none', focusVolume: 50,
};

const intInRange = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : fallback;

function readPrefs(raw: unknown): PomoPrefs {
  const p = (raw && typeof raw === 'object') ? raw as Partial<PomoPrefs> : {};
  return {
    focusMinutes:        intInRange(p.focusMinutes,        1, 120, DEFAULT_PREFS.focusMinutes),
    shortBreakMinutes:   intInRange(p.shortBreakMinutes,   1, 120, DEFAULT_PREFS.shortBreakMinutes),
    longBreakMinutes:    intInRange(p.longBreakMinutes,    1, 120, DEFAULT_PREFS.longBreakMinutes),
    autoStartBreaks:     typeof p.autoStartBreaks === 'boolean' ? p.autoStartBreaks : DEFAULT_PREFS.autoStartBreaks,
    autoStartPomodoros:  typeof p.autoStartPomodoros === 'boolean' ? p.autoStartPomodoros : DEFAULT_PREFS.autoStartPomodoros,
    longBreakInterval:   intInRange(p.longBreakInterval,   1, 20, DEFAULT_PREFS.longBreakInterval),
    autoCheckTasks:      typeof p.autoCheckTasks === 'boolean' ? p.autoCheckTasks : DEFAULT_PREFS.autoCheckTasks,
    checkToBottom:       typeof p.checkToBottom === 'boolean' ? p.checkToBottom : DEFAULT_PREFS.checkToBottom,
    alarmSound:          ALARM_OPTIONS.some(o => o.id === p.alarmSound) ? p.alarmSound as AlarmSound : DEFAULT_PREFS.alarmSound,
    alarmVolume:         intInRange(p.alarmVolume,         0, 100, DEFAULT_PREFS.alarmVolume),
    alarmRepeat:         intInRange(p.alarmRepeat,         1, 5,   DEFAULT_PREFS.alarmRepeat),
    focusSound:          FOCUS_SOUND_OPTIONS.some(o => o.id === p.focusSound) ? p.focusSound as FocusSound : DEFAULT_PREFS.focusSound,
    focusVolume:         intInRange(p.focusVolume,         0, 100, DEFAULT_PREFS.focusVolume),
  };
}

interface PomoTask {
  id: string;
  name: string;
  estimated: number;
  completed: number;
  done: boolean;
}

function loadTasks(): PomoTask[] {
  try {
    const raw = JSON.parse(localStorage.getItem(TASKS_KEY) || '[]');
    if (Array.isArray(raw)) return raw;
  } catch {}
  return [];
}
function uid() { return Math.random().toString(36).slice(2, 9); }

const sortDoneToBottom = (arr: PomoTask[]): PomoTask[] => {
  const undone: PomoTask[] = [];
  const done: PomoTask[] = [];
  for (const t of arr) (t.done ? done : undone).push(t);
  return [...undone, ...done];
};

export default function PomodoroTimer() {
  const snap = useSyncExternalStore(subscribePomo, getPomoSnapshot, getPomoSnapshot);
  const { prefs: shellPrefs, save: saveShellPrefs } = useShellPrefs();
  const userPrefs = readPrefs(shellPrefs.pomodoro_settings);

  // Sync prefs → store. Split into focused effects so each setting only
  // resets the bit it owns (e.g. flipping the alarm volume doesn't tear
  // down the focus-sound playback).
  useEffect(() => {
    setPomoDurations({
      focus: userPrefs.focusMinutes * 60,
      short: userPrefs.shortBreakMinutes * 60,
      long: userPrefs.longBreakMinutes * 60,
    });
  }, [userPrefs.focusMinutes, userPrefs.shortBreakMinutes, userPrefs.longBreakMinutes]);

  useEffect(() => {
    setPomoAlarm(userPrefs.alarmSound);
    setPomoAlarmConfig(userPrefs.alarmVolume, userPrefs.alarmRepeat);
  }, [userPrefs.alarmSound, userPrefs.alarmVolume, userPrefs.alarmRepeat]);

  useEffect(() => {
    setPomoBehaviour({
      autoStartBreaks: userPrefs.autoStartBreaks,
      autoStartPomodoros: userPrefs.autoStartPomodoros,
      longBreakInterval: userPrefs.longBreakInterval,
    });
  }, [userPrefs.autoStartBreaks, userPrefs.autoStartPomodoros, userPrefs.longBreakInterval]);

  useEffect(() => {
    setPomoFocusSound(userPrefs.focusSound, userPrefs.focusVolume);
  }, [userPrefs.focusSound, userPrefs.focusVolume]);

  // Ask once for desktop-notification permission.
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try { Notification.requestPermission(); } catch {}
    }
  }, []);

  // ── Tasks ──
  const [tasks, setTasks] = useState<PomoTask[]>(loadTasks);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(() => localStorage.getItem(ACTIVE_TASK_KEY));
  const [adding, setAdding] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => { try { localStorage.setItem(TASKS_KEY, JSON.stringify(tasks)); } catch {} }, [tasks]);
  useEffect(() => {
    try {
      if (activeTaskId) localStorage.setItem(ACTIVE_TASK_KEY, activeTaskId);
      else localStorage.removeItem(ACTIVE_TASK_KEY);
    } catch {}
  }, [activeTaskId]);

  // Close the row menu on any outside click.
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = () => setMenuOpenId(null);
    const t = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(t); document.removeEventListener('click', handler); };
  }, [menuOpenId]);

  // When a focus block completes (`streak` increments), bump the active
  // task's completed count. If `autoCheckTasks` is on and it hits the
  // estimate, mark it done. If `checkToBottom` is on, reorder.
  const lastStreakRef = useRef(snap.streak);
  useEffect(() => {
    if (snap.streak > lastStreakRef.current) {
      setTasks(prev => {
        const next = prev.map(t => {
          if (t.id !== activeTaskId) return t;
          const completed = t.completed + 1;
          const shouldAutoCheck = userPrefs.autoCheckTasks && completed >= t.estimated;
          return { ...t, completed, done: t.done || shouldAutoCheck };
        });
        return userPrefs.checkToBottom ? sortDoneToBottom(next) : next;
      });
    }
    lastStreakRef.current = snap.streak;
  }, [snap.streak, activeTaskId, userPrefs.autoCheckTasks, userPrefs.checkToBottom]);

  const addTask = (name: string, estimated: number) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const t: PomoTask = { id: uid(), name: trimmed, estimated, completed: 0, done: false };
    setTasks(prev => [...prev, t]);
    if (!activeTaskId) setActiveTaskId(t.id);
    setAdding(false);
  };
  const removeTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    if (activeTaskId === id) setActiveTaskId(null);
    setMenuOpenId(null);
  };
  const toggleDone = (id: string) => {
    setTasks(prev => {
      const next = prev.map(t => t.id === id ? { ...t, done: !t.done } : t);
      return userPrefs.checkToBottom ? sortDoneToBottom(next) : next;
    });
  };

  // ── Stats ──
  const totalCompleted = tasks.reduce((acc, t) => acc + t.completed, 0);
  const totalEstimated = tasks.reduce((acc, t) => acc + Math.max(t.estimated, t.completed), 0);
  const remainingPomos = tasks.reduce((acc, t) => t.done ? acc : acc + Math.max(0, t.estimated - t.completed), 0);
  const remainingSecsFromTimer = (snap.running && snap.mode === 'focus') ? snap.remaining : 0;
  const remainingSecs = remainingPomos * userPrefs.focusMinutes * 60 + remainingSecsFromTimer;
  const finishAt = new Date(Date.now() + remainingSecs * 1000);
  const finishAtStr = finishAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const totalHours = (remainingSecs / 3600).toFixed(1);

  const activeIdx = activeTaskId ? tasks.findIndex(t => t.id === activeTaskId) : -1;
  const activeTask = activeIdx >= 0 ? tasks[activeIdx] : null;

  const mm = String(Math.floor(snap.remaining / 60)).padStart(2, '0');
  const ss = String(snap.remaining % 60).padStart(2, '0');

  // ── Settings modal ──
  const [appearance, setAppearance] = useState(() => loadAppearance(POMO_SETTINGS_KEY));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configAppearance, setConfigAppearance] = useState<WidgetAppearance>(appearance);
  const [configPrefs, setConfigPrefs] = useState<PomoPrefs>(userPrefs);

  useWidgetSettings(useCallback(() => {
    setConfigAppearance({ ...appearance });
    setConfigPrefs({ ...userPrefs });
    setSettingsOpen(true);
  }, [appearance, userPrefs]));

  const onSave = () => {
    setAppearance(configAppearance);
    localStorage.setItem(POMO_SETTINGS_KEY, JSON.stringify(configAppearance));
    saveShellPrefs({ pomodoro_settings: configPrefs });
    setSettingsOpen(false);
  };

  // Focus mode: panel takes the taskbar's colour (light or dark per
  // theme), text inherits the system theme via Tailwind gray-* classes.
  // Break modes: keep their hex-based colored panels with white text.
  const isColored = snap.mode !== 'focus';
  const bg = MODE_COLORS[snap.mode];
  const panelBg = isColored
    ? hexToRgba(bg, appearance.activeOpacity / 100)
    : `rgb(var(--taskbar-bg-rgb, 243 244 246) / ${appearance.activeOpacity / 100})`;

  // Class helpers — switch text colours based on whether the panel is a
  // bright break colour or the (theme-aware) focus panel.
  const tx = {
    primary:    isColored ? 'text-white'        : 'text-gray-900',
    secondary:  isColored ? 'text-white/85'     : 'text-gray-700',
    muted:      isColored ? 'text-white/65'     : 'text-gray-500',
    faded:      isColored ? 'text-white/55'     : 'text-gray-400',
    tabActive:  isColored ? 'bg-white/15 text-white'                   : 'bg-gray-200 text-gray-900',
    tabInactive: isColored ? 'text-white/75 hover:bg-white/10'         : 'text-gray-500 hover:bg-gray-200',
    divider:    isColored ? 'border-white/30'   : 'border-gray-200',
    softDivider: isColored ? 'border-white/20'  : 'border-gray-200',
    iconBtn:    isColored ? 'bg-black/15 hover:bg-black/25 text-white/85' : 'bg-gray-200 hover:bg-gray-300 text-gray-600',
    addTaskBtn: isColored ? 'border-white/45 text-white/90 hover:bg-white/[0.06]' : 'border-gray-300 text-gray-500 hover:bg-gray-200/50',
  };
  // START / Save accent colour: in colored modes use the mode hex; in
  // focus mode use a fixed dark slate so the white pill stays high-
  // contrast on both light and dark themes.
  const accentColor = isColored ? bg : '#0f172a';

  return (
    <>
      <div className={`flex flex-col h-full select-none rounded-2xl overflow-hidden ring-1 ring-gray-200 transition-colors duration-300 ${tx.primary}`}
        style={{
          backgroundColor: panelBg,
          backdropFilter: appearance.activeBlur > 0 ? `blur(${appearance.activeBlur}px)` : undefined,
        }}>

        {/* Mode tabs */}
        <div className="px-3 pt-3 flex justify-center gap-1.5">
          {(['focus', 'short', 'long'] as Mode[]).map(m => (
            <button key={m} onClick={() => pomoSwitchMode(m)}
              className={`px-2.5 py-1 text-[13px] font-bold rounded transition-colors ${snap.mode === m ? tx.tabActive : tx.tabInactive}`}>
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Big timer */}
        <div className="text-center font-bold tabular-nums leading-none tracking-tight mt-3" style={{ fontSize: '4.5rem' }}>
          {mm}:{ss}
        </div>

        {/* START / PAUSE button */}
        <div className="flex justify-center mt-3 mb-2">
          <button onClick={() => snap.running ? pomoPause() : pomoStart()}
            className="bg-white px-12 py-2.5 rounded-md font-bold text-base shadow-[0_4px_0_rgba(0,0,0,0.12)] hover:shadow-[0_3px_0_rgba(0,0,0,0.12)] active:translate-y-1 active:shadow-none transition-all"
            style={{ color: accentColor, letterSpacing: '0.08em' }}>
            {snap.running ? 'PAUSE' : 'START'}
          </button>
        </div>

        {/* Active task indicator */}
        <div className="px-3 py-3 text-center">
          {activeTask ? (
            <>
              <div className={`text-xs leading-tight ${tx.muted}`}>#{activeTask.completed + 1}</div>
              <div className={`text-[15px] font-medium leading-tight truncate mt-0.5 ${tx.primary}`}>{activeTask.name}</div>
            </>
          ) : (
            <div className={`text-xs italic ${tx.muted}`}>No task selected</div>
          )}
        </div>

        {/* Tasks header */}
        <div className="px-3 mt-1 flex items-center justify-between">
          <h3 className={`text-base font-bold tracking-tight ${tx.primary}`}>Tasks</h3>
          <button className={`rounded p-1 transition-colors ${tx.iconBtn}`} aria-label="Tasks menu" tabIndex={-1}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" />
            </svg>
          </button>
        </div>
        <div className={`border-t mx-3 mt-2 ${tx.divider}`} />

        {/* Tasks list */}
        <div className="flex-1 px-3 py-3 space-y-2 overflow-y-auto">
          {tasks.map(task => {
            const isActive = task.id === activeTaskId;
            return (
              <div key={task.id}
                onClick={() => setActiveTaskId(task.id)}
                className={`bg-white text-gray-800 rounded-md flex items-center pr-2 py-2.5 shadow-sm cursor-pointer transition-shadow hover:shadow-md ${isActive ? 'border-l-4 border-gray-700 pl-2' : 'pl-3 border-l-4 border-transparent'}`}>
                <button onClick={(e) => { e.stopPropagation(); toggleDone(task.id); }}
                  className="shrink-0">
                  {task.done ? (
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" style={{ color: accentColor }}>
                      <path d="M10 0a10 10 0 100 20 10 10 0 000-20zm-1 14.5l-4.5-4.5 1.4-1.4 3.1 3.1 6.1-6.1 1.4 1.4z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-gray-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                  )}
                </button>
                <span className={`ml-3 flex-1 font-semibold truncate ${task.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                  {task.name}
                </span>
                <span className="text-sm tabular-nums mr-1.5 shrink-0">
                  <span className="font-bold text-gray-500">{task.completed}</span>
                  <span className="text-gray-400"> / </span>
                  <span className="text-gray-400">{task.estimated}</span>
                </span>
                <div className="relative">
                  <button onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === task.id ? null : task.id); }}
                    className="rounded p-1 bg-gray-100 hover:bg-gray-200">
                    <svg className="h-4 w-4 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" />
                    </svg>
                  </button>
                  {menuOpenId === task.id && (
                    <div className="absolute right-0 top-full mt-1 bg-white text-gray-800 rounded shadow-lg border border-gray-200 z-10 min-w-[110px] overflow-hidden"
                      onClick={(e) => e.stopPropagation()}>
                      <button onClick={(e) => { e.stopPropagation(); removeTask(task.id); }}
                        className="block w-full px-3 py-1.5 text-sm text-left hover:bg-red-50 text-red-600">Delete</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* + Add Task */}
          {!adding ? (
            <button onClick={() => setAdding(true)}
              className={`w-full border-2 border-dashed rounded-md py-3 font-semibold flex items-center justify-center gap-2 transition-colors ${tx.addTaskBtn}`}>
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" />
                <path strokeLinecap="round" d="M8 12h8M12 8v8" />
              </svg>
              Add Task
            </button>
          ) : (
            <AddTaskForm onSubmit={addTask} onCancel={() => setAdding(false)} accentColor={accentColor} />
          )}
        </div>

        {/* Footer stats */}
        <div className={`border-t px-3 py-2.5 flex items-center justify-center gap-5 text-sm ${tx.softDivider}`}>
          <span className={tx.secondary}>
            Pomos: <span className={`font-bold ${tx.primary}`}>{totalCompleted}</span>
            <span className={tx.muted}> / </span>
            <span className={`font-bold ${tx.primary}`}>{totalEstimated}</span>
          </span>
          {remainingSecs > 0 && (
            <span className={tx.secondary}>
              Finish At: <span className={`font-bold ${tx.primary}`}>{finishAtStr}</span>
              <span className={tx.muted}> ({totalHours}h)</span>
            </span>
          )}
        </div>
      </div>

      <PomodoroSettings
        open={settingsOpen} onClose={() => setSettingsOpen(false)} onSave={onSave}
        configAppearance={configAppearance} setConfigAppearance={setConfigAppearance}
        configPrefs={configPrefs} setConfigPrefs={setConfigPrefs} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Settings UI — three sectioned cards (TIMER / TASK / SOUND) matching the
// reference design. Renders into the standard `WidgetSettingsModal` so we
// inherit its appearance sliders and the modal chrome.
// ─────────────────────────────────────────────────────────────────────────

function PomodoroSettings({
  open, onClose, onSave, configAppearance, setConfigAppearance, configPrefs, setConfigPrefs,
}: {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  configAppearance: WidgetAppearance;
  setConfigAppearance: (a: WidgetAppearance) => void;
  configPrefs: PomoPrefs;
  setConfigPrefs: React.Dispatch<React.SetStateAction<PomoPrefs>>;
}) {
  const set = <K extends keyof PomoPrefs>(k: K, v: PomoPrefs[K]) => setConfigPrefs(p => ({ ...p, [k]: v }));

  return (
    <WidgetSettingsModal open={open} onClose={onClose} title="Pomodoro Settings"
      appearance={configAppearance} onAppearanceChange={setConfigAppearance} onSave={onSave}>

      {/* ── TIMER ── */}
      <Section icon={<ClockIcon />} label="TIMER">
        <div>
          <p className="text-sm font-bold text-gray-800 mb-2">Time (minutes)</p>
          <div className="grid grid-cols-3 gap-3">
            <NumberField label="Pomodoro"    value={configPrefs.focusMinutes}      onChange={v => set('focusMinutes', v)}      max={120} />
            <NumberField label="Short Break" value={configPrefs.shortBreakMinutes} onChange={v => set('shortBreakMinutes', v)} max={120} />
            <NumberField label="Long Break"  value={configPrefs.longBreakMinutes}  onChange={v => set('longBreakMinutes', v)}  max={120} />
          </div>
        </div>

        <Row label="Auto Start Breaks">
          <Toggle checked={configPrefs.autoStartBreaks} onChange={v => set('autoStartBreaks', v)} />
        </Row>

        <Row label="Auto Start Pomodoros">
          <Toggle checked={configPrefs.autoStartPomodoros} onChange={v => set('autoStartPomodoros', v)} />
        </Row>

        <Row label="Long Break interval">
          <NumberInput value={configPrefs.longBreakInterval} onChange={v => set('longBreakInterval', v)} min={1} max={20} className="w-14 text-center" />
        </Row>
      </Section>

      {/* ── TASK ── */}
      <Section icon={<TaskIcon />} label="TASK">
        <Row
          label="Auto Check Tasks"
          info={'If you enable "Auto Check Tasks", the active task will be automatically checked when the actual pomodoro count reaches the estimated count.'}>
          <Toggle checked={configPrefs.autoCheckTasks} onChange={v => set('autoCheckTasks', v)} />
        </Row>
        <Row
          label="Check to Bottom"
          info={'If you enable "Check to Bottom", the checked task will be automatically moved to the bottom of the task list.'}>
          <Toggle checked={configPrefs.checkToBottom} onChange={v => set('checkToBottom', v)} />
        </Row>
      </Section>

      {/* ── SOUND ── */}
      <Section icon={<SpeakerIcon />} label="SOUND">
        <Row label="Alarm Sound">
          <div className="flex items-center gap-2">
            <Dropdown value={configPrefs.alarmSound} onChange={v => set('alarmSound', v as AlarmSound)}
              options={ALARM_OPTIONS.map(o => ({ id: o.id, label: o.label }))} />
            {configPrefs.alarmSound !== 'off' && (
              <button type="button" onClick={() => playAlarm(configPrefs.alarmSound, { volume: configPrefs.alarmVolume, repeat: 1 })}
                className="px-2 py-1 text-[11px] rounded border border-gray-300 text-gray-600 hover:bg-gray-100">
                Play
              </button>
            )}
          </div>
        </Row>
        <SliderRow value={configPrefs.alarmVolume} onChange={v => set('alarmVolume', v)} />
        <Row label="repeat">
          <NumberInput value={configPrefs.alarmRepeat} onChange={v => set('alarmRepeat', v)} min={1} max={5} className="w-14 text-center" />
        </Row>

        <Row label="Focus Sound">
          <div className="flex items-center gap-2">
            <Dropdown value={configPrefs.focusSound} onChange={v => set('focusSound', v as FocusSound)}
              options={FOCUS_SOUND_OPTIONS} />
            {configPrefs.focusSound !== 'none' && (
              <button type="button" onClick={() => previewFocusSound(configPrefs.focusSound, configPrefs.focusVolume)}
                className="px-2 py-1 text-[11px] rounded border border-gray-300 text-gray-600 hover:bg-gray-100">
                Play
              </button>
            )}
          </div>
        </Row>
        <SliderRow value={configPrefs.focusVolume} onChange={v => set('focusVolume', v)} />
      </Section>
    </WidgetSettingsModal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tiny presentational helpers — kept here (not exported) so the settings
// markup above reads top-to-bottom without any noise.
// ─────────────────────────────────────────────────────────────────────────

function Section({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-gray-200 pt-3 first:border-0 first:pt-0">
      <div className="flex items-center gap-1.5 mb-3 text-gray-400">
        {icon}
        <span className="text-xs font-bold tracking-[0.15em]">{label}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, info, children }: { label: string; info?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-sm font-semibold text-gray-800">{label}</span>
        {info && <InfoIcon title={info} />}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SliderRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-end gap-3">
      <span className="text-xs text-gray-400 w-7 text-right tabular-nums">{value}</span>
      <input type="range" min={0} max={100} value={value}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        className="w-40 accent-blue-500" />
    </div>
  );
}

function NumberField({ label, value, onChange, min = 1, max = 99 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <label className="flex flex-col">
      <span className="text-xs font-semibold text-gray-500 mb-1">{label}</span>
      <NumberInput value={value} onChange={onChange} min={min} max={max} />
    </label>
  );
}

function NumberInput({ value, onChange, min = 1, max = 99, className = '' }: { value: number; onChange: (v: number) => void; min?: number; max?: number; className?: string }) {
  return (
    <input type="number" min={min} max={max} value={value}
      onChange={e => onChange(Math.max(min, Math.min(max, parseInt(e.target.value, 10) || min)))}
      className={`bg-gray-100 border-0 rounded-md px-2 py-1.5 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full ${className}`} />
  );
}

function Dropdown<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value as T)}
        className="appearance-none bg-gray-100 border-0 rounded-md pl-3 pr-8 py-1.5 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <svg className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-gray-300'}`}>
      <span className={`absolute h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

function InfoIcon({ title }: { title: string }) {
  return (
    <span title={title} className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-300 text-white text-[10px] font-bold cursor-help">i</span>
  );
}

function ClockIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
    </svg>
  );
}

function TaskIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H2v6h4l5 4V5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 8.5a5 5 0 010 7M19 5a9 9 0 010 14" />
    </svg>
  );
}

function AddTaskForm({ onSubmit, onCancel, accentColor }: { onSubmit: (name: string, estimated: number) => void; onCancel: () => void; accentColor: string }) {
  const [name, setName] = useState('');
  const [est, setEst] = useState(1);
  const submit = () => onSubmit(name, est);
  return (
    <div className="bg-white text-gray-800 rounded-md p-3 shadow-md">
      <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="What are you working on?"
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
        className="w-full text-base font-medium bg-transparent border-0 outline-none placeholder-gray-400" />
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs font-semibold text-gray-500">Est Pomodoros</span>
        <input type="number" min={1} max={20} value={est}
          onChange={e => setEst(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))}
          className="w-16 bg-gray-100 rounded px-2 py-1 text-sm text-right border-0 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div className="flex gap-2 mt-3 justify-end">
        <button onClick={onCancel} className="px-3 py-1 text-sm text-gray-500 hover:bg-gray-100 rounded">Cancel</button>
        <button onClick={submit}
          className="px-4 py-1 text-sm font-semibold text-white rounded shadow-sm"
          style={{ backgroundColor: accentColor }}>Save</button>
      </div>
    </div>
  );
}
