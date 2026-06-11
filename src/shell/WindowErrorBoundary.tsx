import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Inline crash state rendered in place of a window's content. Centers itself
 *  in whatever space the body gives it; `onReload` resets the owning boundary
 *  so the content remounts from scratch. */
export function WindowCrashedFallback({ error, onReload }: { error: Error; onReload: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <svg className="h-8 w-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-700">This window crashed</p>
        <p className="mt-1 text-xs text-gray-400 max-w-sm break-words">{error.message || String(error)}</p>
      </div>
      <button type="button" onClick={onReload}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium rounded-lg">
        Reload window
      </button>
    </div>
  );
}

interface WindowErrorBoundaryProps {
  children: ReactNode;
  /** Replaces the default inline {@link WindowCrashedFallback}. `reset`
   *  clears the caught error so the children remount. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

/**
 * Error boundary around a window's content. Without it, a page/entity
 * component that throws during render propagates to the root and unmounts the
 * entire desktop. With it, only the crashed window's body is replaced — the
 * window chrome (close/minimize), the taskbar and every other window keep
 * running. Modal wraps its body in one; WindowManager wraps each whole window
 * in another as a last resort for crashes outside the body (e.g. a registry
 * `title()` throwing on malformed data).
 */
export default class WindowErrorBoundary extends Component<WindowErrorBoundaryProps, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[react-os-shell] window content crashed:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) {
      return this.props.fallback
        ? this.props.fallback(error, this.reset)
        : <WindowCrashedFallback error={error} onReload={this.reset} />;
    }
    return this.props.children;
  }
}
