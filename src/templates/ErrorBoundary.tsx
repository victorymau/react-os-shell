/**
 * ErrorBoundary — catches a render crash and shows the 500 page instead of a
 * blank screen.
 *
 * `WindowErrorBoundary` already exists and is not this: it guards one desktop
 * window's body so the taskbar and the other windows keep running, and its
 * fallback is sized to sit inside window chrome. A portal is a plain React app
 * with no windows, so it needs a boundary whose fallback is a whole page. Every
 * portal has written that boundary itself, and each one hard-coded its own
 * colours to do it.
 *
 * Two things the hand-written ones get wrong, worth naming because they are
 * the reason this is a component rather than a snippet:
 *
 *  - They print `error.stack` into the page. In development that is the useful
 *    part; in production it hands a visitor the internal module layout. Here
 *    the detail is opt-in and off by default.
 *  - They swap the content out silently. A crash is exactly the moment a screen
 *    reader user is owed an announcement, so the fallback is `role="alert"`.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import ErrorPage from './ErrorPage';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Replaces the default page. `reset` clears the caught error so the children
   * mount again — worth offering when the cause may have been transient.
   */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /**
   * What the user can do about it, rendered under the default page. The kit has
   * no router, so a link home has to come from the consumer — the same reason
   * {@link ErrorPage} takes its actions rather than inventing them.
   */
  actions?: ReactNode;
  /**
   * Called with the caught error. This is where a consumer reports to Sentry or
   * its own logger; without it a crash is only ever a `console.error` in a
   * browser nobody is looking at.
   */
  onError?: (error: Error, info: ErrorInfo) => void;
  /**
   * Show the message and stack on the page. Defaults to OFF. Pass
   * `import.meta.env.DEV` to get the detail while developing and nothing in
   * production — the value is the consumer's because the kit is built once and
   * cannot read the app's mode.
   */
  showDetails?: boolean;
  /**
   * Clears the error when any entry changes — typically the current path, so
   * navigating away from a crashed page recovers instead of holding the
   * fallback until a full reload.
   */
  resetKeys?: unknown[];
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept even when `onError` is supplied: a reporter that is itself broken
    // would otherwise swallow the only record of the crash.
    console.error('ErrorBoundary caught an error:', error, info);
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (!this.state.error) return;
    const [a, b] = [prev.resetKeys, this.props.resetKeys];
    if (a && b && (a.length !== b.length || a.some((k, i) => !Object.is(k, b[i])))) {
      this.reset();
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div role="alert" className="h-full">
        <ErrorPage
          code={500}
          actions={
            <>
              <button
                type="button"
                onClick={this.reset}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                Try again
              </button>
              {this.props.actions}
            </>
          }
        />
        {this.props.showDetails && (
          <details className="mx-auto mt-4 max-w-2xl px-6 pb-6">
            <summary className="cursor-pointer text-sm font-medium text-gray-600">Error details</summary>
            <pre className="mt-2 overflow-auto rounded-md bg-gray-100 p-3 text-xs text-gray-700">
              {error.stack ?? error.message}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
