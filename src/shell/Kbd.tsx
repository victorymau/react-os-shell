/**
 * Keyboard shortcuts: the platform-aware STRINGS a shortcut is written with,
 * and the badge that renders one.
 *
 * Both live here because they are one concept — a shortcut nobody can see is
 * not a shortcut — and because the strings came first: the constants have
 * shipped for years and the badge around them was left to each consumer, which
 * is how the admin portal ended up with 109 hand-written `<kbd>` elements
 * across 80 files in two different sizes.
 */
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Platform-aware modifier symbols */
export const MOD = isMac ? '\u2318' : 'Ctrl';
export const ALT = isMac ? '\u2325' : 'Alt';
export const SHIFT = '\u21E7';
export const ENTER = '\u23CE';

/** Common shortcut labels */
export const CMD_ENTER = isMac ? '\u2318\u23CE' : 'Ctrl\u23CE';
export const CMD_S = isMac ? '\u2318S' : 'Ctrl+S';
export const CMD_K = isMac ? '\u2318K' : 'Ctrl+K';
export const CMD_DOT = isMac ? '\u2318.' : 'Ctrl+.';
export const CMD_A = isMac ? '\u2318A' : 'Ctrl+A';
export const CMD_Z = isMac ? '\u2318Z' : 'Ctrl+Z';
/** Redo. Mac has no \u2318Y convention, so it is the shifted undo there. */
export const CMD_SHIFT_Z = isMac ? '\u2318\u21e7Z' : 'Ctrl+Shift+Z';
export const ALT_SHIFT_D = isMac ? '\u2325\u21E7D' : 'Alt+Shift+D';
export const ALT_SHIFT_E = isMac ? '\u2325\u21E7E' : 'Alt+Shift+E';
export const ALT_SHIFT_N = isMac ? '\u2325\u21E7N' : 'Alt+Shift+N';

export type KbdSize = 'sm' | 'md';

export interface KbdProps {
  /**
   * The shortcut, already written \u2014 one of the constants above, or any string
   * (`'Esc'`, `'\u2190'`). This component does NOT assemble a shortcut from
   * modifier flags: which symbol a platform uses is what the constants are
   * for, and two answers to that question is one too many.
   */
  keys: string;
  /**
   * `sm` is the quiet badge that rides inside another control's label \u2014 the
   * `\u2325\u21E7E` on an Edit button. `md` (the default) is the one beside a
   * primary action, where it has to be readable at a glance.
   */
  size?: KbdSize;
  /**
   * Layered on, not replacing: a consumer that themes the badge (the admin
   * portal tints the submit one with its accent) adds its own class here and
   * keeps the shape.
   */
  className?: string;
}

const KBD_BASE =
  'inline-flex items-center justify-center rounded border border-gray-200 bg-gray-50 font-medium text-gray-500';

// A Record keyed by the union, so a new rung without an entry is a compile
// error rather than an undefined class string.
const KBD_SIZES: Record<KbdSize, string> = {
  sm: 'px-1 py-0.5 text-[10px]',
  md: 'px-1.5 py-0.5 text-[11px]',
};

/**
 * The shortcut badge: a real `<kbd>`, which is what tells a screen reader that
 * `\u2318\u23CE` is a key combination and not two pieces of punctuation.
 *
 * It renders the shortcut and nothing else \u2014 no `aria-label` naming it "Command
 * Enter", because the badge is almost always INSIDE the control it belongs to
 * ("Save \u2318\u23CE") and a second name there would be read as part of the
 * button's own.
 */
export function Kbd({ keys, size = 'md', className = '' }: KbdProps) {
  return <kbd className={[KBD_BASE, KBD_SIZES[size], className].filter(Boolean).join(' ')}>{keys}</kbd>;
}
