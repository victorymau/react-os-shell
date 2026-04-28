import { useState, useCallback, useEffect } from 'react';
import { useWidgetSettings } from '../shell/Modal';
import WidgetSettingsModal, { loadAppearance, type WidgetAppearance } from '../shell/WidgetSettingsModal';

type Op = '+' | '-' | '×' | '÷' | null;
const CALC_SETTINGS_KEY = 'calc_appearance';

export default function Calculator() {
  const [display, setDisplay] = useState('0');
  const [prev, setPrev] = useState<number | null>(null);
  const [op, setOp] = useState<Op>(null);
  const [resetNext, setResetNext] = useState(false);
  const [lastExpr, setLastExpr] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [appearance, setAppearance] = useState(() => loadAppearance(CALC_SETTINGS_KEY));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configAppearance, setConfigAppearance] = useState<WidgetAppearance>(appearance);

  useWidgetSettings(useCallback(() => {
    setConfigAppearance({ ...appearance });
    setSettingsOpen(true);
  }, [appearance]));

  const append = useCallback((ch: string) => {
    setLastExpr('');
    setDisplay(d => {
      if (resetNext || d === '0') {
        setResetNext(false);
        return ch === '.' ? '0.' : ch;
      }
      if (ch === '.' && d.includes('.')) return d;
      return d + ch;
    });
  }, [resetNext]);

  const clear = useCallback(() => {
    setDisplay('0');
    setPrev(null);
    setOp(null);
    setResetNext(false);
  }, []);

  const compute = useCallback((a: number, b: number, operator: Op): number => {
    switch (operator) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? 0 : a / b;
      default: return b;
    }
  }, []);

  const handleOp = useCallback((nextOp: Op) => {
    const current = parseFloat(display);
    if (prev !== null && op && !resetNext) {
      const result = compute(prev, current, op);
      setDisplay(String(result));
      setPrev(result);
      setHistory(h => [`${prev} ${op} ${current} = ${result}`, ...h].slice(0, 20));
    } else {
      setPrev(current);
    }
    setOp(nextOp);
    setResetNext(true);
  }, [display, prev, op, resetNext, compute]);

  const equals = useCallback(() => {
    if (prev === null || !op) return;
    const current = parseFloat(display);
    const result = compute(prev, current, op);
    const expr = `${prev} ${op} ${current} =`;
    setHistory(h => [`${expr} ${result}`, ...h].slice(0, 20));
    setLastExpr(expr);
    setDisplay(String(result));
    setPrev(null);
    setOp(null);
    setResetNext(true);
  }, [display, prev, op, compute]);

  const percent = useCallback(() => {
    setDisplay(d => String(parseFloat(d) / 100));
  }, []);

  const negate = useCallback(() => {
    setDisplay(d => d.startsWith('-') ? d.slice(1) : d === '0' ? d : '-' + d);
  }, []);

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key >= '0' && e.key <= '9') append(e.key);
      else if (e.key === '.') append('.');
      else if (e.key === '+') handleOp('+');
      else if (e.key === '-') handleOp('-');
      else if (e.key === '*') handleOp('×');
      else if (e.key === '/') { e.preventDefault(); handleOp('÷'); }
      else if (e.key === 'Enter' || e.key === '=') equals();
      else if (e.key === 'Escape') clear();
      else if (e.key === 'Backspace') setDisplay(d => d.length > 1 ? d.slice(0, -1) : '0');
      else if (e.key === '%') percent();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [append, handleOp, equals, clear, percent]);

  const btn = 'flex items-center justify-center rounded-lg text-sm font-medium transition-colors';
  const numBtn = `${btn} bg-white border border-gray-200 text-gray-900 hover:bg-gray-50 active:bg-gray-100`;
  const opBtn = `${btn} bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 active:bg-blue-200`;
  const fnBtn = `${btn} bg-gray-100 border border-gray-200 text-gray-600 hover:bg-gray-200 active:bg-gray-300`;
  const eqBtn = `${btn} bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800`;

  // Format display for readability
  const formatDisplay = (val: string) => {
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    if (val.endsWith('.') || val.endsWith('.0')) return val;
    if (Math.abs(num) < 1e15 && val.length < 16) return val;
    return num.toExponential(6);
  };

  return (
    <>
    <div className="flex flex-col h-full" style={{
      opacity: appearance.activeOpacity / 100,
      backdropFilter: appearance.activeBlur > 0 ? `blur(${appearance.activeBlur}px)` : undefined,
    }}>
      {/* Display — 5-line area with history + current value */}
      <div className="bg-slate-200 rounded-t-lg px-4 py-2 group/display relative flex flex-col justify-end min-h-[120px] border-b border-slate-300">
        {/* History lines (most recent at bottom, above current) */}
        <div className="flex flex-col justify-end flex-1 overflow-hidden">
          {history.slice(0, 3).reverse().map((h, i) => (
            <div key={i} className="text-[11px] text-slate-400 text-right font-mono truncate">{h}</div>
          ))}
        </div>
        {/* Current expression */}
        {(lastExpr || (op && prev !== null)) && (
          <div className="text-base text-slate-600 text-right font-mono">
            {lastExpr || `${prev} ${op} ${!resetNext ? display : ''}`}
          </div>
        )}
        {/* Current value */}
        <div className="flex items-center gap-2">
          <button onClick={() => { navigator.clipboard.writeText(display); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
            title="Copy result"
            className="shrink-0 text-slate-300 hover:text-slate-500 transition-colors opacity-0 group-hover/display:opacity-100">
            {copied
              ? <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              : <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            }
          </button>
          <div className="text-right text-4xl font-mono font-bold text-slate-800 truncate flex-1">
            {formatDisplay(display)}
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="grid grid-cols-4 grid-rows-5 gap-1.5 flex-1 min-h-0 p-2">
        <button onClick={clear} className={fnBtn}>AC</button>
        <button onClick={negate} className={fnBtn}>+/−</button>
        <button onClick={percent} className={fnBtn}>%</button>
        <button onClick={() => handleOp('÷')} className={`${opBtn} ${op === '÷' ? 'ring-2 ring-blue-400' : ''}`}>÷</button>

        <button onClick={() => append('7')} className={numBtn}>7</button>
        <button onClick={() => append('8')} className={numBtn}>8</button>
        <button onClick={() => append('9')} className={numBtn}>9</button>
        <button onClick={() => handleOp('×')} className={`${opBtn} ${op === '×' ? 'ring-2 ring-blue-400' : ''}`}>×</button>

        <button onClick={() => append('4')} className={numBtn}>4</button>
        <button onClick={() => append('5')} className={numBtn}>5</button>
        <button onClick={() => append('6')} className={numBtn}>6</button>
        <button onClick={() => handleOp('-')} className={`${opBtn} ${op === '-' ? 'ring-2 ring-blue-400' : ''}`}>−</button>

        <button onClick={() => append('1')} className={numBtn}>1</button>
        <button onClick={() => append('2')} className={numBtn}>2</button>
        <button onClick={() => append('3')} className={numBtn}>3</button>
        <button onClick={() => handleOp('+')} className={`${opBtn} ${op === '+' ? 'ring-2 ring-blue-400' : ''}`}>+</button>

        <button onClick={() => append('0')} className={`${numBtn} col-span-2`}>0</button>
        <button onClick={() => append('.')} className={numBtn}>.</button>
        <button onClick={equals} className={eqBtn}>=</button>
      </div>

    </div>
    <WidgetSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Calculator Settings"
      appearance={configAppearance} onAppearanceChange={setConfigAppearance}
      onSave={() => { setAppearance(configAppearance); localStorage.setItem(CALC_SETTINGS_KEY, JSON.stringify(configAppearance)); setSettingsOpen(false); }} />
    </>
  );
}
