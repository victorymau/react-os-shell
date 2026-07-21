import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { SidebarNavItem } from '../src/shell/SidebarNav';
import { withConsoleError } from './capture-console';

const noop = () => {};

/**
 * The two literals below are the markup 3.24 produced, captured from the
 * pre-`severity` component. `severity` is additive, so an item that doesn't use
 * it must keep rendering byte-for-byte what every existing call site already
 * renders — that is the whole backward-compatibility claim, asserted rather
 * than promised.
 */
const V3_24_INACTIVE_WITH_COUNT =
  '<button type="button" class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm text-left text-gray-700 hover:bg-gray-100">' +
  '<span class="truncate">Open</span>' +
  '<span class="shrink-0 inline-flex items-center justify-center min-w-[1.25rem] px-1.5 h-5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">12</span>' +
  '</button>';

const V3_24_ACTIVE_ZERO_COUNT =
  '<button type="button" class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm text-left bg-blue-50 font-medium text-blue-700">' +
  '<span class="truncate">Open</span>' +
  '</button>';

test('renders byte-identical to 3.24 when severity is omitted', () => {
  assert.equal(
    renderToStaticMarkup(<SidebarNavItem label="Open" count={12} active={false} onClick={noop} />),
    V3_24_INACTIVE_WITH_COUNT,
  );
  assert.equal(
    renderToStaticMarkup(<SidebarNavItem label="Open" count={0} active onClick={noop} />),
    V3_24_ACTIVE_ZERO_COUNT,
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

test('the marker sits against the label, not at the far edge', () => {
  // `justify-between` would strand the label in the middle of the button once a
  // third child exists; the auto margin is what keeps dot and label together.
  const withMarker = renderToStaticMarkup(
    <SidebarNavItem label="Servers" count={3} active={false} onClick={noop} severity="warning" />,
  );
  assert.match(withMarker, /<span class="truncate mr-auto">Servers<\/span>/);
  const without = renderToStaticMarkup(<SidebarNavItem label="Servers" count={3} active={false} onClick={noop} />);
  assert.match(without, /<span class="truncate">Servers<\/span>/);
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
    assert.equal(html, V3_24_INACTIVE_WITH_COUNT, `${String(absent)} renders 3.24's markup`);
    assert.equal(errors.length, 0, `${String(absent)} is silent`);
  }
});
