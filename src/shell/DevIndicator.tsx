import { isDevEnv, DEV_BANNER_TEXT } from '../utils/env';

/**
 * System-tray badge shown only when the app is served from a developer's own
 * machine (localhost / 127.0.0.1). Drop it into the host's `taskbarTrayLeft`
 * slot — it renders nothing off-localhost, so it's safe to leave wired on every
 * build. Visibility is gated on the runtime hostname; see utils/env.ts.
 */
export default function DevIndicator() {
  if (!isDevEnv()) return null;

  return (
    <div
      className="shrink-0 inline-flex items-center gap-1 rounded-md bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-50 select-none"
      title={DEV_BANNER_TEXT}
    >
      <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
      <span>Dev</span>
    </div>
  );
}
