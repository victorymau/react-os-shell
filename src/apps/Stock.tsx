import { useState, useCallback } from 'react';
import { useWidgetSettings } from '../shell/Modal';
import WidgetSettingsModal, { loadAppearance, type WidgetAppearance } from '../shell/WidgetSettingsModal';

/**
 * Stock ticker widget — track a watchlist of equities with demo prices.
 *
 * Prices are static, in-file demo data (DEMO_QUOTES) so the widget works with
 * no API key and no server. "Setup" is just picking which demo tickers to show.
 */

/** Cap the watchlist — keeps the widget compact. */
const MAX_SYMBOLS = 8;
const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA'];

const SYMBOLS_KEY = 'stock_symbols';
const SETTINGS_KEY = 'stock_appearance';

interface Quote { price: number; change: number; changePct: number }

/** Static demo quotes — realistic-ish values, a mix of gainers and losers. */
const DEMO_QUOTES: Record<string, Quote> = {
  AAPL: { price: 229.87, change: 1.42, changePct: 0.62 },
  MSFT: { price: 451.16, change: -2.31, changePct: -0.51 },
  GOOGL: { price: 178.34, change: 0.89, changePct: 0.50 },
  AMZN: { price: 201.45, change: -1.08, changePct: -0.53 },
  TSLA: { price: 248.92, change: 6.74, changePct: 2.78 },
  NVDA: { price: 134.81, change: -3.12, changePct: -2.26 },
  META: { price: 563.27, change: 4.55, changePct: 0.81 },
};

/** Demo tickers offered in the symbol picker. */
const DEMO_TICKERS = Object.keys(DEMO_QUOTES);

function loadSymbols(): string[] {
  try { const s = JSON.parse(localStorage.getItem(SYMBOLS_KEY) || ''); if (Array.isArray(s) && s.length) return s.slice(0, MAX_SYMBOLS); } catch {}
  return DEFAULT_SYMBOLS;
}

const fmtPrice = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtSigned = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;

export default function Stock() {
  const [symbols, setSymbols] = useState(loadSymbols);
  const [appearance, setAppearance] = useState(() => loadAppearance(SETTINGS_KEY));

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configSymbols, setConfigSymbols] = useState<string[]>([]);
  const [configAppearance, setConfigAppearance] = useState<WidgetAppearance>(appearance);
  const [newSymbol, setNewSymbol] = useState('');

  const openSettings = useCallback(() => {
    setConfigSymbols([...symbols]);
    setConfigAppearance({ ...appearance });
    setNewSymbol('');
    setSettingsOpen(true);
  }, [symbols, appearance]);

  useWidgetSettings(openSettings);

  const addSymbol = () => {
    const s = newSymbol.trim().toUpperCase();
    if (!s || configSymbols.includes(s) || configSymbols.length >= MAX_SYMBOLS) return;
    setConfigSymbols(p => [...p, s]);
    setNewSymbol('');
  };

  const saveSettings = () => {
    const cleaned = configSymbols.map(s => s.toUpperCase()).slice(0, MAX_SYMBOLS);
    setSymbols(cleaned); setAppearance(configAppearance);
    localStorage.setItem(SYMBOLS_KEY, JSON.stringify(cleaned));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(configAppearance));
    setSettingsOpen(false);
  };

  // Tickers the picker can still offer (demo set minus what's already added).
  const availableTickers = DEMO_TICKERS.filter(t => !configSymbols.includes(t));

  return (
    <>
      {/* Theme-aware panel — mirrors the taskbar's `--taskbar-bg-rgb` so the
       *  widget matches it across themes; gray-* classes auto-invert in dark.
       *
       *  A plain naturally-flowing div — deliberately no `h-full`/`flex-1`, so
       *  the window's `autoHeight` measurement hugs these rows instead of
       *  reading the root as fill-height and pinning the window to its full
       *  `dimensions` height (320×360) with empty space below the rows. */}
      <div
        style={{ backgroundColor: `rgb(var(--taskbar-bg-rgb, 243 244 246) / ${appearance.activeOpacity / 100})`, backdropFilter: appearance.activeBlur > 0 ? `blur(${appearance.activeBlur}px)` : undefined }}>
        <div className="px-4 py-3">
          {symbols.length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-6">No symbols yet — add some in settings.</div>
          ) : (
            <div className="space-y-0.5">
              {symbols.map(sym => {
                const q = DEMO_QUOTES[sym];
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
          {availableTickers.length > 0 && configSymbols.length < MAX_SYMBOLS && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {availableTickers.map(t => (
                <button key={t} onClick={() => setConfigSymbols(p => p.length < MAX_SYMBOLS ? [...p, t] : p)}
                  className="text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded px-2 py-0.5 transition-colors">{t}</button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-gray-400 mt-2">Demo prices — static sample data, no live feed.</p>
        </div>
      </WidgetSettingsModal>
    </>
  );
}
