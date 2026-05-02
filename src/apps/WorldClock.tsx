import { useState, useEffect, useCallback } from 'react';
import { useWidgetSettings } from '../shell/Modal';
import WidgetSettingsModal, { loadAppearance, type WidgetAppearance } from '../shell/WidgetSettingsModal';
import { useShellPrefs } from '../shell/ShellPrefs';
import { ALL_TIMEZONES } from '../shell/Layout';

const DEFAULT_CLOCKS = ['Europe/London', 'Asia/Shanghai', 'America/Los_Angeles', 'America/New_York'];
const SETTINGS_KEY = 'world_clock_appearance';

/**
 * World Clock widget — same shape as Currency / Weather. Theme-aware bg via
 * `--window-content-rgb`, settings opened via the right-click menu (no
 * inline "+ Add World Clock" button anymore — that lives in the
 * <WidgetSettingsModal> alongside the appearance sliders).
 */
export default function WorldClock() {
  const [now, setNow] = useState(new Date());
  const [appearance, setAppearance] = useState(() => loadAppearance(SETTINGS_KEY));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configClocks, setConfigClocks] = useState<string[]>([]);
  const [configAppearance, setConfigAppearance] = useState<WidgetAppearance>(appearance);

  const { prefs, save } = useShellPrefs();
  const worldClocks: string[] = (prefs.world_clocks as string[] | undefined) ?? DEFAULT_CLOCKS;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(t);
  }, []);

  useWidgetSettings(useCallback(() => {
    setConfigClocks([...worldClocks]);
    setConfigAppearance({ ...appearance });
    setSettingsOpen(true);
  }, [worldClocks, appearance]));

  const fmtTime = (tz: string) => now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const fmtOffset = (tz: string) => {
    const parts = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(now);
    return parts.find(p => p.type === 'timeZoneName')?.value || '';
  };
  const fmtDate = (tz: string) => now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });

  const localTz = (typeof localStorage !== 'undefined' && localStorage.getItem('user_timezone'))
    || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const saveSettings = () => {
    if (configClocks.length === 0) return;
    save({ world_clocks: configClocks });
    setAppearance(configAppearance);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(configAppearance));
    setSettingsOpen(false);
  };

  const labelFor = (tz: string) =>
    ALL_TIMEZONES.find(t => t.tz === tz)?.label
    || tz.split('/').pop()?.replace(/_/g, ' ')
    || tz;

  return (
    <>
      {/* Theme-aware background — matches the Currency widget. */}
      <div className="flex flex-col h-full rounded-lg"
        style={{
          backgroundColor: `rgb(var(--window-content-rgb) / ${appearance.activeOpacity / 100})`,
          backdropFilter: appearance.activeBlur > 0 ? `blur(${appearance.activeBlur}px)` : undefined,
        }}>
        {/* Local time header */}
        <div className="px-3 pt-2.5 pb-2 border-b border-gray-200/50">
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Local Time</p>
          <div className="flex items-baseline justify-between mt-0.5">
            <span className="text-2xl font-semibold text-gray-800 tabular-nums">{fmtTime(localTz)}</span>
            <span className="text-[10px] text-gray-400">{fmtOffset(localTz)}</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5 truncate">{fmtDate(localTz)} · {localTz.replace(/_/g, ' ')}</p>
        </div>

        {/* Cities */}
        <div className="px-3 py-2 space-y-0.5 flex-1">
          {worldClocks.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-3">No cities — right-click to add.</p>
          )}
          {worldClocks.map(tz => (
            <div key={tz} className="flex items-center justify-between py-1.5 border-b border-gray-200/50 last:border-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{labelFor(tz)}</p>
                <p className="text-[10px] text-gray-400 tabular-nums">{fmtOffset(tz)}</p>
              </div>
              <span className="text-sm font-semibold text-gray-700 tabular-nums shrink-0">{fmtTime(tz)}</span>
            </div>
          ))}
        </div>
      </div>

      <WidgetSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="World Clock Settings"
        appearance={configAppearance} onAppearanceChange={setConfigAppearance} onSave={saveSettings}>
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Cities</h3>
          <div className="grid grid-cols-2 gap-1 max-h-56 overflow-y-auto">
            {ALL_TIMEZONES.filter(t => t.tz !== localTz).map(({ tz, label }) => (
              <label key={tz} className="flex items-center gap-2 text-sm py-1 cursor-pointer hover:bg-gray-50 rounded px-2">
                <input type="checkbox" checked={configClocks.includes(tz)}
                  onChange={() => setConfigClocks(prev => prev.includes(tz) ? prev.filter(t => t !== tz) : [...prev, tz])}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5" />
                {label}
              </label>
            ))}
          </div>
        </div>
      </WidgetSettingsModal>
    </>
  );
}
