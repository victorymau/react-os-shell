import { useState, useEffect, useCallback } from 'react';
import { useWidgetSettings } from '../shell/Modal';
import WidgetSettingsModal, { loadAppearance, type WidgetAppearance } from '../shell/WidgetSettingsModal';
import { useShellPrefs } from '../shell/ShellPrefs';
import { ALL_TIMEZONES } from '../shell/Layout';

const DEFAULT_CLOCKS = ['Europe/London', 'Asia/Shanghai', 'America/Los_Angeles', 'America/New_York'];
const SETTINGS_KEY = 'world_clock_appearance';

/**
 * World Clock widget — iOS-style city cards with a per-row day/night
 * gradient that flips based on the local hour at each city. Day cards use
 * a bright sky blue, night cards a deep navy — same palette as the
 * Weather widget so the two read as a set when stacked.
 *
 * Settings (city list + appearance sliders) live in the right-click menu
 * via `useWidgetSettings` — there is no inline "+ Add World Clock"
 * button. Translucency is applied as a background-color alpha on the
 * outer panel (slate-900 base) so the row gradients stay vivid even at
 * lower opacity.
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

  /** Local hour (0–23) at the given timezone — used to flip day/night. */
  const hourIn = (tz: string): number => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).formatToParts(now);
      const h = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
      // `hourCycle: h23` would be cleanest but isn't universally supported;
      // `hour12: false` returns 24 for midnight on some Node versions, so
      // normalize that to 0.
      return h === 24 ? 0 : h;
    } catch { return 12; }
  };
  /** Crude sunrise/sunset proxy — good enough for "should this card look
   *  bright or dark." Real solar calc would need the city's latitude. */
  const isDay = (tz: string) => { const h = hourIn(tz); return h >= 6 && h < 18; };

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

  // Local time gets the "featured" card at the top, then the user's chosen
  // cities. Each card is its own day/night-coloured tile sitting on the
  // panel's slate backdrop with `gap-2` between cards — same idiom as
  // Weather.
  const cards = [{ tz: localTz, isLocal: true }, ...worldClocks.map(tz => ({ tz, isLocal: false }))];

  // Card heights: featured local-time card is taller (3 lines + larger
  // time), each city card is ~76 px. Plus the panel's p-2 padding.
  const dynamicHeight = 96 /* local card */ + worldClocks.length * 84 /* city cards */ + 16;

  return (
    <>
      <div className="flex flex-col rounded-lg text-white overflow-hidden"
        style={{
          minHeight: dynamicHeight,
          backgroundColor: `rgba(15, 23, 42, ${appearance.activeOpacity / 100})`,
          backdropFilter: appearance.activeBlur > 0 ? `blur(${appearance.activeBlur}px)` : undefined,
        }}>
        <div className="flex-1 flex flex-col gap-2 p-2">
          {cards.map(({ tz, isLocal }) => {
            const day = isDay(tz);
            const rowBg = day
              ? 'bg-gradient-to-br from-sky-400 via-sky-300 to-sky-500'
              : 'bg-gradient-to-br from-slate-800 via-blue-950 to-slate-900';
            const sub = isLocal
              ? `${fmtDate(tz)} · ${tz.replace(/_/g, ' ')}`
              : `${fmtDate(tz)} · ${fmtOffset(tz)}`;
            return (
              <div key={(isLocal ? 'local-' : '') + tz}
                className={`rounded-2xl px-4 py-3 flex items-center justify-between gap-3 ${rowBg}`}>
                <div className="min-w-0 flex-1">
                  {isLocal && (
                    <div className="text-[10px] uppercase tracking-wide opacity-80 mb-0.5">Local Time</div>
                  )}
                  <div className="text-base font-semibold leading-tight truncate">{labelFor(tz)}</div>
                  <div className="text-[10px] opacity-90 truncate mt-0.5">{sub}</div>
                </div>
                <div className={`${isLocal ? 'text-3xl' : 'text-2xl'} font-extralight leading-none tracking-tight tabular-nums shrink-0`}>
                  {fmtTime(tz)}
                </div>
              </div>
            );
          })}
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
