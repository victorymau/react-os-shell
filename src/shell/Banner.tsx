/**
 * Banner — a static, in-flow alert (the counterpart to the imperative `toast`).
 * Use it for form errors, page-level notices, empty-state callouts. Tone drives
 * the background/border/icon color; the text stays neutral so it reads in dark
 * mode. All tone classes are in the dark-mode allow-list.
 */
import { type ReactNode } from 'react';

export type BannerTone = 'info' | 'success' | 'warning' | 'danger';

/**
 * How loudly the banner speaks.
 *
 * `subtle` (the default, and what every existing caller renders) is a tinted
 * panel that sits politely in a form. `solid` is a saturated full-contrast bar
 * for a condition the user must not miss and cannot work around — a till that
 * has lost the server and cannot take payment. The subtle version of that
 * message is a bug: a cashier who misses it takes money for a sale that will
 * not complete.
 */
export type BannerEmphasis = 'subtle' | 'solid';

export interface BannerProps {
  tone?: BannerTone;
  emphasis?: BannerEmphasis;
  title?: ReactNode;
  children?: ReactNode;
  /** Override the default tone icon. */
  icon?: ReactNode;
  /**
   * What to do about it — at the right edge of the banner, after the text and
   * before the dismiss ×. A `Button size="sm"`, a link, a pair of them.
   *
   * A banner that names a condition and leaves the fix somewhere else is the
   * common shape of a notice nobody acts on: "Your card was declined" with the
   * billing screen three menus away. Putting the control in the banner is the
   * whole point, and it goes beside the text rather than under it so the
   * banner keeps its one-row height in a form.
   *
   * Vertically centred against the whole box and `shrink-0`, so a two-line
   * message does not drag the button down with its last line and a long one
   * does not squeeze it — the text is what wraps.
   */
  action?: ReactNode;
  /** When provided, renders a dismiss × that calls this. */
  onDismiss?: () => void;
  /**
   * Pin to the top of the scroll container while its content scrolls past.
   *
   * `position: sticky`, so the banner still occupies layout — it pushes the
   * page down rather than covering the first row of it, which is what a
   * blocking notice needs. Defeated by any ancestor with `overflow: hidden`.
   */
  sticky?: boolean;
  className?: string;
}

const TONE: Record<BannerTone, { box: string; icon: string }> = {
  info: { box: 'bg-blue-50 border-blue-200', icon: 'text-blue-600' },
  success: { box: 'bg-green-50 border-green-200', icon: 'text-green-600' },
  warning: { box: 'bg-amber-50 border-amber-200', icon: 'text-amber-600' },
  danger: { box: 'bg-red-50 border-red-200', icon: 'text-red-600' },
};

// Solid tones are saturated -700 backgrounds with white text, all inside the
// dark-mode allow-list. Text colour is carried on the root here (rather than by
// the neutral gray-900/gray-700 the subtle variant uses on its children) so the
// title, body and dismiss control all inherit it.
const TONE_SOLID: Record<BannerTone, string> = {
  info: 'bg-blue-700 border-blue-700 text-white',
  success: 'bg-green-700 border-green-700 text-white',
  warning: 'bg-amber-700 border-amber-700 text-white',
  danger: 'bg-red-700 border-red-700 text-white',
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

export default function Banner({
  tone = 'info', emphasis = 'subtle', title, children, icon, action, onDismiss, sticky = false, className = '',
}: BannerProps) {
  const t = TONE[tone];
  const solid = emphasis === 'solid';
  // Every branch below collapses to the original string when emphasis is
  // 'subtle' and sticky is false, so existing callers render byte-identically.
  const box = solid ? TONE_SOLID[tone] : t.box;
  const stick = sticky ? 'sticky top-0 z-30' : '';
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`${stick} flex items-start gap-3 rounded-lg border px-4 py-3 ${box} ${className}`.trim()}
    >
      <span className={`mt-0.5 shrink-0 ${solid ? '' : t.icon}`.trim()}>{icon ?? <ToneIcon tone={tone} />}</span>
      <div className="min-w-0 flex-1 text-sm">
        {title && <div className={`font-semibold ${solid ? '' : 'text-gray-900'}`.trim()}>{title}</div>}
        {children && (
          <div className={`${solid ? '' : 'text-gray-700'} ${title ? 'mt-0.5' : ''}`.trim()}>{children}</div>
        )}
      </div>
      {/* `self-center` against the row's `items-start`: the icon and the text
          hang from the top because that is where the first line is, and an
          action has no first line to align to. */}
      {action != null && <div className="shrink-0 self-center">{action}</div>}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className={`shrink-0 ${solid ? 'opacity-80 hover:opacity-100' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l8 8M14 6l-8 8" />
          </svg>
        </button>
      )}
    </div>
  );
}
