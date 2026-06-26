import { DevIndicator } from 'react-os-shell';

// DevIndicator — a system-tray badge that appears ONLY when the app is served
// from localhost / 127.0.0.1, warning that you're running against a local
// backend. It renders nothing on deployed hosts. Shown here in a mock taskbar
// tray, the slot it's designed for.
export function InTaskbarTray() {
  return (
    <div className="p-5">
      <div className="flex items-center justify-end gap-3 rounded-md bg-gray-900 px-3 py-2">
        <DevIndicator />
        <svg className="h-4 w-4 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <span className="text-xs font-medium text-gray-200">3:42 PM</span>
      </div>
    </div>
  );
}

// On its own, against a light tray surface.
export function Badge() {
  return (
    <div className="p-5">
      <div className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
        <DevIndicator />
        <span className="text-xs text-gray-500">Visible only on localhost</span>
      </div>
    </div>
  );
}
