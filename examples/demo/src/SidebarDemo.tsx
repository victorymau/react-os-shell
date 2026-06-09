import { useState } from 'react';
import { SidebarLayout } from 'react-os-shell';

/**
 * Demo for the shell's <SidebarLayout> primitive — a two-pane layout with a
 * drag-to-resize sidebar. Drag the sidebar's inner edge to resize (double-click
 * the handle to reset); the width persists via `storageKey`. The button in the
 * content pane flips the sidebar between the left and right edges.
 *
 * The window registers with `flushBody: true` so the sidebar runs flush from
 * under the title bar to the bottom with no surrounding padding.
 */
const SECTIONS = [
  {
    id: 'overview',
    label: 'Overview',
    body: 'SidebarLayout gives you a resizable sidebar next to a flexible content pane — the building block behind Contacts, the Todo app and the Preferences window.',
  },
  {
    id: 'resize',
    label: 'Resize me',
    body: 'Grab the thin handle on the sidebar’s inner edge and drag to resize. Double-click it to snap back to the default width. The width is remembered per window via the storageKey prop.',
  },
  {
    id: 'side',
    label: 'Either side',
    body: 'Use the “Dock sidebar” button to move the sidebar to the right edge. On the right, the resize handle sits on its left edge and the divider border flips accordingly.',
  },
  {
    id: 'content',
    label: 'Your content',
    body: 'The sidebar and the main pane both take arbitrary React content — a nav list here, but it could be a tree, a filter panel, a master list, anything.',
  },
];

export default function SidebarDemo() {
  const [selectedId, setSelectedId] = useState(SECTIONS[0].id);
  const [side, setSide] = useState<'left' | 'right'>('left');
  const selected = SECTIONS.find(s => s.id === selectedId) ?? SECTIONS[0];

  return (
    <SidebarLayout
      side={side}
      storageKey="demo.sidebar.width"
      defaultWidth={240}
      sidebar={
        <div className="p-2">
          <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Sections
          </div>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`block w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                s.id === selectedId
                  ? 'bg-blue-50 font-medium text-blue-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="max-w-2xl p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold text-gray-900">{selected.label}</h1>
          <button
            onClick={() => setSide(s => (s === 'left' ? 'right' : 'left'))}
            className="shrink-0 rounded-md border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            Dock sidebar: {side}
          </button>
        </div>
        <p className="text-sm leading-relaxed text-gray-600">{selected.body}</p>
        <p className="mt-6 border-t border-gray-100 pt-3 text-[11px] italic text-gray-400">
          Drag the sidebar’s inner edge to resize; double-click the handle to reset. Width persists
          via <code>storageKey="demo.sidebar.width"</code>.
        </p>
      </div>
    </SidebarLayout>
  );
}
