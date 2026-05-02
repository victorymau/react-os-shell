/**
 * Shared weather data — used by Weather (single-city tile with animations)
 * and WorldClock (multi-city list with per-row weather + day/night via the
 * emoji). Single source of truth for the WMO code map, the supported city
 * coordinates, and the localStorage cache so both widgets share fetched
 * data.
 */

// [condition, day emoji, night emoji, day gradient, night gradient]
export const WMO: Record<number, [string, string, string, string, string]> = {
  0: ['Clear Sky', '☀️', '🌙', 'from-sky-400 to-blue-500', 'from-indigo-900 to-slate-950'],
  1: ['Mainly Clear', '🌤️', '🌙', 'from-sky-400 to-blue-500', 'from-indigo-900 to-slate-950'],
  2: ['Partly Cloudy', '⛅', '☁️', 'from-sky-400 to-blue-400', 'from-indigo-800 to-slate-900'],
  3: ['Overcast', '☁️', '☁️', 'from-gray-400 to-gray-500', 'from-gray-700 to-slate-900'],
  45: ['Foggy', '🌫️', '🌫️', 'from-gray-400 to-gray-500', 'from-gray-700 to-slate-800'],
  48: ['Foggy', '🌫️', '🌫️', 'from-gray-400 to-gray-500', 'from-gray-700 to-slate-800'],
  51: ['Light Drizzle', '🌦️', '🌧️', 'from-gray-400 to-blue-500', 'from-gray-700 to-indigo-900'],
  53: ['Drizzle', '🌧️', '🌧️', 'from-gray-500 to-blue-600', 'from-gray-700 to-indigo-900'],
  55: ['Heavy Drizzle', '🌧️', '🌧️', 'from-gray-500 to-blue-600', 'from-gray-700 to-indigo-900'],
  61: ['Light Rain', '🌦️', '🌧️', 'from-gray-400 to-blue-500', 'from-gray-700 to-indigo-900'],
  63: ['Rain', '🌧️', '🌧️', 'from-gray-500 to-blue-600', 'from-gray-700 to-indigo-900'],
  65: ['Heavy Rain', '🌧️', '🌧️', 'from-gray-600 to-blue-700', 'from-gray-700 to-indigo-950'],
  71: ['Light Snow', '🌨️', '🌨️', 'from-blue-200 to-blue-400', 'from-blue-800 to-slate-900'],
  73: ['Snow', '❄️', '❄️', 'from-blue-300 to-blue-500', 'from-blue-800 to-slate-900'],
  75: ['Heavy Snow', '❄️', '❄️', 'from-blue-400 to-blue-600', 'from-blue-800 to-slate-900'],
  80: ['Rain Showers', '🌧️', '🌧️', 'from-gray-500 to-blue-600', 'from-gray-700 to-indigo-900'],
  82: ['Heavy Showers', '🌧️', '🌧️', 'from-gray-600 to-blue-700', 'from-gray-700 to-indigo-950'],
  95: ['Thunderstorm', '⛈️', '⛈️', 'from-gray-700 to-indigo-800', 'from-gray-800 to-indigo-950'],
  96: ['Thunderstorm', '⛈️', '⛈️', 'from-gray-700 to-indigo-800', 'from-gray-800 to-indigo-950'],
  99: ['Thunderstorm', '⛈️', '⛈️', 'from-gray-700 to-indigo-900', 'from-gray-800 to-indigo-950'],
};

export const getCondition = (code: number, isDay = true): [string, string, string] => {
  const entry = WMO[code] || ['Unknown', '❓', '❓', 'from-gray-400 to-gray-500', 'from-gray-700 to-slate-800'];
  return [entry[0], isDay ? entry[1] : entry[2], isDay ? entry[3] : entry[4]];
};

export const AVAILABLE_CITIES: Record<string, { lat: number; lon: number; tz: string }> = {
  'Sydney':       { lat: -33.8688, lon: 151.2093, tz: 'Australia/Sydney' },
  'Melbourne':    { lat: -37.8136, lon: 144.9631, tz: 'Australia/Melbourne' },
  'Auckland':     { lat: -36.8485, lon: 174.7633, tz: 'Pacific/Auckland' },
  'Tokyo':        { lat: 35.6762,  lon: 139.6503, tz: 'Asia/Tokyo' },
  'Shanghai':     { lat: 31.2304,  lon: 121.4737, tz: 'Asia/Shanghai' },
  'Hong Kong':    { lat: 22.3193,  lon: 114.1694, tz: 'Asia/Hong_Kong' },
  'Singapore':    { lat: 1.3521,   lon: 103.8198, tz: 'Asia/Singapore' },
  'Bangkok':      { lat: 13.7563,  lon: 100.5018, tz: 'Asia/Bangkok' },
  'Mumbai':       { lat: 19.0760,  lon: 72.8777,  tz: 'Asia/Kolkata' },
  'Dubai':        { lat: 25.2048,  lon: 55.2708,  tz: 'Asia/Dubai' },
  'Berlin':       { lat: 52.5200,  lon: 13.4050,  tz: 'Europe/Berlin' },
  'Paris':        { lat: 48.8566,  lon: 2.3522,   tz: 'Europe/Paris' },
  'London':       { lat: 51.5074,  lon: -0.1278,  tz: 'Europe/London' },
  'New York':     { lat: 40.7128,  lon: -74.0060, tz: 'America/New_York' },
  'Miami':        { lat: 25.7617,  lon: -80.1918, tz: 'America/New_York' },
  'Toronto':      { lat: 43.6532,  lon: -79.3832, tz: 'America/Toronto' },
  'Chicago':      { lat: 41.8781,  lon: -87.6298, tz: 'America/Chicago' },
  'Los Angeles':  { lat: 34.0522,  lon: -118.2437, tz: 'America/Los_Angeles' },
};

export const WEATHER_CACHE_KEY = 'weather_local_cache';
export const WEATHER_CACHE_TTL = 30 * 60 * 1000;

export interface CityWeather {
  city: string;
  temp: number;
  code: number;
  high: number;
  low: number;
  isDay: boolean;
  timezone: string;
}

export interface WeatherCacheEntry { data: CityWeather; ts: number }
type WeatherCache = Record<string, WeatherCacheEntry>;

function readCache(): WeatherCache {
  try { return JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || '{}'); } catch { return {}; }
}
function writeCache(c: WeatherCache) {
  try { localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(c)); } catch {}
}

/** Fetch a city's current weather + today's high/low, with a 30-min
 *  localStorage cache shared across widgets. */
export async function fetchCityWeather(cityName: string, force = false): Promise<CityWeather | null> {
  const coords = AVAILABLE_CITIES[cityName];
  if (!coords) return null;
  if (!force) {
    const cached = readCache()[cityName];
    if (cached && Date.now() - cached.ts < WEATHER_CACHE_TTL) return cached.data;
  }
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto`);
    const w = await res.json();
    const cw: CityWeather = {
      city: cityName,
      temp: Math.round(w.current.temperature_2m),
      code: w.current.weather_code,
      high: Math.round(w.daily.temperature_2m_max[0]),
      low: Math.round(w.daily.temperature_2m_min[0]),
      isDay: w.current.is_day === 1,
      timezone: w.timezone || 'UTC',
    };
    const c = readCache();
    c[cityName] = { data: cw, ts: Date.now() };
    writeCache(c);
    return cw;
  } catch {
    return null;
  }
}

export const toFahrenheit = (c: number) => Math.round(c * 9 / 5 + 32);
