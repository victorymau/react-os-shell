import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import ColoredBadge from '../src/shell/ColoredBadge';
import StatusBadge, { StatusBadgeProvider, GROUP_COLORS } from '../src/shell/StatusBadge';

/**
 * The kit had two badges and no way to ask for a colour by name.
 *
 * `StatusBadge` takes a domain status STRING and maps it through a
 * consumer-supplied provider. `ColoredBadge` takes raw Tailwind classes. So a
 * consumer that already knows it wants "success" — a plain label, not an
 * entity status — had to hardcode `bg-green-100 text-green-800` at the call
 * site, which is the thing StatusBadge's docblock says it exists to prevent.
 *
 * `tone` reads the same table StatusBadge does. Two independently maintained
 * greens is how "the same concept always looks the same colour" quietly stops
 * being true.
 */

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const classOf = (markup: string) => /class="([^"]*)"/.exec(markup)?.[1] ?? '';

test('a tone resolves to the shared table', () => {
  // Compared as substrings, not as a regex: since the table became
  // token-backed the class strings contain `[`, `(` and `)`, and a pattern
  // built from one of them stops meaning what it looks like.
  for (const tone of ['success', 'warning', 'danger', 'info', 'neutral'] as const) {
    const cls = classOf(html(<ColoredBadge tone={tone}>Paid</ColoredBadge>));
    for (const one of GROUP_COLORS[tone].split(' ')) assert.ok(cls.includes(one), `${tone}: ${one}`);
  }
});

test('a tone and the status that maps to it are the same colour', () => {
  // The promise. If these ever diverge, one of the two tables was edited.
  const byTone = classOf(html(<ColoredBadge tone="success">Paid</ColoredBadge>));
  const byStatus = classOf(html(
    <StatusBadgeProvider groups={{ paid: 'success' }}>
      <StatusBadge status="paid" />
    </StatusBadgeProvider>,
  ));
  for (const cls of GROUP_COLORS.success.split(' ')) {
    assert.ok(byTone.includes(cls), `tone: ${cls}`);
    assert.ok(byStatus.includes(cls), `status: ${cls}`);
  }
});

test('raw classes still win, and still work alone', () => {
  // The escape hatch has to stay usable — a colour the vocabulary has no name
  // for is a real case, and every existing caller passes this form.
  assert.match(classOf(html(<ColoredBadge colorClass="bg-purple-100 text-purple-800">Custom</ColoredBadge>)), /bg-purple-100/);
  assert.match(
    classOf(html(<ColoredBadge tone="success" colorClass="bg-purple-100 text-purple-800">Custom</ColoredBadge>)),
    /bg-purple-100/,
    'explicit beats semantic',
  );
});

test('neither given is neutral', () => {
  // `colorClass` used to be required, so this state could not be reached. It
  // must not render an unstyled pill.
  const cls = classOf(html(<ColoredBadge>Unlabelled</ColoredBadge>));
  for (const one of GROUP_COLORS.neutral.split(' ')) assert.ok(cls.includes(one), one);
});

test('className is appended, not swallowed', () => {
  // A badge in a table cell needs alignment and tabular numerals from the call
  // site; there was no way to pass them.
  const cls = classOf(html(<ColoredBadge tone="info" className="ml-1 font-mono tabular-nums">7</ColoredBadge>));
  assert.match(cls, /ml-1/);
  assert.match(cls, /tabular-nums/);
  for (const one of GROUP_COLORS.info.split(' ')) {
    assert.ok(cls.includes(one), `and the tone survives alongside it: ${one}`);
  }
});

test('size and capitalize are unchanged', () => {
  assert.match(classOf(html(<ColoredBadge tone="neutral" size="xs">x</ColoredBadge>)), /text-\[10px\]/);
  assert.match(classOf(html(<ColoredBadge tone="neutral" capitalize>in_progress</ColoredBadge>)), /capitalize/);
});

/**
 * A filter chip the user can drop.
 *
 * The interesting part is the close control's name. A row of filter chips with
 * five buttons all called "Remove" tells a screen-reader user nothing about
 * which filter each one drops — so the name is derived from the badge's own
 * text, and only falls back to the bare word when there is no text to take.
 */

test('the close control is named after the chip', () => {
  const markup = html(<ColoredBadge tone="info" closable onClose={() => {}}>Winter tyres</ColoredBadge>);
  assert.match(markup, /aria-label="Remove Winter tyres"/);
});

test('a caller can name it themselves', () => {
  const markup = html(
    <ColoredBadge tone="info" closable closeLabel="Clear the status filter" onClose={() => {}}>
      Status: Pending
    </ColoredBadge>,
  );
  assert.match(markup, /aria-label="Clear the status filter"/);
});

test('non-text children fall back rather than producing nonsense', () => {
  // There is nothing to derive from — "Remove [object Object]" is worse than
  // "Remove", and this is the case where closeLabel is really required.
  const markup = html(<ColoredBadge tone="info" closable onClose={() => {}}><b>7</b></ColoredBadge>);
  assert.match(markup, /aria-label="Remove"/);
});

test('a read-only badge has no close control', () => {
  assert.doesNotMatch(html(<ColoredBadge tone="neutral">Paid</ColoredBadge>), /<button/);
});

test('the close control is a real button, so it is reachable and pressable', () => {
  // Not a click handler on the icon: a span with onClick takes no focus and
  // answers no key.
  const markup = html(<ColoredBadge tone="info" closable onClose={() => {}}>Winter tyres</ColoredBadge>);
  assert.match(markup, /<button type="button"/);
  assert.match(markup, /aria-hidden="true"/, 'and its glyph is decoration');
});
