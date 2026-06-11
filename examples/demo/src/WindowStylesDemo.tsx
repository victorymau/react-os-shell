import { useWindowManager } from 'react-os-shell';

/**
 * Window Styles — opens one real window per chrome variant the shell's
 * window registry supports (standard, full-size, compact, widget, app-style,
 * flush body, auto-height, pin-on-top). The launcher is itself a plain
 * standard window; every "Open" button goes through the same
 * `openPage(route)` the start menu uses, so each demo window behaves exactly
 * like a real app: taskbar tab, minimize, maximize, Exposé, position memory.
 *
 * The per-style window bodies are named exports — App.tsx registers each
 * under its own route with the matching registry flags.
 */

function Chip({ children }: { children: string }) {
  return <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">{children}</code>;
}

function Body({ title, flags, children }: { title: string; flags: string[]; children: React.ReactNode }) {
  return (
    <div className="p-4 text-sm text-gray-600 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <div className="mt-1.5 flex flex-wrap gap-1">{flags.map(f => <Chip key={f}>{f}</Chip>)}</div>
      </div>
      {children}
    </div>
  );
}

export function StandardWindow() {
  return (
    <Body title="Standard window" flags={["size: 'md'"]}>
      <p>The default chrome: full title bar (icon menu, minimize, maximize, close), padded scrolling body and a footer slot. Most pages and entity windows use this.</p>
      <p className="text-xs text-gray-400">Drag the title bar, resize from any edge, double-click the title to maximize.</p>
    </Body>
  );
}

export function FullSizeWindow() {
  return (
    <Body title="Full size" flags={["size: '2xl'"]}>
      <p>The largest size preset — used by the Spreadsheets and Browser apps. Sizes are presets (<Chip>sm</Chip> <Chip>md</Chip> <Chip>lg</Chip> <Chip>xl</Chip> <Chip>2xl</Chip>); the ⤢ button or a title-bar double-click takes any window truly full-screen.</p>
    </Body>
  );
}

export function CompactWindow() {
  return (
    <Body title="Compact title bar" flags={["compact: true", "size: 'sm'", 'dimensions: [340, 300]']}>
      <p>A slimmer header with just the title and close button, and no footer — the chrome the bundled games used. Right for small fixed-purpose tools.</p>
    </Body>
  );
}

export function WidgetWindow() {
  return (
    <div className="p-4 text-sm text-gray-600 space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">Widget</h3>
      <div className="flex flex-wrap gap-1">
        <Chip>{'widget: true'}</Chip> <Chip>{'utility: true'}</Chip> <Chip>{'allowPinOnTop: true'}</Chip> <Chip>{'dimensions: [320, 220]'}</Chip>
      </div>
      <p>No title bar at all — drag anywhere on the body to move it, right-click for close / pin. Utility windows also skip the taskbar, like the Weather and Calculator widgets.</p>
    </div>
  );
}

export function AppStyleWindow() {
  return (
    <div className="flex h-full flex-col text-sm">
      <div className="flex items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-600 shrink-0">
        <span className="rounded px-2 py-1 hover:bg-gray-200">File</span>
        <span className="rounded px-2 py-1 hover:bg-gray-200">Edit</span>
        <span className="rounded px-2 py-1 hover:bg-gray-200">View</span>
        <span className="ml-auto text-[10px] text-gray-400">app-owned toolbar</span>
      </div>
      <div className="flex-1 overflow-auto p-4 text-gray-600 space-y-2">
        <h3 className="text-sm font-semibold text-gray-900">App-style window</h3>
        <div className="flex flex-wrap gap-1"><Chip>{'appStyle: true'}</Chip> <Chip>{"size: 'lg'"}</Chip></div>
        <p>Small title bar with full controls, zero body padding, no footer — the window is a bare canvas for apps that bring their own chrome (Files, Documents, Preview, Browser).</p>
      </div>
    </div>
  );
}

export function FlushBodyWindow() {
  return (
    <div className="flex h-full text-sm">
      <nav className="w-40 shrink-0 border-r border-gray-200 bg-gray-50 p-2 space-y-0.5">
        {['General', 'Appearance', 'Shortcuts', 'Advanced'].map((s, i) => (
          <div key={s} className={`rounded-md px-2.5 py-1.5 text-sm ${i === 0 ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}>{s}</div>
        ))}
      </nav>
      <div className="flex-1 overflow-auto p-4 text-gray-600 space-y-2">
        <h3 className="text-sm font-semibold text-gray-900">Flush body</h3>
        <div className="flex flex-wrap gap-1"><Chip>{'flushBody: true'}</Chip> <Chip>{"size: 'lg'"}</Chip></div>
        <p>Keeps the standard full title bar and footer, but drops the body padding so two-pane layouts (like this sidebar) sit flush against the window edges. The app manages its own scrolling.</p>
      </div>
    </div>
  );
}

export function AutoHeightWindow() {
  return (
    <Body title="Auto height" flags={['autoHeight: true', "size: 'sm'"]}>
      <p>The window measures its content and sizes itself — no empty space below this text. Right for forms and simple tools with naturally-flowing content.</p>
    </Body>
  );
}

export function PinnedWindow() {
  return (
    <Body title="Pin on top" flags={['allowPinOnTop: true', "size: 'sm'"]}>
      <p>The title bar gains a 📌 pin toggle — pinned windows float above everything else, even when another window is focused. Try pinning this, then click the launcher behind it.</p>
    </Body>
  );
}

const STYLES: { route: string; name: string; flags: string[]; blurb: string }[] = [
  { route: '/win-standard', name: 'Standard', flags: ["size: 'md'"], blurb: 'Full title bar, padded body, footer slot — the default.' },
  { route: '/win-full', name: 'Full size', flags: ["size: '2xl'"], blurb: 'Largest preset; ⤢ maximizes any window the rest of the way.' },
  { route: '/win-compact', name: 'Compact title', flags: ['compact: true'], blurb: 'Slim header with title + close only, no footer.' },
  { route: '/win-widget', name: 'Widget', flags: ['widget: true', 'utility: true'], blurb: 'No title bar — drag the body, right-click for actions, no taskbar tab.' },
  { route: '/win-app', name: 'App style', flags: ['appStyle: true'], blurb: 'Small title bar, zero padding — for apps with their own chrome.' },
  { route: '/win-flush', name: 'Flush body', flags: ['flushBody: true'], blurb: 'Standard chrome, edge-to-edge body for sidebar layouts.' },
  { route: '/win-auto', name: 'Auto height', flags: ['autoHeight: true'], blurb: 'Window height hugs the content.' },
  { route: '/win-pinned', name: 'Pin on top', flags: ['allowPinOnTop: true'], blurb: 'Title-bar pin keeps the window above everything.' },
];

export default function WindowStylesDemo() {
  const { openPage } = useWindowManager();
  return (
    <div className="p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900">Window styles</h2>
        <p className="mt-1 text-sm text-gray-500 max-w-2xl">
          Every window in the shell is declared in the window registry with a
          handful of chrome flags. Each card opens a live window in that
          style — stack a few up, minimize them, hit Exposé from the taskbar
          right-click, or drag them around. (This launcher itself is a
          standard <code className="text-xs bg-gray-100 rounded px-1">size: 'lg'</code> window.)
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {STYLES.map(s => (
          <div key={s.route} className="rounded-lg border border-gray-200 bg-white p-3.5 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-gray-800">{s.name}</span>
              <button
                onClick={() => openPage(s.route)}
                className="shrink-0 px-2.5 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600"
              >
                Open
              </button>
            </div>
            <div className="flex flex-wrap gap-1">{s.flags.map(f => <Chip key={f}>{f}</Chip>)}</div>
            <p className="text-xs text-gray-500">{s.blurb}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
