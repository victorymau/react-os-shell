import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { SidebarNavItem } from '../src/shell/SidebarNav';
import { withConsoleError } from './capture-console';

const noop = () => {};

/**
 * The two literals below are the markup a plain item renders — no severity, no
 * icon, no trailing slot. Every optional prop is additive, so an item that uses
 * none of them must render one fixed thing, and that claim is asserted here
 * rather than promised.
 *
 * The baseline MOVED when `icon` and `trailing` landed, and only inside the
 * label span. The button, the count badge and the marker are untouched:
 *
 *   class="truncate"  →  class="min-w-0 truncate mr-auto"  +  title
 *
 * - `min-w-0` is a fix, not a rearrangement: a flex item defaults to
 *   `min-width: auto` and refuses to shrink below its content, so `truncate`
 *   never fired and a long bucket name pushed the count off the row instead.
 * - `mr-auto` was already there whenever a marker was, for the reason the
 *   component documents; two more optional children made "whenever" mean
 *   "always", and unconditional is the same geometry in the two-child case.
 * - `title` is the tooltip that makes a truncated label recoverable, and only
 *   a string can be one — see the ReactNode case below.
 */
const PLAIN_INACTIVE_WITH_COUNT =
  '<button type="button" class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm text-left text-gray-700 hover:bg-gray-100">' +
  '<span class="min-w-0 truncate mr-auto" title="Open">Open</span>' +
  '<span class="shrink-0 inline-flex items-center justify-center min-w-[1.25rem] px-1.5 h-5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">12</span>' +
  '</button>';

const PLAIN_ACTIVE_ZERO_COUNT =
  '<button type="button" class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm text-left bg-blue-50 font-medium text-blue-700">' +
  '<span class="min-w-0 truncate mr-auto" title="Open">Open</span>' +
  '</button>';

test('renders one fixed markup when every optional prop is omitted', () => {
  assert.equal(
    renderToStaticMarkup(<SidebarNavItem label="Open" count={12} active={false} onClick={noop} />),
    PLAIN_INACTIVE_WITH_COUNT,
  );
  assert.equal(
    renderToStaticMarkup(<SidebarNavItem label="Open" count={0} active onClick={noop} />),
    PLAIN_ACTIVE_ZERO_COUNT,
  );
});

test('severity draws a marker dot in the shell status colours', () => {
  const fills: Record<string, string> = { success: 'bg-green-500', warning: 'bg-amber-500', danger: 'bg-red-500' };
  for (const [tone, fill] of Object.entries(fills)) {
    const html = renderToStaticMarkup(
      <SidebarNavItem label="Servers" active={false} onClick={noop} severity={tone as 'success'} />,
    );
    assert.match(html, new RegExp(`h-1\\.5 w-1\\.5 rounded-full ${fill}`), `${tone} dot`);
  }
});

test('the marker is decorative, with the severity word carried as text', () => {
  const html = renderToStaticMarkup(
    <SidebarNavItem label="Servers" count={3} active={false} onClick={noop} severity="danger" />,
  );
  // Colour alone is not information a screen reader or a colour-blind operator
  // can read: the dot is aria-hidden and the word rides in an sr-only span.
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /title="critical"/);
  assert.match(html, /<span class="sr-only">critical<\/span>/);
  // Reading order: label, then tone, then count.
  assert.ok(
    html.indexOf('>Servers<') < html.indexOf('sr-only') && html.indexOf('sr-only') < html.indexOf('>3<'),
    'expected label → severity → count reading order',
  );
});

test('the label absorbs the free space, so nothing is stranded mid-row', () => {
  // `justify-between` deals the free space out BETWEEN children, which lands
  // the label in the middle of the button the moment a third one exists — and
  // with `icon`, `severity` and `trailing` there can now be five. The auto
  // margin takes all of it in one place instead: everything before the label
  // packs left, everything after it packs right.
  const crowded = renderToStaticMarkup(
    <SidebarNavItem
      label="Servers" count={3} active={false} onClick={noop}
      severity="warning" icon={<svg />} trailing={<span>ext</span>}
    />,
  );
  assert.match(crowded, /<span class="min-w-0 truncate mr-auto" title="Servers">Servers<\/span>/);
  const plain = renderToStaticMarkup(<SidebarNavItem label="Servers" count={3} active={false} onClick={noop} />);
  assert.match(plain, /<span class="min-w-0 truncate mr-auto" title="Servers">Servers<\/span>/);
});

test('severity leaves the count badge and active styling alone', () => {
  const html = renderToStaticMarkup(
    <SidebarNavItem label="Open" count={12} active onClick={noop} severity="warning" />,
  );
  assert.match(html, /bg-blue-50 font-medium text-blue-700/);
  assert.match(html, /bg-blue-100 text-blue-700">12<\/span>/);
});

test('an unrecognised severity is never invisible — the whole point of the marker', () => {
  // The regression this locks down: SEVERITY_FILL[severity] on an unknown key
  // is `undefined`, which interpolates into the className as the literal string
  // "undefined" — producing a colourless dot with no title and no screen-reader
  // word. On the one component whose job is keeping a deep alarm visible at the
  // top level, silent invisibility is the worst available failure.
  const { result: html, errors } = withConsoleError(() =>
    renderToStaticMarkup(
      <SidebarNavItem label="Servers" active={false} onClick={noop} severity={'critical' as never} />,
    ),
  );

  assert.doesNotMatch(html, /undefined/, 'no "undefined" class reaches the DOM');
  // Visible: real classes, and deliberately unlike any of the three tones so it
  // cannot be mistaken for a verdict.
  const dot = html.match(/class="shrink-0 h-1\.5 w-1\.5 rounded-full ([^"]*)"/);
  assert.ok(dot, 'the marker dot still renders');
  assert.notEqual(dot[1].trim(), '', 'and it has paint on it');
  assert.match(dot[1], /border-red-500/);
  assert.doesNotMatch(dot[1], /bg-(green|amber|red)-500/, 'not disguised as a real tone');
  // Legible: the bad token is named in the tooltip and to a screen reader, so
  // an operator can report it and a developer can find it.
  assert.match(html, /title="unrecognised severity &quot;critical&quot;"/);
  assert.match(html, /<span class="sr-only">unrecognised severity &quot;critical&quot;<\/span>/);
  // Loud: and reported once, not once per item in the sidebar.
  assert.equal(errors.length, 1);
  assert.match(errors[0], /SidebarNavItem: severity "critical" is not one of success \| warning \| danger/);
});

test('every shape of junk severity degrades visibly rather than vanishing', () => {
  // The realistic sources: the operational dialect (`ok|warn|crit`), the word
  // the component itself DISPLAYS round-tripped back in, a stale enum, an empty
  // string from a partially-filled payload, and a non-string from raw JSON.
  for (const junk of ['ok', 'warn', 'crit', 'critical', 'OK', 'Danger', '', 'error', 0, true, {}]) {
    const html = withConsoleError(() =>
      renderToStaticMarkup(
        <SidebarNavItem label="Servers" active={false} onClick={noop} severity={junk as never} />,
      ),
    ).result;
    const dot = html.match(/class="shrink-0 h-1\.5 w-1\.5 rounded-full ([^"]*)"/);
    assert.ok(dot, `${JSON.stringify(junk)} must still render a marker`);
    assert.notEqual(dot[1].trim(), '', `${JSON.stringify(junk)} must render a visible marker`);
    assert.doesNotMatch(html, /undefined/, `${JSON.stringify(junk)} must not leak "undefined"`);
    assert.match(html, /class="sr-only">unrecognised severity/, `${JSON.stringify(junk)} must say so`);
  }
});

test('a null or undefined severity is still "no claim", not a bad token', () => {
  // The absent case must stay distinguishable from the invalid one: omitting
  // the prop is not an error, and must not draw a marker or log anything.
  for (const absent of [undefined, null]) {
    const { result: html, errors } = withConsoleError(() =>
      renderToStaticMarkup(
        <SidebarNavItem label="Open" count={12} active={false} onClick={noop} severity={absent as never} />,
      ),
    );
    assert.equal(html, PLAIN_INACTIVE_WITH_COUNT, `${String(absent)} renders the plain markup`);
    assert.equal(errors.length, 0, `${String(absent)} is silent`);
  }
});

/* ── icon, trailing, and a ReactNode label ──────────────────────────────── */

test('the icon leads the row, a step quieter than the words it introduces', () => {
  // Two specific colours rather than `inherit`: the glyph names the same place
  // the label does, and a icon drawn in the label's own ink competes with it.
  const idle = renderToStaticMarkup(
    <SidebarNavItem label="Warehouses" active={false} onClick={noop} icon={<svg data-testid="glyph" />} />,
  );
  assert.match(idle, /class="shrink-0 h-4 w-4 text-gray-400"/, 'idle glyph is gray-400');

  const active = renderToStaticMarkup(
    <SidebarNavItem label="Warehouses" active onClick={noop} icon={<svg />} />,
  );
  assert.match(active, /class="shrink-0 h-4 w-4 text-blue-600"/, 'active glyph is blue-600');
  // …against the row's own blue-700, which the icon does NOT take.
  assert.match(active, /text-left bg-blue-50 font-medium text-blue-700/, 'the row keeps its own ink');
});

test('the icon is decoration — the label is what names the item', () => {
  const html = renderToStaticMarkup(
    <SidebarNavItem label="Warehouses" active={false} onClick={noop} icon={<svg />} />,
  );
  // A glyph announced beside the label is the item's name read twice.
  assert.match(html, /<span aria-hidden="true" class="shrink-0 h-4 w-4 text-gray-400">/);
  // And it comes first: the identity glyph belongs at the leading edge.
  assert.ok(html.indexOf('aria-hidden') < html.indexOf('>Warehouses<'), 'icon before label');
});

test('the icon sits outside the severity dot, so the dot stays on the label', () => {
  // Order: icon, dot, label. A dot stranded to the LEFT of the icon reads as
  // the icon's status rather than the section's — which is the one thing this
  // marker must never do.
  const html = renderToStaticMarkup(
    <SidebarNavItem label="Storage" active={false} onClick={noop} icon={<svg />} severity="danger" />,
  );
  const iconAt = html.indexOf('h-4 w-4 text-gray-400');
  const dotAt = html.indexOf('h-1.5 w-1.5 rounded-full');
  const labelAt = html.indexOf('>Storage<');
  assert.ok(iconAt >= 0 && dotAt >= 0 && labelAt >= 0, 'all three render');
  assert.ok(iconAt < dotAt && dotAt < labelAt, `expected icon → dot → label, got ${iconAt}/${dotAt}/${labelAt}`);
});

test('trailing takes the right edge, after the count, and keeps its size', () => {
  const html = renderToStaticMarkup(
    <SidebarNavItem
      label="Docs" count={4} active={false} onClick={noop}
      trailing={<span data-mark="ext">↗</span>}
    />,
  );
  // `shrink-0`: the label is what gives way when the sidebar narrows.
  assert.match(html, /<span class="shrink-0"><span data-mark="ext">↗<\/span><\/span>/);
  // It is not a second count — both render, in that order.
  assert.ok(html.indexOf('>4<') < html.indexOf('data-mark'), 'count then trailing');
});

test('an omitted icon or trailing renders no slot at all', () => {
  // Not an empty span each: an item that uses neither must stay the markup the
  // baseline above pins, and two stray children would also re-open the
  // free-space problem `mr-auto` closes.
  const html = renderToStaticMarkup(<SidebarNavItem label="Open" count={12} active={false} onClick={noop} />);
  assert.equal(html, PLAIN_INACTIVE_WITH_COUNT);
});

test('a ReactNode label renders, and takes no tooltip it cannot write', () => {
  // The reason `title` is conditional: there is no text here to read without
  // walking the tree, and `title="[object Object]"` is worse than no tooltip.
  const html = renderToStaticMarkup(
    <SidebarNavItem label={<><em>ACME</em> Pty Ltd</>} count={2} active={false} onClick={noop} />,
  );
  assert.match(html, /<em>ACME<\/em> Pty Ltd/, 'the node renders');
  assert.match(html, /<span class="min-w-0 truncate mr-auto">/, 'and the span carries no title');
  assert.doesNotMatch(html, /title="\[object Object\]"/);
});
