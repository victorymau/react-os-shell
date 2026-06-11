import { useEffect } from 'react';

/**
 * Keyboard Shortcuts — surfaces the shell's <ShortcutHelp> overlay (the
 * frosted panel listing global / list / form hotkeys). The overlay is
 * always mounted by <Layout> and toggles on the `?` key; this window exists
 * so it's discoverable from the start menu, and pops the overlay open the
 * moment it mounts.
 */
export default function ShortcutsDemo() {
  useEffect(() => {
    document.dispatchEvent(new Event('toggle-shortcut-help'));
  }, []);

  return (
    <div className="p-4 text-sm text-gray-600 space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">Keyboard shortcuts overlay</h3>
      <p>
        The overlay you're (probably) looking at is the shell's{' '}
        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">&lt;ShortcutHelp&gt;</code>{' '}
        — mounted once by <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">&lt;Layout&gt;</code>,
        toggled anywhere with <kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">?</kbd>,
        and closed with <kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">Esc</kbd>.
      </p>
      <button
        onClick={() => document.dispatchEvent(new Event('toggle-shortcut-help'))}
        className="px-3 py-1.5 text-xs rounded bg-blue-500 text-white hover:bg-blue-600"
      >
        Toggle the overlay
      </button>
      <p className="text-xs text-gray-400">
        Try a few while you're here: <kbd className="rounded border border-gray-300 bg-gray-50 px-1 py-0.5 text-[10px] text-gray-500">⌘K</kbd> search,{' '}
        <kbd className="rounded border border-gray-300 bg-gray-50 px-1 py-0.5 text-[10px] text-gray-500">Esc</kbd> closes the focused window.
      </p>
    </div>
  );
}
