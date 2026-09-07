/**
 * The editorial markup rule — ONE grammar, shared by every product that lets a
 * human type formatted copy into a plain text box.
 *
 * Why this lives in react-os-shell, and why behind its own subpath:
 * the rule is consumed by the admin portal (agent messages + the campaign
 * designer) AND by the public storefront, which has ten dependencies in total
 * and cannot afford the shell's peer graph (a 3D viewer, a PDF renderer, a DXF
 * viewer, an xlsx parser, a Word converter). So this module is deliberately
 * FRAMEWORK-FREE: no React, no JSX, no DOM, no imports at all. `react-os-shell/markup`
 * therefore adds a few hundred bytes of first-party code to a bundle and nothing
 * else — see the subpath's own tsup entry.
 *
 * It is also the ONE subpath whose `exports` entry carries a `default`
 * condition alongside `import`, and that is deliberate rather than untidy. The
 * root and `./apps` are React component entries; a bundler resolves them and
 * nothing else has any business to. This module is consumed by build scripts
 * too — the storefront's media-manifest generator reaches it through its Puck
 * config — and those run under `tsx`, which resolves through Node's CJS
 * loader. With only `types` and `import` declared, that resolution fails with
 * ERR_PACKAGE_PATH_NOT_EXPORTED, which reads like a missing file rather than a
 * missing condition. A module this portable should answer to any resolver.
 *
 * WHAT IS SHARED IS THE RULE, NOT THE RENDERING. Each product renders the token
 * list its own way, because it must: the web uses CSS classes bound to theme
 * tokens, email must inline every style (mail clients drop classes). Two
 * renderers, one grammar, one writer ({@link applyMark}) — so a toolbar button
 * and a parser can never disagree about what a delimiter means.
 *
 * ## The delimiters
 *
 * Standard markdown, in every product:
 *
 *   **phrase**   bold
 *   _phrase_     italic
 *   ~~phrase~~   strikethrough
 *   ==phrase==   highlight — the brand accent colour, applied to a selection
 *
 * Plus a per-product LEGACY set ({@link STOREFRONT_MARKUP} /
 * {@link CAMPAIGN_MARKUP}) that keeps already-published copy rendering exactly
 * as it does today. Those legacy rules are the only part of this grammar that is
 * meant to be deleted: once stored content has been converted, drop the rule
 * from the product's rule list and nothing else changes.
 *
 * ## Two deliberate delimiter choices
 *
 * 1. ITALIC IS `_phrase_`, NOT `*phrase*`. In the storefront and the campaign
 *    designer a single asterisk already means the ACCENT colour, on 704 live
 *    instances. Standard markdown says italic. Both cannot be true, so the
 *    asterisk keeps its existing meaning and italic takes markdown's OTHER
 *    italic marker. Nothing published moves.
 * 2. `_` NEVER FIRES INSIDE A WORD. Without that guard, a mail merge line
 *    holding `{{first_name}}` and `{{last_name}}` would italicise everything
 *    between the two underscores. The guard is CommonMark's own rule for `_`
 *    (an intraword underscore is literal) and it is checked with plain character
 *    tests rather than a lookbehind, because a lookbehind is a parse error on
 *    Safari below 16.4 and this code ships to a public storefront.
 *
 * ## One KNOWN divergence from the standard named above
 *
 * `__phrase__` IS ITALIC HERE. CommonMark reads a doubled underscore as STRONG;
 * this grammar has a single `_` rule, so the outer pair matches, the inner
 * underscores are ordinary characters, and `__all__` comes back as `_all_`.
 *
 * Left alone deliberately, and recorded rather than fixed. A census of stored
 * copy found 14 rows in this shape and every one of them is the literal link
 * key `__all__`, which no renderer is handed — so nothing published is being
 * mis-drawn today. Adding a `__` rule to buy CommonMark parity would change how
 * a stored `_` pair parses for the benefit of no existing string, and this
 * module's promise is that the grammar grows while nothing published moves.
 * Bold is `**phrase**` in every product; that is the form the toolbar writes
 * and the form to reach for. Pinned by a test, so it stays a decision rather
 * than becoming a discovery.
 */

/** A style a toolbar button can apply. The first five are inline marks; the
 *  last four are the composer-only affordances (a link and the three line
 *  prefixes), which only a renderer that draws block content can honour. */
export type MarkStyle =
  | 'bold' | 'italic' | 'strike' | 'code' | 'highlight'
  | 'link' | 'bullet' | 'number' | 'quote';

/** What a parsed run MEANS. `accent` is the storefront/campaign brand colour —
 *  the legacy `*phrase*` — and `highlight` is its standard-markdown successor;
 *  both resolve to the same paint, which is what makes converting stored copy
 *  from one to the other invisible. */
export type InlineKind =
  | 'text' | 'bold' | 'italic' | 'strike' | 'code' | 'highlight' | 'accent';

// ── Writing: the toolbar's half of the rule ────────────────────────────────

const INLINE: Record<string, { fence: string; placeholder: string }> = {
  bold: { fence: '**', placeholder: 'bold text' },
  italic: { fence: '_', placeholder: 'italic text' },
  strike: { fence: '~~', placeholder: 'struck out' },
  code: { fence: '`', placeholder: 'code' },
  highlight: { fence: '==', placeholder: 'highlighted text' },
};

const LINE_PREFIX: Record<string, (i: number) => string> = {
  bullet: () => '- ',
  number: (i) => `${i + 1}. `,
  quote: () => '> ',
};

export interface WrapResult {
  text: string;
  /** Where the caret should land — inside the new marks, or after them. */
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Apply a style to `text[start:end]`, returning the new text and where the
 * selection should sit. Toggling is deliberate: pressing Bold on already-bold
 * text unwraps it, so the shortcut behaves like every other editor.
 *
 * Unwrapping only ever recognises the style's OWN fence. An italic button that
 * also unwrapped `*phrase*` would silently strip an accent run in the storefront
 * and the campaign designer, where the asterisk means colour, not slant.
 */
export function applyMark(
  text: string, start: number, end: number, style: MarkStyle,
): WrapResult {
  const selected = text.slice(start, end);

  if (style === 'link') {
    const label = selected || 'link text';
    const snippet = `[${label}](https://)`;
    return {
      text: text.slice(0, start) + snippet + text.slice(end),
      // Land the caret on the URL — the label is usually already right.
      // Offset spans "[", the label, "](" — three characters plus the label.
      selectionStart: start + label.length + 3,
      selectionEnd: start + snippet.length - 1,
    };
  }

  const prefix = LINE_PREFIX[style];
  if (prefix) {
    // Line styles apply to every line the selection touches.
    const from = text.lastIndexOf('\n', Math.max(start - 1, 0)) + 1;
    const toIdx = text.indexOf('\n', end);
    const to = toIdx === -1 ? text.length : toIdx;
    const block = text.slice(from, to);
    const lines = block.split('\n');
    const marked = lines.every((l, i) => l.startsWith(prefix(i)));
    const next = lines
      .map((l, i) => (marked ? l.slice(prefix(i).length) : prefix(i) + l))
      .join('\n');
    return {
      text: text.slice(0, from) + next + text.slice(to),
      selectionStart: from,
      selectionEnd: from + next.length,
    };
  }

  const { fence, placeholder } = INLINE[style];
  const before = text.slice(Math.max(0, start - fence.length), start);
  const after = text.slice(end, end + fence.length);
  if (before === fence && after === fence) {  // already marked → unwrap
    return {
      text: text.slice(0, start - fence.length) + selected + text.slice(end + fence.length),
      selectionStart: start - fence.length,
      selectionEnd: start - fence.length + selected.length,
    };
  }
  const inner = selected || placeholder;
  return {
    text: text.slice(0, start) + fence + inner + fence + text.slice(end),
    selectionStart: start + fence.length,
    selectionEnd: start + fence.length + inner.length,
  };
}

/** One toolbar button. `label` is a text glyph for hosts that draw type
 *  (the message composer); hosts with an icon set map `style` to their own.
 *  `shortcut` is the bare key the host combines with its platform modifier. */
export interface MarkupTool {
  style: MarkStyle;
  label: string;
  title: string;
  shortcut?: string;
}

/** Every button, in the order a writer reaches for them. */
export const MARKUP_TOOLS: readonly MarkupTool[] = [
  { style: 'bold', label: 'B', title: 'Bold (⌘B)', shortcut: 'b' },
  { style: 'italic', label: 'I', title: 'Italic (⌘I)', shortcut: 'i' },
  { style: 'strike', label: 'S', title: 'Strikethrough' },
  { style: 'highlight', label: '◆', title: 'Highlight in the brand color' },
  { style: 'code', label: '‹›', title: 'Code' },
  { style: 'link', label: '🔗', title: 'Link (⌘K)', shortcut: 'k' },
  { style: 'bullet', label: '•', title: 'Bulleted list' },
  { style: 'number', label: '1.', title: 'Numbered list' },
  { style: 'quote', label: '❝', title: 'Quote' },
];

/** The tools a host shows, resolved to descriptors in {@link MARKUP_TOOLS}
 *  order. Keeps a host from hand-rebuilding a descriptor (and drifting on a
 *  tooltip) just to pick a subset. */
export function markupTools(styles: readonly MarkStyle[]): MarkupTool[] {
  return MARKUP_TOOLS.filter((t) => styles.includes(t.style));
}

// ── Reading: the parser's half of the rule ─────────────────────────────────

/**
 * One delimited run. `open`/`close` are literal strings; a run's inner text may
 * never contain the first character of `close`, which is what keeps this
 * equivalent to the "asterisk, run of non-asterisks, asterisk" regexes the
 * products used before — the same leftmost match, the same single close
 * candidate, so today's stored copy parses exactly as it always has.
 */
export interface InlineRule {
  readonly open: string;
  readonly close: string;
  readonly kind: Exclude<InlineKind, 'text'>;
  /** CommonMark's `_` rule: neither delimiter may touch a word character, so
   *  `snake_case` and `{{first_name}}` stay literal. */
  readonly wordBoundary?: boolean;
  /**
   * Characters that may not FOLLOW the close. A run whose closing delimiter
   * butts up against one of these does not fire, and both delimiters stay
   * literal.
   *
   * Two legacy rules need it, for the same reason: a delimiter that is also
   * ordinary punctuation will otherwise claim text that was never markup. `#`
   * must not pair across rank markers ("Ranked #1 and #2"), and `[` must not
   * claim the label of a markdown link ("[terms](https://…)"), where the URL
   * would be stranded outside the run and printed to the reader.
   *
   * A character SET rather than a flag per case, so the next collision is one
   * more rule field and no new branch in {@link tokenizeInline}.
   */
  readonly notBefore?: string;
}

/**
 * The standard-markdown marks, shared by every product.
 *
 * `**` and `*` cannot collide even though they share a prefix: a `*` followed
 * immediately by another `*` is an EMPTY accent run, which no rule matches, so
 * at any one position exactly one of the two can fire. Order between them is
 * therefore not observable — which is worth stating, because the obvious
 * assumption ("longest delimiter must be listed first") would make a future
 * reader think this array's order is load-bearing when the empty-run rule is
 * what actually does the work.
 */
export const STANDARD_MARKUP: readonly InlineRule[] = [
  { open: '**', close: '**', kind: 'bold' },
  { open: '==', close: '==', kind: 'highlight' },
  { open: '~~', close: '~~', kind: 'strike' },
  { open: '_', close: '_', kind: 'italic', wordBoundary: true },
];

/**
 * The buttons a COPY FIELD offers — a storefront section's copy box and a
 * campaign block's copy box show exactly these, so a merchant meets one toolbar
 * wherever they type.
 *
 * DERIVED, not listed. A copy field renders inline runs only — no lists, no
 * block quote, no anchor — so the set it may advertise is precisely the tools
 * whose output this grammar parses back. Writing that as a literal list was the
 * bug's hiding place: the list and the grammar were two hand-maintained facts
 * that agreed by luck, and nothing failed when a tool wrote a delimiter the
 * parser read as something else. Now a style with no rule cannot appear here,
 * whatever anyone types into the array.
 *
 * It resolves to bold, italic, strike and highlight. `code` is the one that
 * surprises: it is an inline mark and it has a fence, but no rule reads a
 * backtick, so a copy field would print `` `word` `` verbatim — and a button
 * whose output the renderer draws as literal text is worse than no button.
 *
 * Declared here, below the rules, because it now depends on them.
 */
export const COPY_FIELD_TOOLS: readonly MarkStyle[] = MARKUP_TOOLS
  .map((tool) => tool.style)
  .filter((style) => STANDARD_MARKUP.some((rule) => rule.kind === style));

/**
 * The storefront's rule set: standard markdown plus the ONE legacy run it has
 * published — `*phrase*` in the theme accent. Delete that last entry once
 * stored copy has been converted to `==phrase==`; both kinds already paint the
 * same, so the deletion is invisible.
 */
export const STOREFRONT_MARKUP: readonly InlineRule[] = [
  ...STANDARD_MARKUP,
  { open: '*', close: '*', kind: 'accent' },
];

/**
 * The campaign designer's rule set: standard markdown plus its three legacy
 * runs — `#phrase#` bold, `*phrase*` accent, `[phrase]` italic. The bold guard
 * is the one the email parser already carried: a `#` followed by a digit does
 * not close a run, so "Ranked #1 and #2" is literal while "Save #20%#" bolds.
 *
 * The italic guard exists because `[phrase]` collides with the one piece of
 * markdown syntax every writer already knows. Without it, "Read [our
 * terms](https://…) first" italicises the label AND prints the bare URL to the
 * reader — the words come back wearing a mark nobody chose. It is not a
 * toolbar problem: a merchant typing an ordinary link into a copy box hits it,
 * which is why the guard is on the RULE and not on which buttons a field
 * offers. `[phrase]` on its own is untouched, so every published line still
 * reads exactly as it did.
 */
export const CAMPAIGN_MARKUP: readonly InlineRule[] = [
  ...STANDARD_MARKUP,
  { open: '*', close: '*', kind: 'accent' },
  { open: '#', close: '#', kind: 'bold', notBefore: '0123456789' },
  { open: '[', close: ']', kind: 'italic', notBefore: '(' },
];

/** A parsed run. `text` is the inner text with the delimiters removed, so a
 *  caller that only wants words ({@link stripInline}) joins the texts and a
 *  caller that paints ({@link InlineKind}) switches on the kind. */
export interface InlineToken {
  kind: InlineKind;
  text: string;
}

/** True for a character that a `_` may not touch. Whitespace and ASCII
 *  punctuation are safe neighbours; everything else — letters, digits, and any
 *  non-ASCII script — counts as part of a word, so `汉_字_` stays literal too.
 *  Deliberately conservative: a character wrongly called word-ish only ever
 *  leaves an underscore rendering as it does today. */
function wordish(ch: string): boolean {
  return !/\s/.test(ch) && !/[!-\/:-@[-`{-~]/.test(ch);
}

/**
 * Split authored text into its runs.
 *
 * The returned tokens ALTERNATE, starting and ending with a `text` token that
 * may be empty — exactly the shape `String.split` with one capture group
 * produced in the parsers this replaces. That contract is load-bearing, not
 * cosmetic: the storefront wraps every segment (including the empty ones) in a
 * `<span>`, so preserving the empty tokens is what keeps a published page's
 * markup byte-for-byte identical.
 *
 * A lone delimiter with no partner stays literal — the products' copy contains
 * real stray asterisks, and swallowing one would silently eat a word.
 */
export function tokenizeInline(
  value: string, rules: readonly InlineRule[],
): InlineToken[] {
  const out: InlineToken[] = [];
  let buf = '';
  let i = 0;

  while (i < value.length) {
    const hit = matchAt(value, i, rules);
    if (hit) {
      out.push({ kind: 'text', text: buf });
      buf = '';
      out.push({ kind: hit.rule.kind, text: hit.inner });
      i = hit.end;
      continue;
    }
    buf += value[i];
    i += 1;
  }
  out.push({ kind: 'text', text: buf });
  return out;
}

/** The first rule that opens at `i` AND finds its close, or null. */
function matchAt(value: string, i: number, rules: readonly InlineRule[]) {
  for (const rule of rules) {
    if (!value.startsWith(rule.open, i)) continue;
    if (rule.wordBoundary && i > 0 && wordish(value[i - 1])) continue;

    const from = i + rule.open.length;
    const closeAt = value.indexOf(rule.close, from);
    if (closeAt < from + 1) continue;           // no close, or an empty run

    // The inner text may not contain the close's leading character: one close
    // candidate per opening, which is what the regexes this replaces did.
    const inner = value.slice(from, closeAt);
    if (inner.includes(rule.close[0])) continue;

    const end = closeAt + rule.close.length;
    const next = value[end];
    if (rule.notBefore && next !== undefined && rule.notBefore.includes(next)) continue;
    if (rule.wordBoundary && next !== undefined && wordish(next)) continue;

    return { rule, inner, end };
  }
  return null;
}

/**
 * The plain words of an authored string — every paired run unwrapped to its
 * inner text, every unpaired delimiter left alone.
 *
 * This is the ONLY correct way to fill an `alt`, an `aria-label` or a
 * structured-data field from authored copy. Deleting a delimiter character by
 * hand — "replace every asterisk with nothing" — breaks the moment the grammar
 * grows a marker, and it disagrees with the renderer about a stray asterisk,
 * which matters: search engines expect structured data to match the text a
 * visitor actually sees.
 */
export function stripInline(value: string, rules: readonly InlineRule[]): string {
  return tokenizeInline(value, rules).map((t) => t.text).join('');
}
