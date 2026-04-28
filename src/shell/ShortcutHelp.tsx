import { useState, useEffect } from 'react';
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react';
import { CMD_ENTER, CMD_S, CMD_K, CMD_DOT, CMD_A, ALT_SHIFT_D, ALT_SHIFT_E, ALT_SHIFT_N } from './Kbd';

const sections = [
  {
    title: 'Global',
    shortcuts: [
      { keys: CMD_K, description: 'Search' },
      { keys: CMD_DOT, description: 'Toggle sidebar' },
      { keys: 'Ctrl F11', description: 'Toggle fullscreen' },
      { keys: 'ESC', description: 'Exit fullscreen (when no windows open)' },
      { keys: '?', description: 'Show keyboard shortcuts' },
    ],
  },
  {
    title: 'Lists',
    shortcuts: [
      { keys: 'J / \u2193', description: 'Next row' },
      { keys: 'K / \u2191', description: 'Previous row' },
      { keys: '\u23CE', description: 'Open selected row' },
      { keys: '\u21E7J / \u21E7K', description: 'Move and select' },
      { keys: '\u21E7 Click', description: 'Range select' },
      { keys: 'Space', description: 'Toggle row checkbox' },
      { keys: CMD_A, description: 'Select / deselect all' },
      { keys: ALT_SHIFT_N, description: 'Create new item' },
      { keys: ALT_SHIFT_E, description: 'Edit selected item' },
    ],
  },
  {
    title: 'Modals / Forms',
    shortcuts: [
      { keys: CMD_ENTER, description: 'Submit' },
      { keys: CMD_S, description: 'Save' },
      { keys: ALT_SHIFT_D, description: 'Save as new (duplicate)' },
      { keys: 'ESC', description: 'Close modal' },
    ],
  },
];

export default function ShortcutHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const toggle = () => setOpen(prev => !prev);
    document.addEventListener('toggle-shortcut-help', toggle);
    return () => document.removeEventListener('toggle-shortcut-help', toggle);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if ((e.target as HTMLElement)?.isContentEditable) return;
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <Dialog open={open} onClose={() => setOpen(false)} className="relative z-[9999]">
      <DialogBackdrop className="fixed inset-0 bg-black/30 transition-opacity" />
      <div className="fixed inset-0 flex items-center justify-center p-6">
        <DialogPanel className="w-full max-w-md rounded-lg bg-white shadow-xl">
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-900">Keyboard Shortcuts</h2>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-500 text-sm">
              ESC
            </button>
          </div>
          <div className="px-5 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
            {sections.map(section => (
              <div key={section.title}>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{section.title}</h3>
                <div className="space-y-1.5">
                  {section.shortcuts.map(s => (
                    <div key={s.keys + s.description} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">{s.description}</span>
                      <kbd className="inline-flex items-center rounded border border-gray-300 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600 font-mono">
                        {s.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-gray-100 text-center">
            <span className="text-xs text-gray-400">Press <kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">?</kbd> to toggle</span>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
