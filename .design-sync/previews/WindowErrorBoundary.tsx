import { WindowErrorBoundary } from 'react-os-shell';

// WindowErrorBoundary catches a render error in a window's body and shows an
// inline crash card (the default WindowCrashedFallback) with a Reload action,
// so one broken window never takes down the whole desktop.
function Boom(): JSX.Element {
  throw new Error('Failed to load widget data (HTTP 500)');
}

export function DefaultFallback() {
  return (
    <div className="p-6">
      <WindowErrorBoundary>
        <Boom />
      </WindowErrorBoundary>
    </div>
  );
}

export function CustomFallback() {
  return (
    <div className="p-6">
      <WindowErrorBoundary
        fallback={(error, reset) => (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-semibold">This panel hit a snag</p>
            <p className="mt-1 text-amber-700">{error.message}</p>
            <button
              onClick={reset}
              style={{ backgroundColor: '#d97706' }}
              className="mt-3 rounded-md px-3 py-1 text-xs font-medium text-white"
            >
              Try again
            </button>
          </div>
        )}
      >
        <Boom />
      </WindowErrorBoundary>
    </div>
  );
}
