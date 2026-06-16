import { useWindowManager, glassStyle, toggleExposeMode } from 'react-os-shell';

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
      <p>The preset used by the Spreadsheets and Browser apps. Sizes are presets (<Chip>sm</Chip> <Chip>md</Chip> <Chip>lg</Chip> <Chip>xl</Chip> <Chip>2xl</Chip> <Chip>3xl</Chip>); the ⤢ button or a title-bar double-click takes any window truly full-screen.</p>
    </Body>
  );
}

export function GiantWindow() {
  return (
    <Body title="Giant (3xl)" flags={["size: '3xl'"]}>
      <p>The biggest preset — 1408&nbsp;px wide, for dashboards and side-by-side editors that want more room than <Chip>2xl</Chip> (1152&nbsp;px) without going full-screen.</p>
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
    // Widget windows are a transparent canvas — the widget paints its own
    // background (Weather's sky gradient, Calculator's keypad). This one
    // uses the shell's frosted glass so it stays readable over anything.
    <div className="h-full rounded-2xl" style={glassStyle()}>
      <div className="p-4 text-sm text-gray-600 space-y-2">
        <h3 className="text-sm font-semibold text-gray-900">Widget</h3>
        <div className="flex flex-wrap gap-1">
          <Chip>{'widget: true'}</Chip> <Chip>{'utility: true'}</Chip> <Chip>{'allowPinOnTop: true'}</Chip>
        </div>
        <p>No title bar — drag anywhere on the body, right-click for close / pin, and no taskbar tab. The window itself is transparent; widgets bring their own background, like this glass.</p>
      </div>
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
    <Body title="Auto height" flags={['autoHeight: true', 'autoMinHeight: 280', "size: 'sm'"]}>
      <p>The window measures its content and sizes itself — no empty space below this text. <Chip>autoMinHeight</Chip> sets the floor (default 240&nbsp;px) so very short content still gets a usable window.</p>
    </Body>
  );
}

// REPRO: an autoHeight window whose root is a fill-height layout
// (header / flex-1 scroll region / footer). Before the fix this collapsed to
// the autoMinHeight floor; now it opens at the size-ladder height and the
// inner region scrolls.
export function AutoHeightFillWindow() {
  return (
    <div className="flex h-full flex-col text-sm">
      <div className="shrink-0 border-b border-gray-200 px-4 py-2 font-semibold text-gray-900">Fill-height header</div>
      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-2 text-gray-600">
        <p>This window's root uses <Chip>h-full</Chip> with a <Chip>flex-1</Chip> scroll region — the common detail-modal layout. It must open at the ladder height, not collapse to a sliver.</p>
        {Array.from({ length: 30 }, (_, i) => <div key={i} className="rounded bg-gray-50 px-3 py-2">Row {i + 1}</div>)}
      </div>
      <div className="shrink-0 border-t border-gray-200 px-4 py-2 text-gray-500">Fill-height footer</div>
    </div>
  );
}

export function MultiInstanceWindow() {
  return (
    <Body title="Multi-instance" flags={['multiInstance: true', 'autoHeight: true']}>
      <p>Every <Chip>openPage(route)</Chip> opens a <em>new</em> copy instead of refocusing the existing one — click the card's Open button a few times and watch the taskbar group the instances under one icon. The Spreadsheets, Documents and Browser apps work this way.</p>
    </Body>
  );
}

export function PositionedWindow() {
  return (
    <Body title="Initial position" flags={["initialPosition: 'top-right'", 'autoHeight: true']}>
      <p>Skips the default center placement and opens anchored to the top-right corner — the hint the bundled Notepad uses so it lands like a notepad. <Chip>'top-left'</Chip> is the other preset.</p>
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
  { route: '/win-full', name: 'Full size', flags: ["size: '2xl'"], blurb: 'The big-app preset; ⤢ maximizes any window the rest of the way.' },
  { route: '/win-3xl', name: 'Giant', flags: ["size: '3xl'"], blurb: 'Bigger than 2xl — 1408 px for dashboards and split views.' },
  { route: '/win-compact', name: 'Compact title', flags: ['compact: true'], blurb: 'Slim header with title + close only, no footer.' },
  { route: '/win-widget', name: 'Widget', flags: ['widget: true', 'utility: true'], blurb: 'No title bar — drag the body, right-click for actions, no taskbar tab.' },
  { route: '/win-app', name: 'App style', flags: ['appStyle: true'], blurb: 'Small title bar, zero padding — for apps with their own chrome.' },
  { route: '/win-flush', name: 'Flush body', flags: ['flushBody: true'], blurb: 'Standard chrome, edge-to-edge body for sidebar layouts.' },
  { route: '/win-auto', name: 'Auto height', flags: ['autoHeight: true', 'autoMinHeight: 280'], blurb: 'Window height hugs the content, with a floor.' },
  { route: '/win-auto-fill', name: 'Auto height (fill)', flags: ['autoHeight: true', "size: 'md'"], blurb: 'A fill-height root (header / flex-1 / footer) opens at the ladder height instead of collapsing.' },
  { route: '/win-pinned', name: 'Pin on top', flags: ['allowPinOnTop: true'], blurb: 'Title-bar pin keeps the window above everything.' },
  { route: '/win-multi', name: 'Multi-instance', flags: ['multiInstance: true'], blurb: 'Each Open spawns another copy — the taskbar groups them.' },
  { route: '/win-pos', name: 'Initial position', flags: ["initialPosition: 'top-right'"], blurb: 'Opens anchored to a corner instead of centered.' },
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
          style — stack a few up, minimize them, drag them around. (This
          launcher itself is a standard <code className="text-xs bg-gray-100 rounded px-1">size: 'lg'</code> window.)
        </p>
        <button
          onClick={() => {
            // Make sure there's something to tile, then fan everything out.
            openPage('/win-standard');
            openPage('/win-compact');
            setTimeout(() => toggleExposeMode(), 350);
          }}
          className="mt-2 px-2.5 py-1 text-xs rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 shadow-sm"
        >
          Try Exposé — tile every open window
        </button>
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
