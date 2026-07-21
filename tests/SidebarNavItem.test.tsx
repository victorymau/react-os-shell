import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { SidebarNavItem } from '../src/shell/SidebarNav';

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
