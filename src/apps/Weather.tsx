import { useState, useEffect, useCallback } from 'react';
import { useWidgetSettings } from '../shell/Modal';
import WidgetSettingsModal, { loadAppearance, type WidgetAppearance } from '../shell/WidgetSettingsModal';

// [condition, day emoji, night emoji, day gradient, night gradient]
const WMO: Record<number, [string, string, string, string, string]> = {
  0: ['Clear Sky', '☀️', '🌙', 'from-sky-400 to-blue-500', 'from-indigo-800 to-slate-900'],
  1: ['Mainly Clear', '🌤️', '🌙', 'from-sky-400 to-blue-500', 'from-indigo-800 to-slate-900'],
  2: ['Partly Cloudy', '⛅', '☁️', 'from-sky-400 to-blue-400', 'from-indigo-700 to-slate-800'],
  3: ['Overcast', '☁️', '☁️', 'from-gray-400 to-gray-500', 'from-gray-700 to-slate-800'],
  45: ['Foggy', '🌫️', '🌫️', 'from-gray-400 to-gray-500', 'from-gray-700 to-slate-800'],
  48: ['Foggy', '🌫️', '🌫️', 'from-gray-400 to-gray-500', 'from-gray-700 to-slate-800'],
  51: ['Light Drizzle', '🌦️', '🌧️', 'from-gray-400 to-blue-500', 'from-gray-700 to-indigo-800'],
  53: ['Drizzle', '🌧️', '🌧️', 'from-gray-500 to-blue-600', 'from-gray-700 to-indigo-800'],
  55: ['Heavy Drizzle', '🌧️', '🌧️', 'from-gray-500 to-blue-600', 'from-gray-700 to-indigo-800'],
  61: ['Light Rain', '🌦️', '🌧️', 'from-gray-400 to-blue-500', 'from-gray-700 to-indigo-800'],
  63: ['Rain', '🌧️', '🌧️', 'from-gray-500 to-blue-600', 'from-gray-700 to-indigo-800'],
  65: ['Heavy Rain', '🌧️', '🌧️', 'from-gray-600 to-blue-700', 'from-gray-700 to-indigo-900'],
  71: ['Light Snow', '🌨️', '🌨️', 'from-blue-200 to-blue-400', 'from-blue-800 to-slate-900'],
  73: ['Snow', '❄️', '❄️', 'from-blue-300 to-blue-500', 'from-blue-800 to-slate-900'],
  75: ['Heavy Snow', '❄️', '❄️', 'from-blue-400 to-blue-600', 'from-blue-800 to-slate-900'],
  80: ['Rain Showers', '🌧️', '🌧️', 'from-gray-500 to-blue-600', 'from-gray-700 to-indigo-800'],
  82: ['Heavy Showers', '🌧️', '🌧️', 'from-gray-600 to-blue-700', 'from-gray-700 to-indigo-900'],
  95: ['Thunderstorm', '⛈️', '⛈️', 'from-gray-700 to-indigo-800', 'from-gray-800 to-indigo-950'],
  96: ['Thunderstorm', '⛈️', '⛈️', 'from-gray-700 to-indigo-800', 'from-gray-800 to-indigo-950'],
  99: ['Thunderstorm', '⛈️', '⛈️', 'from-gray-700 to-indigo-900', 'from-gray-800 to-indigo-950'],
};

const getCondition = (code: number, isDay = true) => {
  const entry = WMO[code] || ['Unknown', '❓', '❓', 'from-gray-400 to-gray-500', 'from-gray-700 to-slate-800'];
  return [entry[0], isDay ? entry[1] : entry[2], isDay ? entry[3] : entry[4]] as [string, string, string];
};

const AVAILABLE_CITIES: Record<string, { lat: number; lon: number }> = {
  'Sydney': { lat: -33.8688, lon: 151.2093 },
  'London': { lat: 51.5074, lon: -0.1278 },
  'Los Angeles': { lat: 34.0522, lon: -118.2437 },
  'Shanghai': { lat: 31.2304, lon: 121.4737 },
  'New York': { lat: 40.7128, lon: -74.0060 },
  'Tokyo': { lat: 35.6762, lon: 139.6503 },
  'Dubai': { lat: 25.2048, lon: 55.2708 },
  'Singapore': { lat: 1.3521, lon: 103.8198 },
  'Hong Kong': { lat: 22.3193, lon: 114.1694 },
  'Paris': { lat: 48.8566, lon: 2.3522 },
  'Berlin': { lat: 52.5200, lon: 13.4050 },
  'Mumbai': { lat: 19.0760, lon: 72.8777 },
  'Bangkok': { lat: 13.7563, lon: 100.5018 },
  'Melbourne': { lat: -37.8136, lon: 144.9631 },
  'Toronto': { lat: 43.6532, lon: -79.3832 },
  'Miami': { lat: 25.7617, lon: -80.1918 },
  'Chicago': { lat: 41.8781, lon: -87.6298 },
  'Auckland': { lat: -36.8485, lon: 174.7633 },
};

const DEFAULT_CITIES = ['Sydney', 'London', 'Los Angeles', 'Shanghai'];
const STORAGE_KEY = 'weather_cities';
const SETTINGS_KEY = 'weather_appearance';
const CACHE_KEY = 'weather_multi_cache';
const CACHE_TTL = 30 * 60 * 1000;

const PREFS_KEY = 'weather_prefs';
interface CityWeather { city: string; temp: number; code: number; high: number; low: number; isDay: boolean; timezone: string }
interface WeatherPrefs { useFahrenheit: boolean; showLocalTime: boolean; use24Hour: boolean }

function loadCities(): string[] {
  try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || ''); if (Array.isArray(s) && s.length) return s; } catch {}
  return DEFAULT_CITIES;
}

function loadPrefs(): WeatherPrefs {
  try { const s = JSON.parse(localStorage.getItem(PREFS_KEY) || ''); if (s) return { useFahrenheit: false, showLocalTime: false, use24Hour: false, ...s }; } catch {}
  return { useFahrenheit: false, showLocalTime: false, use24Hour: false };
}

const toF = (c: number) => Math.round(c * 9 / 5 + 32);

function getTimeInTz(timezone: string, use24Hour = false): { hours: number; minutes: number; text: string } {
  try {
    const now = new Date();
    const h24Parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: false }).formatToParts(now);
    const h24 = parseInt(h24Parts.find(p => p.type === 'hour')?.value || '0');
    const m = parseInt(h24Parts.find(p => p.type === 'minute')?.value || '0');
    if (use24Hour) {
      return { hours: h24, minutes: m, text: `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
    }
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(now);
    const h12 = parseInt(parts.find(p => p.type === 'hour')?.value || '12');
    const period = parts.find(p => p.type === 'dayPeriod')?.value || '';
    return { hours: h24, minutes: m, text: `${h12}:${String(m).padStart(2, '0')} ${period}` };
  } catch { return { hours: 0, minutes: 0, text: '' }; }
}

/** Tiny analog clock SVG */
function MiniClock({ hours, minutes, size = 20 }: { hours: number; minutes: number; size?: number }) {
  const r = size / 2;
  const hAngle = ((hours % 12) + minutes / 60) * 30 - 90;
  const mAngle = minutes * 6 - 90;
  const hRad = (hAngle * Math.PI) / 180;
  const mRad = (mAngle * Math.PI) / 180;
  const hLen = r * 0.5;
  const mLen = r * 0.7;
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={r} cy={r} r={r - 1} fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
      {/* Hour hand */}
      <line x1={r} y1={r} x2={r + Math.cos(hRad) * hLen} y2={r + Math.sin(hRad) * hLen}
        stroke="white" strokeWidth={1.5} strokeLinecap="round" />
      {/* Minute hand */}
      <line x1={r} y1={r} x2={r + Math.cos(mRad) * mLen} y2={r + Math.sin(mRad) * mLen}
        stroke="white" strokeWidth={1} strokeLinecap="round" />
      {/* Center dot */}
      <circle cx={r} cy={r} r={1} fill="white" />
    </svg>
  );
}

export default function Weather() {
  const [cities, setCities] = useState(loadCities);
  const [appearance, setAppearance] = useState(() => loadAppearance(SETTINGS_KEY));
  const [data, setData] = useState<CityWeather[]>([]);
  const [loading, setLoading] = useState(true);
  // Tick every minute so clocks update
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 60000); return () => clearInterval(t); }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configCities, setConfigCities] = useState<string[]>([]);
  const [configAppearance, setConfigAppearance] = useState<WidgetAppearance>(appearance);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [configPrefs, setConfigPrefs] = useState<WeatherPrefs>(prefs);

  useWidgetSettings(useCallback(() => {
    setConfigCities([...cities]);
    setConfigAppearance({ ...appearance });
    setConfigPrefs({ ...prefs });
    setSettingsOpen(true);
  }, [cities, appearance, prefs]));

  const fetchAll = useCallback(async (cityList: string[], force = false) => {
    if (!force) {
      try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
        const key = cityList.join(',');
        if (cached[key] && Date.now() - cached[key].ts < CACHE_TTL) {
          setData(cached[key].data); setLoading(false); return;
        }
      } catch {}
    }
    setLoading(true);
    const results: CityWeather[] = [];
    for (const city of cityList) {
      const coords = AVAILABLE_CITIES[city];
      if (!coords) continue;
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto`);
        const w = await res.json();
        results.push({ city, temp: Math.round(w.current.temperature_2m), code: w.current.weather_code, high: Math.round(w.daily.temperature_2m_max[0]), low: Math.round(w.daily.temperature_2m_min[0]), isDay: w.current.is_day === 1, timezone: w.timezone || 'UTC' });
      } catch {}
    }
    setData(results); setLoading(false);
    try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); c[cityList.join(',')] = { data: results, ts: Date.now() }; localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {}
  }, []);

  useEffect(() => { fetchAll(cities); }, [cities, fetchAll]);

  const saveSettings = () => {
    if (configCities.length === 0) return;
    setCities(configCities); setAppearance(configAppearance); setPrefs(configPrefs);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configCities));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(configAppearance));
    localStorage.setItem(PREFS_KEY, JSON.stringify(configPrefs));
    setSettingsOpen(false);
  };

  const t = (c: number) => prefs.useFahrenheit ? `${toF(c)}°F` : `${c}°`;

  if (loading && data.length === 0) {
    return <div className="flex items-center justify-center h-full bg-gradient-to-b from-sky-400 to-blue-500 rounded-lg text-white/70 text-sm">Loading...</div>;
  }

  // Use the first city's condition + day/night for the background gradient
  const firstIsDay = data.length > 0 ? data[0].isDay : true;
  const [, , gradient] = data.length > 0 ? getCondition(data[0].code, firstIsDay) : ['', '', 'from-sky-400 to-blue-500'];
  const dynamicHeight = data.length * 48 + 16;

  return (
    <>
      <div className={`flex flex-col bg-gradient-to-b ${gradient} rounded-lg text-white overflow-hidden`}
        style={{ minHeight: dynamicHeight, opacity: appearance.activeOpacity / 100, backdropFilter: appearance.activeBlur > 0 ? `blur(${appearance.activeBlur}px)` : undefined }}>
        <div className="flex-1 flex flex-col justify-between px-3 py-3">
          {data.map(d => {
            const [condition, emoji] = getCondition(d.code, d.isDay);
            return (
              <div key={d.city} className={`flex items-center gap-2 rounded-lg px-2 py-1 -mx-1 ${d.isDay ? '' : 'bg-black/15'}`}>
                {prefs.showLocalTime && (() => {
                  const time = getTimeInTz(d.timezone, prefs.use24Hour);
                  return <MiniClock hours={time.hours} minutes={time.minutes} size={24} />;
                })()}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold leading-tight">{d.city}</div>
                  <div className="text-[10px] opacity-70">
                    {prefs.showLocalTime ? getTimeInTz(d.timezone, prefs.use24Hour).text : condition}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-lg">{emoji}</span>
                  <div className="text-right">
                    <div className="text-2xl font-light leading-none">{t(d.temp)}</div>
                    <div className="text-[9px] opacity-60">H:{t(d.high)} L:{t(d.low)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <WidgetSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Weather Settings"
        appearance={configAppearance} onAppearanceChange={setConfigAppearance} onSave={saveSettings}>
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Display</h3>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm text-gray-600 w-24">Temperature</span>
              <div className="flex gap-1">
                {([{ key: false, label: '°C' }, { key: true, label: '°F' }] as const).map(o => (
                  <button key={String(o.key)} onClick={() => setConfigPrefs(p => ({ ...p, useFahrenheit: o.key }))}
                    className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${configPrefs.useFahrenheit === o.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm text-gray-600 w-24">Time Format</span>
              <div className="flex gap-1">
                {([{ key: false, label: 'AM/PM' }, { key: true, label: '24H' }] as const).map(o => (
                  <button key={String(o.key)} onClick={() => setConfigPrefs(p => ({ ...p, use24Hour: o.key }))}
                    className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${configPrefs.use24Hour === o.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={configPrefs.showLocalTime} onChange={e => setConfigPrefs(p => ({ ...p, showLocalTime: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 h-3.5 w-3.5" />
              <span className="text-sm text-gray-600">Show local time</span>
            </label>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Cities</h3>
          <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto">
            {Object.keys(AVAILABLE_CITIES).map(city => (
              <label key={city} className="flex items-center gap-2 text-sm py-1 cursor-pointer hover:bg-gray-50 rounded px-2">
                <input type="checkbox" checked={configCities.includes(city)}
                  onChange={() => setConfigCities(prev => prev.includes(city) ? prev.filter(c => c !== city) : [...prev, city])}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5" />
                {city}
              </label>
            ))}
          </div>
        </div>
      </WidgetSettingsModal>
    </>
  );
}
