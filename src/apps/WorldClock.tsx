import { useState, useEffect, useCallback } from 'react';
import { useWidgetSettings } from '../shell/Modal';
import WidgetSettingsModal, { loadAppearance, type WidgetAppearance } from '../shell/WidgetSettingsModal';
import { useShellPrefs } from '../shell/ShellPrefs';
import { AVAILABLE_CITIES, fetchCityWeather, getCondition, toFahrenheit, type CityWeather } from './_weatherData';

const SETTINGS_KEY = 'world_clock_appearance';
const DEFAULT_CITIES = ['London', 'Shanghai', 'New York'];

interface WeatherPrefs { useFahrenheit: boolean }

/**
 * Resolve the local time for the supplied IANA timezone into a digital
 * `12:34` + `AM` / `PM` pair. Used by the World Clock rows.
 */
function digitalTime(tz: string, now: Date): { time: string; ampm: string } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true,
    }).formatToParts(now);
    const h = parts.find(p => p.type === 'hour')?.value || '12';
    const m = parts.find(p => p.type === 'minute')?.value || '00';
    const ampm = (parts.find(p => p.type === 'dayPeriod')?.value || '').toUpperCase();
    return { time: `${h}:${m}`, ampm };
  } catch { return { time: '', ampm: '' }; }
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
       *  widgets read as a coordinated set across light and dark themes.
       *  Rows use `divide-y` rather than per-row border classes so the
       *  last row never paints a stray separator line at the panel's
       *  bottom edge. */}
      <div className="h-full"
        style={{
          backgroundColor: `rgb(var(--taskbar-bg-rgb, 243 244 246) / ${appearance.activeOpacity / 100})`,
          backdropFilter: appearance.activeBlur > 0 ? `blur(${appearance.activeBlur}px)` : undefined,
        }}>
        <div className="divide-y divide-gray-200">
          {loading && cities.every(c => !data[c]) && (
            <div className="px-3 py-6 text-center text-xs text-gray-500">Loading…</div>
          )}
          {cities.map((cityName) => {
            const w = data[cityName];
            const tz = AVAILABLE_CITIES[cityName]?.tz ?? 'UTC';
            const { time, ampm } = digitalTime(tz, now);
            if (!w) {
              return (
                <div key={cityName} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[15px] font-semibold tracking-tight text-gray-900 truncate">{cityName}</span>
                    <span className="tabular-nums text-[13px] font-medium text-gray-500">{time}<span className="text-[9px] ml-0.5 opacity-70">{ampm}</span></span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-1">Loading weather…</div>
                </div>
              );
            }
            const [condition, emoji] = getCondition(w.code, w.isDay);
            return (
              <div key={cityName} className="px-4 py-3">
                {/* Top — city name on the left, big temperature on the right. */}
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-semibold tracking-tight text-gray-900 truncate">{cityName}</span>
                  <span className="text-[26px] font-extralight leading-none tabular-nums tracking-tight text-gray-900 shrink-0">{formatTemp(w.temp)}</span>
                </div>

                {/* Bottom — emoji · digital time · condition on the left;
                    H/L on the right. */}
                <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px]">
                  <div className="flex items-center gap-1.5 min-w-0 text-gray-500">
                    <span className="text-base leading-none shrink-0">{emoji}</span>
                    <span className="tabular-nums font-semibold text-gray-700 shrink-0">
                      {time}<span className="text-[9px] font-medium ml-0.5 opacity-70">{ampm}</span>
                    </span>
                    <span className="text-gray-300 shrink-0">·</span>
                    <span className="truncate">{condition}</span>
                  </div>
                  <span className="tabular-nums text-gray-500 shrink-0">H:{formatTemp(w.high)} L:{formatTemp(w.low)}</span>
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
