import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false));

export const useConfirm = () => useContext(ConfirmContext);

// Global callable — works without a hook, usable from any click handler
let globalConfirmFn: ConfirmFn = () => Promise.resolve(false);
export const confirm = (opts: ConfirmOptions | string) => globalConfirmFn(opts);

// Destructive confirm — requires typing a word (case-sensitive) to confirm
interface DestructiveConfirmOptions {
  title?: string;
  message: string;
  confirmWord: string; // e.g. "Delete" or "Cancel" — user must type this exactly
  variant?: 'danger' | 'warning';
}
type DestructiveConfirmFn = (options: DestructiveConfirmOptions) => Promise<boolean>;
let globalDestructiveConfirmFn: DestructiveConfirmFn = () => Promise.resolve(false);
export const confirmDestructive = (opts: DestructiveConfirmOptions) => globalDestructiveConfirmFn(opts);

// Prompt — windowed replacement for native window.prompt(). Resolves to the
// trimmed string, or null if the user cancelled. Empty input counts as
// cancel by default; pass `allowEmpty: true` to opt in.
interface PromptOptions {
  title?: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  allowEmpty?: boolean;
}
type PromptFn = (options: PromptOptions | string) => Promise<string | null>;
let globalPromptFn: PromptFn = () => Promise.resolve(null);
export const prompt = (opts: PromptOptions | string) => globalPromptFn(opts);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ message: '' });
  const resolveRef = useRef<(value: boolean) => void>();

  const confirmFn: ConfirmFn = useCallback((opts) => {
    const normalized = typeof opts === 'string' ? { message: opts } : opts;
    setOptions(normalized);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  // Destructive confirm state
  const [dOpen, setDOpen] = useState(false);
  const [dOptions, setDOptions] = useState<DestructiveConfirmOptions>({ message: '', confirmWord: 'Delete' });
  const [dInput, setDInput] = useState('');
  const dResolveRef = useRef<(value: boolean) => void>();

  const destructiveConfirmFn: DestructiveConfirmFn = useCallback((opts) => {
    setDOptions(opts);
    setDInput('');
    setDOpen(true);
    return new Promise<boolean>((resolve) => {
      dResolveRef.current = resolve;
    });
  }, []);

  // Prompt state
  const [pOpen, setPOpen] = useState(false);
  const [pOptions, setPOptions] = useState<PromptOptions>({});
  const [pInput, setPInput] = useState('');
  const pResolveRef = useRef<(value: string | null) => void>();

  const promptFn: PromptFn = useCallback((opts) => {
    const normalized = typeof opts === 'string' ? { message: opts } : opts;
    setPOptions(normalized);
    setPInput(normalized.defaultValue ?? '');
    setPOpen(true);
    return new Promise<string | null>((resolve) => {
      pResolveRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    globalConfirmFn = confirmFn;
    globalDestructiveConfirmFn = destructiveConfirmFn;
    globalPromptFn = promptFn;
  }, [confirmFn, destructiveConfirmFn, promptFn]);

  const handleClose = (result: boolean) => {
    setOpen(false);
    resolveRef.current?.(result);
  };

  const handleDClose = (result: boolean) => {
    setDOpen(false);
    setDInput('');
    dResolveRef.current?.(result);
  };

  const handlePClose = (commit: boolean) => {
    if (commit) {
      const trimmed = pInput.trim();
      if (!trimmed && !pOptions.allowEmpty) {
        // Empty + not opted-in to allow empty: treat Save as Cancel.
        setPOpen(false);
        pResolveRef.current?.(null);
        return;
      }
      setPOpen(false);
      pResolveRef.current?.(trimmed);
    } else {
      setPOpen(false);
      pResolveRef.current?.(null);
    }
  };

  const variant = options.variant || (options.confirmLabel?.toLowerCase().includes('delete') || options.message.toLowerCase().includes('delete') ? 'danger' : 'info');
  const confirmBtnClass = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : variant === 'warning'
    ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
    : 'bg-blue-600 hover:bg-blue-700 text-white';
  const iconClass = variant === 'danger'
    ? 'text-red-600 bg-red-100'
    : variant === 'warning'
    ? 'text-yellow-600 bg-yellow-100'
    : 'text-blue-600 bg-blue-100';

  return (
    <ConfirmContext.Provider value={confirmFn}>
      {children}
      <Dialog open={open} onClose={() => handleClose(false)} className="relative z-[9999]">
        <DialogBackdrop className="fixed inset-0 bg-black/30 transition-opacity" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="flex gap-4">
              <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${iconClass}`}>
                <ExclamationTriangleIcon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <DialogTitle className="text-base font-semibold text-gray-900">
                  {options.title || 'Confirm'}
                </DialogTitle>
                <p className="mt-2 text-sm text-gray-600">{options.message}</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => handleClose(false)}
                className="bg-white text-gray-700 border border-gray-300 px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                {options.cancelLabel || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => handleClose(true)}
                className={`px-4 py-2 text-sm font-medium rounded-lg ${confirmBtnClass}`}
              >
                {options.confirmLabel || 'OK'}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
      {/* Destructive Confirm Dialog — requires typing to confirm */}
      <Dialog open={dOpen} onClose={() => handleDClose(false)} className="relative z-[9999]">
        <DialogBackdrop className="fixed inset-0 bg-black/30 transition-opacity" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="flex gap-4">
              <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${dOptions.variant === 'warning' ? 'text-yellow-600 bg-yellow-100' : 'text-red-600 bg-red-100'}`}>
                <ExclamationTriangleIcon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <DialogTitle className="text-base font-semibold text-gray-900">
                  {dOptions.title || 'Confirm Action'}
                </DialogTitle>
                <p className="mt-2 text-sm text-gray-600">{dOptions.message}</p>
                <p className="mt-3 text-sm text-gray-700">
                  Type <kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-xs font-bold text-red-600 font-mono">{dOptions.confirmWord}</kbd> to confirm:
                </p>
                <input
                  autoFocus
                  type="text"
                  value={dInput}
                  onChange={e => setDInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && dInput === dOptions.confirmWord) handleDClose(true); }}
                  placeholder={dOptions.confirmWord}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-red-500"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => handleDClose(false)}
                className="bg-white text-gray-700 border border-gray-300 px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button type="button" onClick={() => handleDClose(true)}
                disabled={dInput !== dOptions.confirmWord}
                className={`px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-40 ${dOptions.variant === 'warning' ? 'bg-yellow-600 hover:bg-yellow-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}>
                {dOptions.confirmWord}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
      {/* Prompt Dialog — windowed replacement for window.prompt() */}
      <Dialog open={pOpen} onClose={() => handlePClose(false)} className="relative z-[9999]">
        <DialogBackdrop className="fixed inset-0 bg-black/30 transition-opacity" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <DialogTitle className="text-base font-semibold text-gray-900">
              {pOptions.title || 'Enter a value'}
            </DialogTitle>
            {pOptions.message && (
              <p className="mt-2 text-sm text-gray-600">{pOptions.message}</p>
            )}
            <input
              autoFocus
              type="text"
              value={pInput}
              onChange={(e) => setPInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePClose(true);
                else if (e.key === 'Escape') handlePClose(false);
              }}
              onFocus={(e) => e.target.select()}
              placeholder={pOptions.placeholder}
              className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => handlePClose(false)}
                className="bg-white text-gray-700 border border-gray-300 px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                {pOptions.cancelLabel || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => handlePClose(true)}
                disabled={!pOptions.allowEmpty && !pInput.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-40"
              >
                {pOptions.confirmLabel || 'OK'}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
