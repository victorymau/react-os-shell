import { useState, useEffect, useCallback } from 'react';
import { useWidgetSettings } from '../shell/Modal';
import WidgetSettingsModal, { loadAppearance, type WidgetAppearance } from '../shell/WidgetSettingsModal';

const ALL_CURRENCIES = ['USD', 'CNY', 'AUD', 'GBP', 'EUR', 'JPY', 'CAD', 'THB', 'NZD', 'SGD', 'HKD', 'CHF', 'KRW', 'INR', 'MXN', 'BRL'];

/** Cap the rate list at 4 — keeps the widget compact and avoids
 *  overwhelming the user with currencies they don't actually track. */
const MAX_PAIRS = 4;

const DEFAULT_PAIRS: [string, string][] = [
  ['USD', 'CNY'], ['USD', 'AUD'], ['GBP', 'USD'], ['USD', 'JPY'],
];

const PAIRS_KEY = 'currency_pairs';
const SETTINGS_KEY = 'currency_appearance';
const CACHE_KEY = 'currency_rates_cache';
const CACHE_TTL = 3600000;

type CacheEntry = { rates: Record<string, number>; timestamp: number };

function getCached(base: string): Record<string, number> | null {
  try { const c: Record<string, CacheEntry> = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); const e = c[base]; if (e && Date.now() - e.timestamp < CACHE_TTL) return e.rates; } catch {} return null;
}
function setCache(base: string, rates: Record<string, number>) {
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); c[base] = { rates, timestamp: Date.now() }; localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {}
}
function loadPairs(): [string, string][] {
  try {
    const s = JSON.parse(localStorage.getItem(PAIRS_KEY) || '');
    if (Array.isArray(s) && s.length) return s.slice(0, MAX_PAIRS);
  } catch {}
  return DEFAULT_PAIRS;
}

const FLAG: Record<string, string> = {
  USD: '\u{1F1FA}\u{1F1F8}', CNY: '\u{1F1E8}\u{1F1F3}', AUD: '\u{1F1E6}\u{1F1FA}',
  GBP: '\u{1F1EC}\u{1F1E7}', JPY: '\u{1F1EF}\u{1F1F5}', CAD: '\u{1F1E8}\u{1F1E6}',
  EUR: '\u{1F1EA}\u{1F1FA}', THB: '\u{1F1F9}\u{1F1ED}', NZD: '\u{1F1F3}\u{1F1FF}',
  SGD: '\u{1F1F8}\u{1F1EC}', HKD: '\u{1F1ED}\u{1F1F0}', CHF: '\u{1F1E8}\u{1F1ED}',
  KRW: '\u{1F1F0}\u{1F1F7}', INR: '\u{1F1EE}\u{1F1F3}', MXN: '\u{1F1F2}\u{1F1FD}',
  BRL: '\u{1F1E7}\u{1F1F7}',
};

export default function CurrencyConverter() {
  const [pairs, setPairs] = useState(loadPairs);
  const [appearance, setAppearance] = useState(() => loadAppearance(SETTINGS_KEY));
  const [allRates, setAllRates] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configPairs, setConfigPairs] = useState<[string, string][]>([]);
  const [configAppearance, setConfigAppearance] = useState<WidgetAppearance>(appearance);
  const [newFrom, setNewFrom] = useState('USD');
  const [newTo, setNewTo] = useState('CNY');

  useWidgetSettings(useCallback(() => {
    setConfigPairs([...pairs]);
    setConfigAppearance({ ...appearance });
    setSettingsOpen(true);
  }, [pairs, appearance]));

  useEffect(() => {
    const bases = [...new Set(pairs.map(([from]) => from))];
    let mounted = true;
    async function fetchAll() {
      setLoading(true);
      const result: Record<string, Record<string, number>> = {};
      for (const base of bases) {
        const cached = getCached(base);
        if (cached) { result[base] = cached; continue; }
        try { const res = await fetch(`https://open.er-api.com/v6/latest/${base}`); const data = await res.json(); if (data.rates) { result[base] = data.rates; setCache(base, data.rates); } } catch {}
      }
      if (mounted) { setAllRates(result); setLoading(false); }
    }
    fetchAll();
    return () => { mounted = false; };
  }, [pairs]);

  const saveSettings = () => {
    if (configPairs.length === 0) return;
    const capped = configPairs.slice(0, MAX_PAIRS);
    setPairs(capped); setAppearance(configAppearance);
    localStorage.setItem(PAIRS_KEY, JSON.stringify(capped));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(configAppearance));
    setSettingsOpen(false);
  };

  return (
    <>
      {/* Theme-aware panel — pulls the same `--taskbar-bg-rgb` colour the
       *  taskbar uses so the widget matches it across all themes
       *  (gray-100-ish on light, Catppuccin mantle in dark). Tailwind
       *  gray-* text/border classes auto-invert in dark via the existing
       *  `[data-theme="dark"]` overrides in styles.css. */}
      <div className="flex flex-col h-full rounded-2xl overflow-hidden ring-1 ring-gray-200"
        style={{ backgroundColor: `rgb(var(--taskbar-bg-rgb, 243 244 246) / ${appearance.activeOpacity / 100})`, backdropFilter: appearance.activeBlur > 0 ? `blur(${appearance.activeBlur}px)` : undefined }}>
        <div className="px-4 py-3 space-y-1 flex-1">
          {loading && <div className="text-xs text-gray-400 text-center py-4">Loading rates...</div>}
          {pairs.map(([from, to], idx) => {
            const rate = allRates[from]?.[to];
            return (
              <button key={`${from}-${to}-${idx}`} onClick={() => {
                const swapped: [string, string][] = pairs.map((p, i) => i === idx ? [p[1], p[0]] : p);
                setPairs(swapped);
                localStorage.setItem(PAIRS_KEY, JSON.stringify(swapped));
              }}
                className="flex items-center justify-between px-2 py-2 border-b border-gray-200 last:border-0 w-full hover:bg-gray-100 rounded transition-colors cursor-pointer">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">{FLAG[from] || ''}</span>
                  <span className="text-sm font-semibold text-gray-700">{from}</span>
                  <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
                  <span className="text-base">{FLAG[to] || ''}</span>
                  <span className="text-sm font-semibold text-gray-700">{to}</span>
                </div>
                <div className="text-base font-mono font-semibold text-gray-900 tabular-nums">
                  {rate != null ? rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '—'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <WidgetSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Currency Settings"
        appearance={configAppearance} onAppearanceChange={setConfigAppearance} onSave={saveSettings}>
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Currency Pairs <span className="text-[11px] font-normal text-gray-400">({configPairs.length}/{MAX_PAIRS})</span></h3>
          <div className="space-y-1 mb-2">
            {configPairs.map(([f, t], i) => (
              <div key={i} className="flex items-center justify-between py-1 px-2 bg-gray-50 rounded">
                <span className="text-sm">{FLAG[f] || ''} {f} → {FLAG[t] || ''} {t}</span>
                <button onClick={() => setConfigPairs(p => p.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600">&times;</button>
              </div>
            ))}
          </div>
          {configPairs.length < MAX_PAIRS ? (
            <div className="flex items-center gap-2">
              <select value={newFrom} onChange={e => setNewFrom(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                {ALL_CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <span className="text-gray-400">→</span>
              <select value={newTo} onChange={e => setNewTo(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                {ALL_CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <button onClick={() => { if (newFrom !== newTo && configPairs.length < MAX_PAIRS) setConfigPairs(p => [...p, [newFrom, newTo]]); }}
                className="text-sm font-medium text-blue-600 hover:text-blue-800 px-2">+ Add</button>
            </div>
          ) : (
            <p className="text-[11px] text-gray-400 italic">Max {MAX_PAIRS} pairs — remove one to add another.</p>
          )}
        </div>
      </WidgetSettingsModal>
    </>
  );
}
