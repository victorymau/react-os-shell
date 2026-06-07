import { useState, useEffect, useCallback } from 'react';
import { useWidgetSettings } from '../shell/Modal';
import WidgetSettingsModal, { loadAppearance, type WidgetAppearance } from '../shell/WidgetSettingsModal';

/**
 * Stock ticker widget — track a watchlist of equities with live prices.
 *
 * Quotes come from Finnhub's keyless-from-the-browser /quote endpoint, which
 * needs a (free) API key the user pastes in settings — there's no reliable
 * keyless + CORS stock feed, so "setup" means entering a key + picking
 * symbols. Until a key is set the widget shows a friendly call-to-action.
 */

/** Cap the watchlist — keeps the widget compact and stays well within
 *  Finnhub's free tier (one /quote call per symbol, polled each minute). */
const MAX_SYMBOLS = 8;
const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'TSLA'];

const SYMBOLS_KEY = 'stock_symbols';
const APIKEY_KEY = 'stock_api_key';
const SETTINGS_KEY = 'stock_appearance';
const CACHE_KEY = 'stock_quotes_cache';
const CACHE_TTL = 60_000;   // 1 min — fresh enough for a desktop ticker
const REFRESH_MS = 60_000;

interface Quote { price: number; change: number; changePct: number }
type CacheEntry = { q: Quote; ts: number };
type Cache = Record<string, CacheEntry>;

function readCache(): Cache { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; } }
function writeCache(c: Cache) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {} }

function loadSymbols(): string[] {
  try { const s = JSON.parse(localStorage.getItem(SYMBOLS_KEY) || ''); if (Array.isArray(s) && s.length) return s.slice(0, MAX_SYMBOLS); } catch {}
  return DEFAULT_SYMBOLS;
}

const fmtPrice = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtSigned = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;

export default function Stock() {
  const [symbols, setSymbols] = useState(loadSymbols);
  const [apiKey, setApiKey] = useState(() => { try { return localStorage.getItem(APIKEY_KEY) || ''; } catch { return ''; } });
  const [appearance, setAppearance] = useState(() => loadAppearance(SETTINGS_KEY));
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configSymbols, setConfigSymbols] = useState<string[]>([]);
  const [configApiKey, setConfigApiKey] = useState('');
  const [configAppearance, setConfigAppearance] = useState<WidgetAppearance>(appearance);
  const [newSymbol, setNewSymbol] = useState('');

  const openSettings = useCallback(() => {
    setConfigSymbols([...symbols]);
    setConfigApiKey(apiKey);
    setConfigAppearance({ ...appearance });
    setNewSymbol('');
    setSettingsOpen(true);
  }, [symbols, apiKey, appearance]);

  useWidgetSettings(openSettings);

  // Poll on a timer so prices stay current while the widget sits on the desktop.
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!apiKey || symbols.length === 0) { setQuotes({}); return; }
    let mounted = true;
    (async () => {
      setLoading(true);
      const cache = readCache();
      const next: Record<string, Quote> = {};
      await Promise.all(symbols.map(async sym => {
        const hit = cache[sym];
        if (hit && Date.now() - hit.ts < CACHE_TTL) { next[sym] = hit.q; return; }
        try {
          const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${encodeURIComponent(apiKey)}`);
          const d = await res.json();
          if (typeof d.c === 'number' && d.c > 0) {
            const q: Quote = { price: d.c, change: d.d ?? 0, changePct: d.dp ?? 0 };
            next[sym] = q; cache[sym] = { q, ts: Date.now() };
          } else if (hit) { next[sym] = hit.q; }   // unknown symbol / rate-limited → keep last good
        } catch { if (hit) next[sym] = hit.q; }
      }));
      writeCache(cache);
      if (mounted) { setQuotes(next); setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [symbols.join(','), apiKey, tick]);

  const addSymbol = () => {
    const s = newSymbol.trim().toUpperCase();
    if (!s || configSymbols.includes(s) || configSymbols.length >= MAX_SYMBOLS) return;
    setConfigSymbols(p => [...p, s]);
    setNewSymbol('');
  };

  const saveSettings = () => {
    const cleaned = configSymbols.map(s => s.toUpperCase()).slice(0, MAX_SYMBOLS);
    const key = configApiKey.trim();
    setSymbols(cleaned); setApiKey(key); setAppearance(configAppearance);
    localStorage.setItem(SYMBOLS_KEY, JSON.stringify(cleaned));
    localStorage.setItem(APIKEY_KEY, key);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(configAppearance));
    setSettingsOpen(false);
  };

  return (
    <>
      {/* Theme-aware panel — mirrors the taskbar's `--taskbar-bg-rgb` so the
       *  widget matches it across themes; gray-* classes auto-invert in dark. */}
      <div className="flex flex-col h-full"
        style={{ backgroundColor: `rgb(var(--taskbar-bg-rgb, 243 244 246) / ${appearance.activeOpacity / 100})`, backdropFilter: appearance.activeBlur > 0 ? `blur(${appearance.activeBlur}px)` : undefined }}>
        <div className="px-4 py-3 flex-1">
          {!apiKey ? (
            <div className="flex flex-col items-center justify-center text-center gap-2 py-6">
              <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" /></svg>
              <p className="text-sm font-semibold text-gray-700">Track live stock prices</p>
              <p className="text-xs text-gray-500 max-w-[15rem]">Add a free API key to get started.</p>
              <button onClick={openSettings} className="mt-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-1.5 transition-colors">Set up</button>
            </div>
          ) : symbols.length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-6">No symbols yet — add some in settings.</div>
          ) : (
            <div className="space-y-0.5">
              {loading && Object.keys(quotes).length === 0 && <div className="text-xs text-gray-400 text-center py-4">Loading quotes…</div>}
              {symbols.map(sym => {
                const q = quotes[sym];
                const up = (q?.change ?? 0) >= 0;
                const color = !q ? 'text-gray-400' : q.change > 0 ? 'text-green-600' : q.change < 0 ? 'text-red-600' : 'text-gray-500';
                return (
                  <div key={sym} className="flex items-center justify-between px-2 py-2 border-b border-gray-200 last:border-0">
                    <span className="text-sm font-bold text-gray-800 tracking-tight">{sym}</span>
                    {q ? (
                      <div className="flex flex-col items-end leading-tight">
                        <span className="text-sm font-mono font-semibold text-gray-900 tabular-nums">{fmtPrice(q.price)}</span>
                        <span className={`text-[11px] font-medium tabular-nums ${color}`}>{up ? '▲' : '▼'} {fmtSigned(q.change)} ({fmtSigned(q.changePct)}%)</span>
                      </div>
                    ) : (
                      <span className="text-sm font-mono text-gray-400 tabular-nums">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <WidgetSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Stock Settings"
        appearance={configAppearance} onAppearanceChange={setConfigAppearance} onSave={saveSettings}>
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">API Key</h3>
          <input value={configApiKey} onChange={e => setConfigApiKey(e.target.value)} placeholder="Finnhub API key"
            className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <p className="text-[11px] text-gray-400 mt-1">Free key from <a href="https://finnhub.io/register" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">finnhub.io</a> — quotes update every minute.</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Symbols <span className="text-[11px] font-normal text-gray-400">({configSymbols.length}/{MAX_SYMBOLS})</span></h3>
          <div className="space-y-1 mb-2">
            {configSymbols.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-1 px-2 bg-gray-50 rounded">
                <span className="text-sm font-semibold text-gray-700">{s}</span>
                <button onClick={() => setConfigSymbols(p => p.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600">&times;</button>
              </div>
            ))}
            {configSymbols.length === 0 && <p className="text-[11px] text-gray-400 italic">No symbols — add a ticker below.</p>}
          </div>
          {configSymbols.length < MAX_SYMBOLS ? (
            <div className="flex items-center gap-2">
              <input value={newSymbol} onChange={e => setNewSymbol(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSymbol(); }}
                placeholder="e.g. NVDA" className="flex-1 bg-gray-50 border border-gray-200 rounded px-2 py-1 text-sm uppercase focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <button onClick={addSymbol} className="text-sm font-medium text-blue-600 hover:text-blue-800 px-2">+ Add</button>
            </div>
          ) : (
            <p className="text-[11px] text-gray-400 italic">Max {MAX_SYMBOLS} symbols — remove one to add another.</p>
          )}
        </div>
      </WidgetSettingsModal>
    </>
  );
}
