/**
 * Server connectivity indicator for the system tray.
 *
 * Renders a small globe icon coloured by the result of polling a
 * consumer-supplied health check. Click the icon to open a popover with
 * detailed connection info — server host, latency, last successful ping,
 * signed-in user, app/build version, browser network state.
 *
 *   green  — last poll succeeded
 *   amber  — initial check still in flight
 *   red    — last poll failed (network down, server down, timeout,
 *            or non-2xx response). Pulses to draw attention.
 *
 * Polls every `pollMs` (default 15 s). The default health check applies a
 * `requestTimeoutMs` (default 5 s) per-request timeout via AbortController;
 * a custom `healthCheck` owns its own timeout. Latency is captured around
 * each poll and shown live in the popover.
 *
 * Product-agnostic: the shell never hardcodes an endpoint, auth context, or
 * app version. The consumer injects the health check, the signed-in user's
 * display fields, and the build label via props (a thin per-app wrapper).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { VERSION } from '../version';

const DEFAULT_POLL_MS = 15_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;

type Status = 'checking' | 'connected' | 'disconnected';

/** Result of a single health poll. `latencyMs` is optional; when omitted on
 *  an ok result the indicator simply shows no latency for that poll. */
export interface HealthCheckResult {
  ok: boolean;
  latencyMs?: number;
}

/** Display fields for the signed-in user shown in the popover's Session
 *  section. All optional — the indicator derives a sensible name and hides
 *  the Role row when `role` is empty. Pass `null`/`undefined` for "not
 *  signed in". */
export interface ServerStatusUser {
  name?: string;
  email?: string;
  /** Secondary label for the Role row (e.g. group names, portal, company).
   *  Hidden when empty. */
  role?: string;
}

export interface ServerStatusIndicatorProps {
  /**
   * Performs one health poll and resolves with the outcome. The shell calls
   * this on mount and on every interval tick. A custom implementation owns
   * its own timeout/abort. When omitted, the indicator polls `healthUrl`
   * (default `/api/health/`) with a `requestTimeoutMs` AbortController.
   */
  healthCheck?: () => Promise<HealthCheckResult>;
  /** URL used by the built-in fetcher when no `healthCheck` is supplied. */
  healthUrl?: string;
  /** Poll interval in ms. Default 15 000. */
  pollMs?: number;
  /** Per-request timeout for the built-in fetcher, in ms. Default 5 000. */
  requestTimeoutMs?: number;
  /** Signed-in user's display fields for the Session section. */
  user?: ServerStatusUser | null;
  /** Build/version label for the Build section. Defaults to the shell's own
   *  package version. Pass the consuming app's version here. */
  version?: string;
}

function timeAgo(date: Date | null): string {
  if (!date) return '—';
  const diff = Math.max(0, Date.now() - date.getTime());
  if (diff < 1500) return 'just now';
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
}

/**
 * System-tray globe that polls a health check and exposes connection details
 * in a click-to-open popover. Drop into a taskbar tray alongside the
 * notification bell; supply `healthCheck` (or `healthUrl`), `user`, and
 * `version` via a thin per-app wrapper.
 */
export default function ServerStatusIndicator({
  healthCheck,
  healthUrl = '/api/health/',
  pollMs = DEFAULT_POLL_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  user,
  version = VERSION,
}: ServerStatusIndicatorProps) {
  const [status, setStatus] = useState<Status>('checking');
  const [lastOkAt, setLastOkAt] = useState<Date | null>(null);
  const [lastFailAt, setLastFailAt] = useState<Date | null>(null);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [browserOnline, setBrowserOnline] = useState<boolean>(navigator.onLine);
  const [open, setOpen] = useState(false);
  const [popPos, setPopPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  // Tick state forces a re-render once per second while the popover is
  // open so the "5s ago / 12s ago" relative timestamps stay live.
  const [, setTick] = useState(0);
  const cancelRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Keep the latest health-check props in a ref so the polling effect's
  // dependency list stays stable — a fresh inline `healthCheck` on every
  // render must not tear down and restart the interval each time.
  const healthCheckRef = useRef(healthCheck);
  const healthUrlRef = useRef(healthUrl);
  const requestTimeoutRef = useRef(requestTimeoutMs);
  healthCheckRef.current = healthCheck;
  healthUrlRef.current = healthUrl;
  requestTimeoutRef.current = requestTimeoutMs;

  const ping = useCallback(async () => {
    const t0 = performance.now();
    try {
      let result: HealthCheckResult;
      if (healthCheckRef.current) {
        result = await healthCheckRef.current();
      } else {
        // Built-in fetcher: GET the health URL with a per-request timeout.
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), requestTimeoutRef.current);
        try {
          const res = await fetch(healthUrlRef.current, {
            method: 'GET',
            cache: 'no-store',
            signal: ctrl.signal,
          });
          result = { ok: res.ok, latencyMs: Math.round(performance.now() - t0) };
        } finally {
          clearTimeout(timer);
        }
      }
      if (cancelRef.current) return;
      if (result.ok) {
        setStatus('connected');
        setLastOkAt(new Date());
        setLastLatencyMs(result.latencyMs ?? Math.round(performance.now() - t0));
      } else {
        setStatus('disconnected');
        setLastFailAt(new Date());
      }
    } catch {
      if (!cancelRef.current) {
        setStatus('disconnected');
        setLastFailAt(new Date());
      }
    }
  }, []);

  useEffect(() => {
    cancelRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount-time health poll; ping() sets state only in async fetch/catch continuations (post-commit), and the immediate-on-mount + interval timing must be preserved
    ping();
    const id = setInterval(ping, pollMs);
    return () => {
      cancelRef.current = true;
      clearInterval(id);
    };
  }, [ping, pollMs]);

  // Browser-level network events — independent signal from the API
  // poll so the popover can distinguish "you're offline" from "the
  // server is down".
  useEffect(() => {
    const onOnline = () => setBrowserOnline(true);
    const onOffline = () => setBrowserOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Keep relative timestamps fresh while the popover is open.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [open]);

  // Anchor the popover horizontally centred on the icon. Vertically,
  // flip to ABOVE the icon when the icon sits in the lower half of
  // the viewport (taskbar-at-bottom case) — otherwise the popover
  // would extend below the screen edge or be hidden by the taskbar.
  // Recompute on resize and once after the popover renders, so we
  // can use its actual measured height instead of an estimate.
  const placePopover = useCallback(() => {
    if (!buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const popW = 320;
    // Estimated until the popover mounts; we re-place once we have
    // the real measurement (see useLayoutEffect below). 320 is the
    // typical popover height for a connected session.
    const popH = popRef.current?.offsetHeight || 320;

    // Horizontal: centre on the icon's midpoint, clamp to viewport
    // so the popover never bleeds off either edge.
    const iconCenterX = r.left + r.width / 2;
    const left = Math.max(8, Math.min(window.innerWidth - popW - 8, iconCenterX - popW / 2));

    // Vertical: flip above when the icon is in the lower half of
    // the viewport (covers the taskbar-at-bottom layout that's the
    // default in this app). The 6 px gap matches the bell's spacing.
    const iconCenterY = r.top + r.height / 2;
    const popAbove = iconCenterY > window.innerHeight / 2;
    const top = popAbove
      ? Math.max(8, r.top - popH - 6)
      : r.bottom + 6;

    setPopPos({ left, top });
  }, []);

  useEffect(() => {
    if (!open) return;
    placePopover();
    window.addEventListener('resize', placePopover);
    return () => window.removeEventListener('resize', placePopover);
  }, [open, placePopover]);

  // Once the popover actually mounts we know its real height — re-place
  // synchronously before paint so the popover never visibly jumps from
  // the height estimate to the measured value.
  useLayoutEffect(() => {
    if (open && popRef.current) placePopover();
  }, [open, placePopover]);

  // Click-outside + Escape closes the popover.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const colour =
    status === 'connected' ? '#16a34a' /* green-600 */
    : status === 'disconnected' ? '#dc2626' /* red-600 */
    : '#9ca3af'; /* gray-400 */
  const label =
    status === 'connected' ? 'Connected'
    : status === 'disconnected' ? 'Disconnected'
    : 'Checking…';
  const dotClass =
    status === 'connected' ? 'bg-green-500'
    : status === 'disconnected' ? 'bg-red-500'
    : 'bg-gray-400';

  const userName =
    user
      ? (user.name?.trim() || user.email || '—')
      : 'Not signed in';
  const userRole = user?.role || '';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`shrink-0 inline-flex items-center justify-center rounded-md p-2 transition-colors hover:bg-white/20 ${
          status === 'disconnected' && !open ? 'animate-pulse' : ''
        }`}
        title={`${label}${lastOkAt ? ` · last ok ${lastOkAt.toLocaleTimeString()}` : ''}`}
        aria-label={label}
        aria-expanded={open}
      >
        {/* Globe — meridian + equator strokes coloured by connection state. */}
        {/* h-5 matches the notification bell so all tray icons get the same
            hover pill. */}
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke={colour}
          strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label="Server connection details"
          style={{ position: 'fixed', left: popPos.left, top: popPos.top, width: 320, zIndex: 10_000 }}
          className="rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden text-gray-800"
        >
          {/* Header — status pill + headline timing. */}
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${dotClass} ${status === 'disconnected' ? 'animate-pulse' : ''}`} />
              <span className="text-sm font-semibold text-gray-900">{label}</span>
              {status === 'connected' && lastLatencyMs != null && (
                <span className="ml-auto text-[11px] text-gray-500 tabular-nums">{lastLatencyMs} ms</span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              {status === 'connected' && lastOkAt && <>Last poll {timeAgo(lastOkAt)}.</>}
              {status === 'disconnected' && lastFailAt && <>Last failure {timeAgo(lastFailAt)}.</>}
              {status === 'checking' && <>First poll in flight…</>}
            </p>
          </div>

          {/* Detail rows. Two-column grid: label / value, label is
              fixed width so values align tidily. */}
          <dl className="px-4 py-3 text-[12px] grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5">
            <dt className="text-gray-500">Server</dt>
            <dd className="font-mono text-gray-900 truncate" title={window.location.origin}>{window.location.host}</dd>

            <dt className="text-gray-500">Protocol</dt>
            <dd className="text-gray-900">{window.location.protocol.replace(':', '').toUpperCase()}</dd>

            <dt className="text-gray-500">Browser</dt>
            <dd className={browserOnline ? 'text-gray-900' : 'text-red-600 font-medium'}>
              {browserOnline ? 'Online' : 'Offline'}
            </dd>

            <dt className="text-gray-500">Last OK</dt>
            <dd className="text-gray-900">
              {lastOkAt ? (
                <>
                  <span className="tabular-nums">{lastOkAt.toLocaleTimeString()}</span>
                  <span className="text-gray-400 ml-1">· {timeAgo(lastOkAt)}</span>
                </>
              ) : '—'}
            </dd>

            {lastFailAt && (
              <>
                <dt className="text-gray-500">Last fail</dt>
                <dd className="text-gray-900">
                  <span className="tabular-nums">{lastFailAt.toLocaleTimeString()}</span>
                  <span className="text-gray-400 ml-1">· {timeAgo(lastFailAt)}</span>
                </dd>
              </>
            )}

            <dt className="text-gray-500">Latency</dt>
            <dd className="text-gray-900 tabular-nums">
              {lastLatencyMs != null ? `${lastLatencyMs} ms` : '—'}
            </dd>

            <dt className="text-gray-500">Poll</dt>
            <dd className="text-gray-900">every {Math.round(pollMs / 1000)} s</dd>

            <dt className="text-gray-500 mt-2 col-span-2 border-t border-gray-100 pt-2 text-[10px] uppercase tracking-wide font-semibold">Session</dt>

            <dt className="text-gray-500">User</dt>
            <dd className="text-gray-900 truncate" title={userName}>{userName}</dd>

            {userRole && (
              <>
                <dt className="text-gray-500">Role</dt>
                <dd className="text-gray-900 truncate" title={userRole}>{userRole}</dd>
              </>
            )}

            <dt className="text-gray-500 mt-2 col-span-2 border-t border-gray-100 pt-2 text-[10px] uppercase tracking-wide font-semibold">Build</dt>

            <dt className="text-gray-500">App</dt>
            <dd className="font-mono text-gray-900 text-[11px] truncate" title={version}>{version || '—'}</dd>

            <dt className="text-gray-500">UA</dt>
            <dd className="text-gray-900 text-[11px] truncate" title={navigator.userAgent}>
              {navigator.userAgent.split(' ').slice(-2).join(' ')}
            </dd>
          </dl>

          {/* Footer — manual refresh. */}
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between">
            <span className="text-[10px] text-gray-400">Click ↻ to ping now</span>
            <button
              type="button"
              onClick={() => { setStatus('checking'); ping(); }}
              disabled={status === 'checking'}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M5.5 9A7 7 0 0 1 17 6.5M18.5 15A7 7 0 0 1 7 17.5" />
              </svg>
              Refresh
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
