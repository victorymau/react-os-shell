import { SidebarLayout } from 'react-os-shell';

// SidebarLayout is a two-pane layout with a drag-to-resize sidebar. `side`
// docks it left or right; `defaultWidth` sets the initial width. Both panes
// take arbitrary React content — a nav list here next to a content pane.

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'resize', label: 'Resize me' },
  { id: 'side', label: 'Either side' },
  { id: 'content', label: 'Your content' },
];

function Nav({ active }: { active: string }) {
  return (
    <div className="p-2">
      <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Sections</div>
      {SECTIONS.map(s => (
        <button
          key={s.id}
          className={`block w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
            s.id === active ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function Body({ title }: { title: string }) {
  return (
    <div className="max-w-2xl p-6">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-gray-600">
        SidebarLayout pairs a resizable sidebar with a flexible content pane — the building block
        behind Contacts, the Todo app, and the Preferences window. Drag the sidebar's inner edge to
        resize; the width persists per window via a storageKey.
      </p>
    </div>
  );
}

export function LeftDocked() {
  return (
    <div style={{ height: 360 }}>
      <SidebarLayout side="left" defaultWidth={220} sidebar={<Nav active="overview" />}>
        <Body title="Overview" />
      </SidebarLayout>
    </div>
  );
}

export function RightDocked() {
  return (
    <div style={{ height: 360 }}>
      <SidebarLayout side="right" defaultWidth={220} sidebar={<Nav active="side" />}>
        <Body title="Either side" />
      </SidebarLayout>
    </div>
  );
}
