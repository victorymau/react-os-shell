/**
 * Snippet — a value the user is meant to copy, not to read: an API base URL, a
 * webhook endpoint, a tenant id, a shell command.
 *
 * The kit already had `CopyButton`, which is the affordance ALONE. Every
 * settings panel that needed one therefore hand-rolled the half around it — a
 * bordered box, a monospace face, a truncation rule and a `title` — and no two
 * of them came out the same width or the same height. This is that box, with
 * the button inside it.
 *
 * ── Why not `Input readOnly` ──
 * A read-only text field is still a text field: it takes a tab stop, invites an
 * edit that will not take, and reads to a screen reader as a control the user
 * is expected to fill in. A value that can only be copied is not a control. So
 * the value is plain text and the only focusable thing in the row is the button
 * that copies it.
 *
 * ── The copy path ──
 * `writeClipboard` from `shell/clipboard`, which is the kit's one clipboard
 * path (`navigator.clipboard`, falling back to `execCommand` on a throwaway
 * selection for file:// pages and older WebViews). NOT `copyToClipboard`: that
 * one toasts on SUCCESS, and this component already answers in place with the
 * check icon and the live region — two confirmations of one copy is one too
 * many. Failure still toasts, with `copyToClipboard`'s own words, because a
 * copy that silently did nothing leaves the user pasting whatever was on the
 * clipboard before.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import IconButton from './IconButton';
import { writeClipboard } from '../shell/clipboard';
import toast from '../shell/toast';

/** How long the button stays in its copied state. HeroUI's Snippet timeout. */
const COPIED_MS = 2000;

export type SnippetSize = 'sm' | 'md';
/** `bordered` sits in a form beside inputs; `flat` sits inside a card or a row
 *  that already draws its own edges. */
export type SnippetVariant = 'bordered' | 'flat';

export interface SnippetProps {
  /** The text that reaches the clipboard. Also what is SHOWN, unless
   *  `children` says otherwise. */
  value: string;
  /**
   * What is shown, when that differs from what is copied — a masked key, a
   * shortened URL, a command with its arguments marked up. The clipboard
   * always gets `value`.
   */
  children?: ReactNode;
  /**
   * A leading glyph, `aria-hidden` and never copied — `$` in front of a shell
   * command, `>` in front of a REPL line.
   *
   * There is NO default, where HeroUI defaults to `$`. A URL, a tenant id and
   * an account number are what a settings panel copies, and none of them has a
   * prompt in front of it; a component that renders one by default would put a
   * `$` on every one of them and make each caller opt out.
   */
  symbol?: ReactNode;
  /**
   * Names the value for the copy button: `"Copy {label}"`. Without it the
   * button is just "Copy", which is enough on a page with one snippet and
   * ambiguous on a page with six.
   */
  label?: string;
  /** Defaults to `md`, which is the height of an `Input` at the same rung. */
  size?: SnippetSize;
  variant?: SnippetVariant;
  /** Show the value without the affordance — for a panel that copies the whole
   *  block from somewhere else. */
  hideCopyButton?: boolean;
  /** Called after the value actually reached the clipboard, never on failure. */
  onCopy?: (value: string) => void;
  /** Wrap instead of truncating. For a value with no useful prefix — a PEM
   *  block, a multi-line command — where the first 40 characters say nothing. */
  multiline?: boolean;
  /**
   * Lands on the COPY BUTTON, not on the box — so a `FormField htmlFor` points
   * its `<label>` at something a click can focus, and the row behaves like the
   * fields above it. A `<button>` is labelable, so `for`/`id` is a real
   * association here and not a decoration.
   *
   * With `hideCopyButton` there is nothing focusable left, so it falls back to
   * the box itself: the id still has to resolve to an element, or the label
   * and the hint below point at nothing at all.
   */
  id?: string;
  /**
   * The hint or error a wrapping `FormField` generates — "this is the URL your
   * webhook posts to", "rotate this if it leaks".
   *
   * `FormField` clones its single element child with this prop, and a
   * component that does not accept it drops it on the floor: the `<p>` renders
   * under the snippet, looks wired, and is announced to nobody. It goes on the
   * same element as `id` and for the same reason — a description belongs on
   * what the user focuses.
   */
  'aria-describedby'?: string;
  className?: string;
}

const VARIANTS: Record<SnippetVariant, string> = {
  bordered: 'border border-gray-300 bg-white',
  flat: 'bg-gray-100',
};

/**
 * Padding per rung, plus the negative margin the button wears at that rung.
 *
 * The margin is what keeps the row the height of an `Input` at the same rung.
 * The button is 24px (`IconButton` `sm`) and the text line is 16px at `sm` /
 * 20px at `md`, so without it the button is what sets the height and a Snippet
 * stands 8px and 4px taller than the field beside it. Pulling the button back
 * into the padding it is already sitting in costs nothing — it still draws and
 * still takes the clicks over its full 24px.
 */
const SIZES: Record<SnippetSize, { box: string; button: string }> = {
  sm: { box: 'gap-1.5 px-2.5 py-1 text-xs', button: '-my-1' },
  md: { box: 'gap-2 px-3 py-1.5 text-sm', button: '-my-0.5' },
};

function CopyGlyph() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg className="h-4 w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function Snippet({
  value,
  children,
  symbol,
  label,
  size = 'md',
  variant = 'bordered',
  hideCopyButton = false,
  onCopy,
  multiline = false,
  id,
  'aria-describedby': describedBy,
  className = '',
}: SnippetProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A snippet unmounted inside the two seconds would otherwise set state on a
  // dead component — and in a settings panel that closes on save, that is the
  // common case rather than the edge one.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = useCallback(async () => {
    const ok = await writeClipboard(value);
    if (!ok) {
      // Same words as `copyToClipboard`'s failure path — one message for one
      // failure, wherever in the kit the copy was attempted from.
      toast.error('Could not copy to the clipboard');
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setCopied(false); timer.current = null; }, COPIED_MS);
    onCopy?.(value);
  }, [value, onCopy]);

  const { box, button } = SIZES[size];

  // The copy button is the focusable element, so it is where a label and a
  // description belong. Without one the box is all there is.
  const onButton = !hideCopyButton;

  return (
    <div
      id={onButton ? undefined : id}
      aria-describedby={onButton ? undefined : describedBy}
      className={['inline-flex max-w-full items-center rounded-md', VARIANTS[variant], box, className]
        .filter(Boolean)
        .join(' ')}
    >
      {symbol != null && symbol !== '' && (
        <span aria-hidden="true" className="shrink-0 select-none font-mono text-gray-400">{symbol}</span>
      )}
      <span
        className={`min-w-0 font-mono text-gray-800 ${multiline ? 'whitespace-pre-wrap break-all' : 'truncate'}`}
        // A truncated value has to be readable somehow; a wrapped one is
        // already fully on the screen, so a tooltip repeating it is noise.
        title={multiline ? undefined : value}
      >
        {children ?? value}
      </span>
      {!hideCopyButton && (
        <>
          <IconButton
            id={id}
            aria-label={label ? `Copy ${label}` : 'Copy'}
            aria-describedby={describedBy}
            onClick={copy}
            className={`${button} text-gray-400`}
          >
            {copied ? <CheckGlyph /> : <CopyGlyph />}
          </IconButton>
          {/* The icon swap is invisible to a screen reader — the button's name
              does not change, and nothing about it is announced. This is the
              half that says so. `aria-live` only fires on a CHANGE to the
              region, so the region is always present and only its text moves. */}
          <span aria-live="polite" className="sr-only">{copied ? 'Copied' : ''}</span>
        </>
      )}
    </div>
  );
}
