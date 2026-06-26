import { WindowCrashedFallback } from 'react-os-shell';

// WindowCrashedFallback is the error-boundary UI shown in place of a window
// whose contents threw. It takes the caught Error and an onReload callback
// (wired to remount the window). Static preview: a representative Error and a
// no-op reload.
export function Crashed() {
  const error = new Error("Cannot read properties of undefined (reading 'map')");
  return (
    <div className="p-5">
      <div style={{ height: 360 }} className="rounded-lg border border-gray-200 overflow-hidden">
        <WindowCrashedFallback error={error} onReload={() => {}} />
      </div>
    </div>
  );
}
