/**
 * Banner — a static, in-flow alert (the counterpart to the imperative `toast`).
 * Use it for form errors, page-level notices, empty-state callouts. Tone drives
 * the background/border/icon color; the text stays neutral so it reads in dark
 * mode. All tone classes are in the dark-mode allow-list.
 */
import { type ReactNode } from 'react';

export type BannerTone = 'info' | 'success' | 'warning' | 'danger';

export interface BannerProps {
  tone?: BannerTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Override the default tone icon. */
  icon?: ReactNode;
  /** When provided, renders a dismiss × that calls this. */
  onDismiss?: () => void;
  className?: string;
}

const TONE: Record<BannerTone, { box: string; icon: string }> = {
  info: { box: 'bg-blue-50 border-blue-200', icon: 'text-blue-600' },
  success: { box: 'bg-green-50 border-green-200', icon: 'text-green-600' },
  warning: { box: 'bg-amber-50 border-amber-200', icon: 'text-amber-600' },
  danger: { box: 'bg-red-50 border-red-200', icon: 'text-red-600' },
};

function ToneIcon({ tone }: { tone: BannerTone }) {
  const common = { className: 'h-5 w-5', viewBox: '0 0 20 20', fill: 'currentColor', 'aria-hidden': true } as const;
  switch (tone) {
    case 'success':
      return <svg {...common}><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" clipRule="evenodd" /></svg>;
    case 'warning':
      return <svg {...common}><path fillRule="evenodd" d="M8.3 2.8a2 2 0 013.4 0l6 10A2 2 0 0116 16H4a2 2 0 01-1.7-3.2l6-10zM10 7a1 1 0 00-1 1v3a1 1 0 102 0V8a1 1 0 00-1-1zm0 7a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg>;
    case 'danger':
      return <svg {...common}><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.7 7.3a1 1 0 00-1.4 1.4L8.6 10l-1.3 1.3a1 1 0 101.4 1.4L10 11.4l1.3 1.3a1 1 0 001.4-1.4L11.4 10l1.3-1.3a1 1 0 10-1.4-1.4L10 8.6 8.7 7.3z" clipRule="evenodd" /></svg>;
    default:
      return <svg {...common}><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 012 0v4a1 1 0 11-2 0V9zm1-4a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg>;
  }
}

export default function Banner({ tone = 'info', title, children, icon, onDismiss, className = '' }: BannerProps) {
  const t = TONE[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${t.box} ${className}`.trim()}>
      <span className={`mt-0.5 shrink-0 ${t.icon}`}>{icon ?? <ToneIcon tone={tone} />}</span>
      <div className="min-w-0 flex-1 text-sm">
        {title && <div className="font-semibold text-gray-900">{title}</div>}
        {children && <div className={`text-gray-700 ${title ? 'mt-0.5' : ''}`.trim()}>{children}</div>}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 text-gray-400 hover:text-gray-600">
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l8 8M14 6l-8 8" />
          </svg>
        </button>
      )}
    </div>
  );
}
