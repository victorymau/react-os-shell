import { useState, useEffect, useCallback } from 'react';
import { useWidgetSettings } from '../shell/Modal';
import WidgetSettingsModal, { loadAppearance, type WidgetAppearance } from '../shell/WidgetSettingsModal';
import { useShellPrefs } from '../shell/ShellPrefs';
import { AVAILABLE_CITIES, fetchCityWeather, getCondition, toFahrenheit, type CityWeather } from './_weatherData';

const SETTINGS_KEY = 'world_clock_appearance';
const DEFAULT_CITIES = ['London', 'Shanghai', 'New York'];

interface WeatherPrefs { useFahrenheit: boolean }

/**
 * Minimalist analogue clock face — no numerals, just four small dots at
 * the cardinal hours and two thin white hands. Returns both the SVG and
 * the AM/PM marker so the row can stack them vertically with consistent
 * spacing.
 */
function AnalogClockWithMeridiem({ tz, now, size = 30 }: { tz: string; now: Date; size?: number }) {
  let h24 = 0, m = 0;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: false,
    }).formatToParts(now);
    h24 = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    if (h24 === 24) h24 = 0;
    m = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  } catch {}

  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const hourAngle = ((h24 % 12) + m / 60) * 30 - 90;
  const minuteAngle = m * 6 - 90;
  const r = size / 2;
  const hLen = r * 0.52;
  const mLen = r * 0.78;
  const hRad = (hourAngle * Math.PI) / 180;
  const mRad = (minuteAngle * Math.PI) / 180;

  // Use currentColor + opacity so the clock face inherits the panel's
  // text colour — black-ish in light themes, light-grey in dark mode.
  return (
    <div className="flex flex-col items-center gap-0.5 shrink-0 text-gray-700">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ color: 'currentColor' }}>
        <circle cx={r} cy={r} r={r - 0.6} fill="currentColor" fillOpacity={0.05}
          stroke="currentColor" strokeOpacity={0.4} strokeWidth={0.8} />
        {[0, 90, 180, 270].map(deg => {
          const a = (deg - 90) * Math.PI / 180;
          const dx = r + Math.cos(a) * (r * 0.83);
          const dy = r + Math.sin(a) * (r * 0.83);
          return <circle key={deg} cx={dx} cy={dy} r={0.85} fill="currentColor" fillOpacity={0.55} />;
        })}
        <line x1={r} y1={r}
          x2={r + Math.cos(hRad) * hLen} y2={r + Math.sin(hRad) * hLen}
          stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        <line x1={r} y1={r}
          x2={r + Math.cos(mRad) * mLen} y2={r + Math.sin(mRad) * mLen}
          stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" />
        <circle cx={r} cy={r} r={1.3} fill="currentColor" />
      </svg>
      <span className="text-[8.5px] font-medium tracking-[0.12em] text-gray-500">{ampm}</span>
    </div>
  );
}

/**
 * World Clock widget — multi-city list. Each row pairs a tiny analogue
 * clock (minimal-style: ring, four cardinal dots, two hands) with the
 * city's current weather. The weather emoji doubles as a day/night cue
 * (☀ vs 🌙 for clear, the same icons for everything else). Reads the
 * shared Open-Meteo cache so it doesn't re-hit the API when the Weather
 * widget already has the data.
 */
export default function WorldClock() {
  const { prefs, save } = useShellPrefs();
  const [appearance, setAppearance] = useState(() => loadAppearance(SETTINGS_KEY));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configCities, setConfigCities] = useState<string[]>([]);
  const [configAppearance, setConfigAppearance] = useState<WidgetAppearance>(appearance);

  const wxPrefs: WeatherPrefs = {
    useFahrenheit: !!(prefs.weather_prefs as WeatherPrefs | undefined)?.useFahrenheit,
  };
  const [configWxPrefs, setConfigWxPrefs] = useState(wxPrefs);

  // Tick once every 30 s so the analogue minute-hands drift smoothly. We
  // don't show seconds so faster polling is wasted re-renders.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  // Resolve the saved city list and migrate the legacy IANA-timezone
  // format (`Europe/London`) over to the new city-name format
  // (`London`).
  const tzToCity: Record<string, string> = Object.fromEntries(
    Object.entries(AVAILABLE_CITIES).map(([city, info]) => [info.tz, city])
  );
  const rawClocks = prefs.world_clocks as string[] | undefined;
  const cities: string[] = (() => {
    if (!Array.isArray(rawClocks) || rawClocks.length === 0) return DEFAULT_CITIES;
    const out: string[] = [];
    for (const v of rawClocks) {
      const asCity = AVAILABLE_CITIES[v] ? v : tzToCity[v];
      if (asCity && !out.includes(asCity)) out.push(asCity);
    }
    return out.length ? out : DEFAULT_CITIES;
  })();

  const [data, setData] = useState<Record<string, CityWeather>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const next: Record<string, CityWeather> = {};
      await Promise.all(cities.map(async c => {
        const w = await fetchCityWeather(c);
        if (w) next[c] = w;
      }));
      if (!cancelled) { setData(next); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [cities.join(',')]);

  useWidgetSettings(useCallback(() => {
    setConfigCities([...cities]);
    setConfigAppearance({ ...appearance });
    setConfigWxPrefs({ ...wxPrefs });
    setSettingsOpen(true);
  }, [cities.join(','), appearance, wxPrefs.useFahrenheit]));

  const saveSettings = () => {
    if (configCities.length === 0) return;
    save({
      world_clocks: configCities,
      weather_prefs: { ...(prefs.weather_prefs as object | undefined ?? {}), useFahrenheit: configWxPrefs.useFahrenheit },
    });
    setAppearance(configAppearance);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(configAppearance));
    setSettingsOpen(false);
  };

  const formatTemp = (c: number) => wxPrefs.useFahrenheit ? `${toFahrenheit(c)}°` : `${c}°`;

  return (
    <>
      {/* Theme-aware panel — same colour as the taskbar so all dashboard
       *  widgets read as a coordinated set across light and dark themes. */}
      <div className="rounded-2xl overflow-hidden ring-1 ring-gray-200"
        style={{
          backgroundColor: `rgb(var(--taskbar-bg-rgb, 243 244 246) / ${appearance.activeOpacity / 100})`,
          backdropFilter: appearance.activeBlur > 0 ? `blur(${appearance.activeBlur}px)` : undefined,
        }}>
        <div className="px-1 py-1">
          {loading && cities.every(c => !data[c]) && (
            <div className="px-3 py-6 text-center text-xs text-gray-500">Loading…</div>
          )}
          {cities.map((cityName, i) => {
            const w = data[cityName];
            const tz = AVAILABLE_CITIES[cityName]?.tz ?? 'UTC';
            const last = i === cities.length - 1;
            if (!w) {
              return (
                <div key={cityName} className={`flex items-center gap-3 px-3 py-3 ${last ? '' : 'border-b border-gray-200'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-semibold tracking-tight leading-tight truncate text-gray-900">{cityName}</div>
                    <div className="text-[11px] text-gray-500 leading-tight">…</div>
                  </div>
                  <AnalogClockWithMeridiem tz={tz} now={now} />
                </div>
              );
            }
            const [condition, emoji] = getCondition(w.code, w.isDay);
            return (
              <div key={cityName}
                className={`flex items-center gap-3 px-3 py-3 ${last ? '' : 'border-b border-gray-200'}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold tracking-tight leading-tight truncate text-gray-900">{cityName}</div>
                  <div className="text-[11px] text-gray-500 leading-tight truncate mt-0.5">{condition}</div>
                </div>
                <AnalogClockWithMeridiem tz={tz} now={now} />
                <span className="text-[22px] leading-none shrink-0">{emoji}</span>
                <div className="text-right shrink-0 min-w-[52px]">
                  <div className="text-[22px] font-extralight leading-none tabular-nums tracking-tight text-gray-900">{formatTemp(w.temp)}</div>
                  <div className="text-[10px] text-gray-500 tabular-nums mt-1">H:{formatTemp(w.high)} L:{formatTemp(w.low)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <WidgetSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="World Clock Settings"
        appearance={configAppearance} onAppearanceChange={setConfigAppearance} onSave={saveSettings}>
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Display</h3>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm text-gray-600 w-24">Temperature</span>
            <div className="flex gap-1">
              {([{ key: false, label: '°C' }, { key: true, label: '°F' }] as const).map(o => (
                <button key={String(o.key)} onClick={() => setConfigWxPrefs(p => ({ ...p, useFahrenheit: o.key }))}
                  className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${configWxPrefs.useFahrenheit === o.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">Shared with the Weather widget.</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Cities</h3>
          <div className="grid grid-cols-2 gap-1 max-h-56 overflow-y-auto">
            {Object.keys(AVAILABLE_CITIES).map(name => (
              <label key={name} className="flex items-center gap-2 text-sm py-1 cursor-pointer hover:bg-gray-50 rounded px-2">
                <input type="checkbox" checked={configCities.includes(name)}
                  onChange={() => setConfigCities(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name])}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5" />
                {name}
              </label>
            ))}
          </div>
        </div>
      </WidgetSettingsModal>
    </>
  );
}
