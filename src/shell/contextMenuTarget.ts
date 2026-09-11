/**
 * What the shell's global context menu should offer for a given right-click.
 *
 * Kept free of React (and of the DOM beyond the element it is handed) so the
 * two rules that matter can be tested directly: which targets keep the
 * browser's own menu, and which items a click produces.
 */

/** Input types that put a text caret on screen. Everything else — a checkbox,
 *  a range, a color swatch, a file button — has no spellcheck and no Paste,
 *  so there is nothing in the browser's menu worth keeping for it. */
const TEXT_INPUT_TYPES = new Set([
  'text', 'search', 'url', 'tel', 'email', 'password', 'number',
  'date', 'datetime-local', 'month', 'week', 'time',
]);

/** Elements whose browser menu does what a page cannot: Save image as and Copy
 *  image — the picture itself, not its address — on an image or a canvas, and
 *  the playback controls on video and audio. */
const NATIVE_MEDIA = 'img, picture, canvas, video, audio';

/** Opt-out attribute: anything inside `[data-native-context-menu]` keeps the
 *  browser's menu. For surfaces the shell has no business re-skinning — an
 *  embedded viewer, a third-party widget. */
export const NATIVE_MENU_ATTR = 'data-native-context-menu';

function closest(el: Element | null, selector: string): Element | null {
  if (!el || typeof (el as Element).closest !== 'function') return null;
  return el.closest(selector);
}

/**
 * Does this target keep the browser's native menu?
 *
 * Text inputs, textareas and contenteditable do, deliberately: the browser's
 * spellcheck suggestions and "Add to dictionary" cannot be rebuilt by a web
 * page, and a Paste item of our own would need a clipboard permission prompt.
 * Images, canvases and media do for the same reason — Save / Copy image and
 * the playback controls are the browser's. The shell menu is for everywhere
 * else.
 */
export function keepsNativeMenu(target: EventTarget | null): boolean {
  const el = target as Element | null;
  if (!el || typeof (el as Element).closest !== 'function') return false;

  if (closest(el, `[${NATIVE_MENU_ATTR}]`)) return true;
  if (closest(el, 'textarea')) return true;
  if (closest(el, NATIVE_MEDIA)) return true;

  const input = closest(el, 'input') as HTMLInputElement | null;
  if (input) {
    // The property, not the attribute: the browser normalizes it, so a type it
    // does not recognise (`type="currency"`, a typo) reads as the text box it
    // actually renders.
    const type = (input.type || 'text').toLowerCase();
    if (TEXT_INPUT_TYPES.has(type)) return true;
  }

  // `isContentEditable` is the property to ask, but jsdom does not implement
  // it, so walk the attribute — which is also what the nesting rules are
  // written in (`contenteditable="false"` re-enables our menu inside an
  // editable region).
  const editable = closest(el, '[contenteditable]');
  if (editable) {
    const value = (editable.getAttribute('contenteditable') || '').toLowerCase();
    if (value === '' || value === 'true' || value === 'plaintext-only') return true;
  }

  return false;
}

export type ShellContextKind = 'selection' | 'link' | 'default';

export interface ShellContextTarget {
  /** The most specific thing under the pointer — what the menu leads with. */
  kind: ShellContextKind;
  /** Trimmed selection text, when something is selected. */
  selectionText?: string;
  /** Absolute href of the nearest enclosing link. */
  linkUrl?: string;
}

/** Schemes worth an Open / Copy link address. A `javascript:` URL is a button
 *  wearing a link's clothes, and `href="#"` is the same trick. */
const LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:', 'blob:']);

function linkAddress(href: string | null | undefined, base?: string): string | undefined {
  if (!href || href === '#') return undefined;
  try {
    // `document.baseURI`, not `location.href`: a page with a `<base>` resolves
    // this the way its own links do.
    const url = new URL(href, base ?? (typeof document !== 'undefined' ? document.baseURI : undefined));
    return LINK_SCHEMES.has(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Describe a right-click: what was under the pointer, and what is selected.
 *
 * A selection inside a link reports both, so the menu can offer both sections
 * the way a browser's does; `kind` names whichever the menu should lead with.
 */
export function describeContextTarget(
  target: EventTarget | null,
  selectionText?: string | null,
  baseUrl?: string,
): ShellContextTarget {
  const el = target as Element | null;
  const link = closest(el, 'a[href]');

  const text = (selectionText || '').trim();
  const linkUrl = linkAddress(link?.getAttribute('href'), baseUrl);

  const kind: ShellContextKind = text ? 'selection' : linkUrl ? 'link' : 'default';

  return {
    kind,
    ...(text ? { selectionText: text } : {}),
    ...(linkUrl ? { linkUrl } : {}),
  };
}
