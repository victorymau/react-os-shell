import { useState, useEffect, useCallback } from 'react';
import { useWidgetSettings } from '../shell/Modal';
import WidgetSettingsModal, { loadAppearance, type WidgetAppearance } from '../shell/WidgetSettingsModal';
import { useShellPrefs } from '../shell/ShellPrefs';
import { AVAILABLE_CITIES, fetchCityWeather, getCondition, toFahrenheit, type CityWeather } from './_weatherData';

const STORAGE_KEY = 'weather_city';
const LEGACY_KEY = 'weather_cities';
const SETTINGS_KEY = 'weather_appearance';

interface WeatherPrefs { useFahrenheit: boolean; showLocalTime: boolean; use24Hour: boolean }
const DEFAULT_PREFS: WeatherPrefs = { useFahrenheit: false, showLocalTime: true, use24Hour: false };

function detectLocalCity(): string {
  try {
    const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    for (const [name, info] of Object.entries(AVAILABLE_CITIES)) {
      if (info.tz === userTz) return name;
    }
  } catch {}
  return 'London';
}

function loadCity(): string {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (v && AVAILABLE_CITIES[v]) return v;
  try {
    const arr = JSON.parse(localStorage.getItem(LEGACY_KEY) || '');
    if (Array.isArray(arr) && arr[0] && AVAILABLE_CITIES[arr[0]]) {
      localStorage.setItem(STORAGE_KEY, arr[0]);
      return arr[0];
    }
  } catch {}
  return detectLocalCity();
}

const toF = toFahrenheit;

function getTimeInTz(timezone: string, use24Hour = false): string {
  try {
    if (use24Hour) {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: false }).formatToParts(new Date());
      const h = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
      const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date());
    const h = parseInt(parts.find(p => p.type === 'hour')?.value || '12');
    const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    const period = parts.find(p => p.type === 'dayPeriod')?.value || '';
    return `${h}:${String(m).padStart(2, '0')} ${period}`;
  } catch { return ''; }
}

/**
 * Effect keyframes — tuned for a ~110 px-tall card so drops/flakes fall
 * across the full height before recycling. Multiple snow/rain variants
 * give the impression of independent particles instead of a hypnotic
 * lock-step pattern.
 */
const WX_KEYFRAMES = `
@keyframes wx-rain-a { 0% { transform: translate(0,-20px); opacity: 0; } 10% { opacity: 0.95; } 100% { transform: translate(8px,140px); opacity: 0; } }
@keyframes wx-rain-b { 0% { transform: translate(0,-20px); opacity: 0; } 12% { opacity: 0.85; } 100% { transform: translate(12px,140px); opacity: 0; } }
@keyframes wx-rain-c { 0% { transform: translate(0,-20px); opacity: 0; } 10% { opacity: 1; } 100% { transform: translate(5px,140px); opacity: 0; } }
@keyframes wx-snow-a { 0% { transform: translate(0,-12px) rotate(0deg); opacity: 0; } 10% { opacity: 0.9; } 50% { transform: translate(10px,55px) rotate(180deg); } 100% { transform: translate(-4px,140px) rotate(360deg); opacity: 0; } }
@keyframes wx-snow-b { 0% { transform: translate(0,-12px) rotate(0deg); opacity: 0; } 10% { opacity: 0.85; } 50% { transform: translate(-12px,55px) rotate(-180deg); } 100% { transform: translate(6px,140px) rotate(-360deg); opacity: 0; } }
@keyframes wx-snow-c { 0% { transform: translate(0,-12px); opacity: 0; } 10% { opacity: 0.7; } 100% { transform: translate(2px,140px); opacity: 0; } }
@keyframes wx-drift-cloud { 0% { transform: translateX(-40%); } 100% { transform: translateX(140%); } }
@keyframes wx-twinkle { 0%, 100% { opacity: 0.25; transform: scale(1); } 50% { opacity: 1; transform: scale(1.6); } }
@keyframes wx-flash { 0%, 86%, 100% { opacity: 0; } 87% { opacity: 0.95; } 88% { opacity: 0.15; } 89% { opacity: 0.85; } 90% { opacity: 0; } }
@keyframes wx-bolt { 0%, 86%, 90%, 100% { opacity: 0; } 87% { opacity: 1; } 89% { opacity: 0.85; } }
@keyframes wx-sun-pulse { 0%, 100% { transform: scale(1); opacity: 0.65; } 50% { transform: scale(1.12); opacity: 0.95; } }
@keyframes wx-sun-rays { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes wx-fog-drift { 0% { transform: translateX(-25%); opacity: 0.3; } 50% { opacity: 0.65; } 100% { transform: translateX(25%); opacity: 0.3; } }
@keyframes wx-shooting-star { 0%, 95% { opacity: 0; transform: translate(0,0) scale(0); } 96% { opacity: 1; transform: translate(0,0) scale(1); } 100% { opacity: 0; transform: translate(40px,30px) scale(1); } }
`;

function SunEffect() {
  // Defined yellow-orange disc with halo + slowly-rotating ray sprite.
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute -top-5 -right-5 w-24 h-24" style={{ animation: 'wx-sun-rays 70s linear infinite' }}>
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {Array.from({ length: 12 }).map((_, i) => (
            <rect key={i} x={49} y={3} width={2} height={14} rx={1}
              fill="rgba(255, 232, 130, 0.55)"
              transform={`rotate(${i * 30} 50 50)`} />
          ))}
        </svg>
      </div>
      <div className="absolute top-1 right-1 w-10 h-10 rounded-full"
        style={{
          background: 'radial-gradient(circle at 35% 35%, #fff8cc 0%, #ffd84a 55%, #ff9e2a 100%)',
          boxShadow: '0 0 18px 5px rgba(255, 200, 80, 0.55)',
          animation: 'wx-sun-pulse 4.5s ease-in-out infinite',
        }} />
    </div>
  );
}

function NightStarsEffect() {
  // Crescent moon (outer warm circle + offset dark circle to carve out the
  // bite) and a sparse scatter of stars twinkling at independent rates.
  // One slow-cycle shooting star adds a moment of motion without
  // distracting.
  const stars = Array.from({ length: 16 }).map((_, i) => ({
    left: `${(i * 53 + 11) % 95}%`,
    top: `${(i * 37 + 9) % 78}%`,
    size: 1 + ((i * 13) % 3),
    delay: `${(i * 0.41) % 4}s`,
    duration: `${2.5 + ((i * 7) % 5) * 0.6}s`,
  }));
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Crescent moon */}
      <div className="absolute top-1 right-1">
        <svg viewBox="0 0 40 40" className="w-9 h-9" style={{ filter: 'drop-shadow(0 0 6px rgba(255,250,220,0.4))' }}>
          <defs>
            <radialGradient id="wx-moon-grad" cx="35%" cy="35%">
              <stop offset="0" stopColor="#fffae0" />
              <stop offset="1" stopColor="#d4c98a" />
            </radialGradient>
          </defs>
          <circle cx={20} cy={20} r={13} fill="url(#wx-moon-grad)" />
          <circle cx={26} cy={16} r={11} fill="rgba(15,23,42,1)" />
        </svg>
      </div>
      {stars.map((s, i) => (
        <div key={i} className="absolute rounded-full bg-white"
          style={{
            left: s.left, top: s.top, width: s.size, height: s.size,
            animation: `wx-twinkle ${s.duration} ease-in-out ${s.delay} infinite`,
          }} />
      ))}
      {/* Shooting star — appears once every ~12s */}
      <div className="absolute" style={{ left: '15%', top: '20%', animation: 'wx-shooting-star 12s ease-out infinite' }}>
        <div className="w-12 h-px"
          style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.95))', boxShadow: '0 0 4px rgba(255,255,255,0.8)' }} />
      </div>
    </div>
  );
}

function CloudsEffect({ tone = 'light' as 'light' | 'dark' }) {
  const fill = tone === 'light' ? 'rgba(255,255,255,0.78)' : 'rgba(220,228,240,0.45)';
  const Cloud = ({ scale = 1 }) => (
    <svg viewBox="0 0 120 50" className="w-32 h-12" style={{ transform: `scale(${scale})`, filter: 'blur(0.6px)' }}>
      <ellipse cx={28} cy={36} rx={18} ry={11} fill={fill} />
      <ellipse cx={50} cy={28} rx={22} ry={15} fill={fill} />
      <ellipse cx={75} cy={32} rx={20} ry={12} fill={fill} />
      <ellipse cx={95} cy={38} rx={15} ry={9} fill={fill} />
    </svg>
  );
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute" style={{ top: '8%', animation: 'wx-drift-cloud 42s linear infinite' }}><Cloud scale={0.9} /></div>
      <div className="absolute" style={{ top: '40%', animation: 'wx-drift-cloud 60s linear -22s infinite', opacity: 0.85 }}><Cloud scale={1.25} /></div>
      <div className="absolute" style={{ top: '68%', animation: 'wx-drift-cloud 78s linear -45s infinite', opacity: 0.7 }}><Cloud scale={0.75} /></div>
    </div>
  );
}

function RainEffect({ heavy = false }: { heavy?: boolean }) {
  const count = heavy ? 26 : 16;
  const variants = ['wx-rain-a', 'wx-rain-b', 'wx-rain-c'];
  const drops = Array.from({ length: count }).map((_, i) => ({
    left: `${(i * 100 / count + (i * 11) % 7) % 100}%`,
    delay: `${(i * 0.087) % 1.3}s`,
    height: `${12 + (i % 4) * 5}px`,
    duration: `${0.7 + (i % 3) * 0.18}s`,
    variant: variants[i % variants.length],
  }));
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {drops.map((d, i) => (
        <div key={i} className="absolute"
          style={{
            left: d.left, top: '-20px',
            width: '1px', height: d.height,
            background: 'linear-gradient(180deg, rgba(180,210,255,0) 0%, rgba(220,235,255,0.85) 90%, rgba(255,255,255,0.95) 100%)',
            transform: 'rotate(8deg)',
            animation: `${d.variant} ${d.duration} linear ${d.delay} infinite`,
            transformOrigin: 'top',
          }} />
      ))}
    </div>
  );
}

function SnowEffect() {
  const variants = ['wx-snow-a', 'wx-snow-b', 'wx-snow-c'];
  const flakes = Array.from({ length: 16 }).map((_, i) => ({
    left: `${(i * 100 / 16 + (i * 13) % 5) % 100}%`,
    delay: `${(i * 0.43) % 5}s`,
    duration: `${4.5 + (i % 5)}s`,
    size: 3 + (i % 4) * 1.4,
    opacity: 0.65 + ((i * 7) % 4) * 0.08,
    variant: variants[i % variants.length],
  }));
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {flakes.map((f, i) => (
        <div key={i} className="absolute rounded-full bg-white"
          style={{
            left: f.left, top: '-12px',
            width: f.size, height: f.size,
            opacity: f.opacity,
            boxShadow: '0 0 4px rgba(255,255,255,0.65)',
            animation: `${f.variant} ${f.duration} linear ${f.delay} infinite`,
          }} />
      ))}
    </div>
  );
}

function ThunderEffect() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <RainEffect heavy />
      {/* Sharp double-flash overlay */}
      <div className="absolute inset-0 bg-white" style={{ animation: 'wx-flash 6s ease-out infinite' }} />
      {/* Lightning bolt — visible only during the flash peaks */}
      <div className="absolute inset-y-0 right-1/3 flex items-center justify-center pointer-events-none"
        style={{ animation: 'wx-bolt 6s ease-out infinite' }}>
        <svg viewBox="0 0 18 60" className="h-4/5"
          style={{ filter: 'drop-shadow(0 0 6px rgba(255, 240, 150, 0.95)) drop-shadow(0 0 14px rgba(255, 220, 90, 0.7))' }}>
          <path d="M11 0 L2 28 L8 30 L4 60 L16 24 L9 22 Z"
            fill="rgba(255, 250, 200, 0.98)"
            stroke="rgba(255, 255, 255, 0.9)" strokeWidth={0.3} />
        </svg>
      </div>
    </div>
  );
}

function FogEffect() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="absolute left-0 right-0"
          style={{
            top: `${10 + i * 22}%`,
            height: '14px',
            background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0) 100%)',
            filter: 'blur(2px)',
            animation: `wx-fog-drift ${10 + i * 3}s ease-in-out ${i * 0.7}s infinite alternate`,
          }} />
      ))}
    </div>
  );
}

function WeatherEffect({ code, isDay }: { code: number; isDay: boolean }) {
  if (code === 0 || code === 1) return isDay ? <SunEffect /> : <NightStarsEffect />;
  if (code === 2) return (
    <>
      {isDay ? <SunEffect /> : <NightStarsEffect />}
      <CloudsEffect tone={isDay ? 'light' : 'dark'} />
    </>
  );
  if (code === 3) return <CloudsEffect tone={isDay ? 'light' : 'dark'} />;
  if (code === 45 || code === 48) return <FogEffect />;
  if ([51, 53, 61, 80, 81].includes(code)) return <RainEffect />;
  if ([55, 63, 65, 82].includes(code)) return <RainEffect heavy />;
  if ([71, 73, 75].includes(code)) return <SnowEffect />;
  if ([95, 96, 99].includes(code)) return <ThunderEffect />;
  return null;
}

export default function Weather() {
  const [city, setCity] = useState(loadCity);
  const [appearance, setAppearance] = useState(() => loadAppearance(SETTINGS_KEY));
  const [data, setData] = useState<CityWeather | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 60000); return () => clearInterval(t); }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configCity, setConfigCity] = useState(city);
  const [configAppearance, setConfigAppearance] = useState<WidgetAppearance>(appearance);

  const { prefs: shellPrefs, save: saveShellPrefs } = useShellPrefs();
  const prefs: WeatherPrefs = { ...DEFAULT_PREFS, ...(shellPrefs.weather_prefs as WeatherPrefs | undefined ?? {}) };
  const [configPrefs, setConfigPrefs] = useState<WeatherPrefs>(prefs);

  useWidgetSettings(useCallback(() => {
    setConfigCity(city);
    setConfigAppearance({ ...appearance });
    setConfigPrefs({ ...prefs });
    setSettingsOpen(true);
  }, [city, appearance, prefs]));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCityWeather(city).then(w => {
      if (cancelled) return;
      setData(w);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [city]);

  const saveSettings = () => {
    setCity(configCity);
    setAppearance(configAppearance);
    saveShellPrefs({ weather_prefs: configPrefs });
    localStorage.setItem(STORAGE_KEY, configCity);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(configAppearance));
    setSettingsOpen(false);
  };

  const t = (c: number) => prefs.useFahrenheit ? `${toF(c)}°F` : `${c}°`;

  // Half-height — tile is now ~110 px tall. Effect keyframes are tuned for
  // this so drops/flakes traverse the full height before recycling.
  const TILE_HEIGHT = 110;

  if (loading && !data) {
    return <div className="flex items-center justify-center h-full bg-gradient-to-b from-sky-400 to-blue-500 rounded-lg text-white/80 text-xs" style={{ minHeight: TILE_HEIGHT }}>Loading…</div>;
  }
  if (!data) {
    return <div className="flex items-center justify-center h-full bg-slate-700 rounded-lg text-white/80 text-xs" style={{ minHeight: TILE_HEIGHT }}>Couldn't load weather</div>;
  }

  const [condition, emoji, gradient] = getCondition(data.code, data.isDay);

  return (
    <>
      <style>{WX_KEYFRAMES}</style>
      <div className="rounded-lg overflow-hidden"
        style={{
          backgroundColor: `rgba(15, 23, 42, ${appearance.activeOpacity / 100})`,
          backdropFilter: appearance.activeBlur > 0 ? `blur(${appearance.activeBlur}px)` : undefined,
        }}>
        <div className={`relative rounded-lg overflow-hidden text-white bg-gradient-to-br ${gradient}`} style={{ height: TILE_HEIGHT }}>
          {/* Animated effects */}
          <WeatherEffect code={data.code} isDay={data.isDay} />

          {/* Compact two-row content */}
          <div className="relative z-10 px-3 py-2.5 flex flex-col h-full justify-between">
            {/* Top: city + time | temp */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold leading-tight truncate drop-shadow-sm">{data.city}</div>
                {prefs.showLocalTime && (
                  <div className="text-[10px] opacity-90 leading-tight tabular-nums drop-shadow-sm">
                    {getTimeInTz(data.timezone, prefs.use24Hour)}
                  </div>
                )}
              </div>
              <div className="text-3xl font-extralight leading-none tracking-tight tabular-nums shrink-0 drop-shadow-sm">
                {t(data.temp)}
              </div>
            </div>

            {/* Bottom: condition | H/L */}
            <div className="flex items-end justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-lg leading-none drop-shadow-sm">{emoji}</span>
                <span className="text-[11px] font-medium drop-shadow-sm truncate">{condition}</span>
              </div>
              <span className="text-[10px] opacity-90 tabular-nums drop-shadow-sm shrink-0">H:{t(data.high)} L:{t(data.low)}</span>
            </div>
          </div>
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
          <h3 className="text-sm font-semibold text-gray-700 mb-2">City</h3>
          <select value={configCity} onChange={e => setConfigCity(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
            {Object.keys(AVAILABLE_CITIES).map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-gray-400">Auto-detected from your timezone; change if needed.</p>
        </div>
      </WidgetSettingsModal>
    </>
  );
}
