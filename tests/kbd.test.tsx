import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { Kbd, CMD_ENTER, ALT_SHIFT_E } from '../src/shell/Kbd';

/**
 * The badge the shortcut constants have always been shown in, and never
 * shipped with.
 *
 * `CMD_ENTER` and its siblings have been exported for years; the box around
 * them was left to each consumer, and the admin portal wrote 109 `<kbd>`
 * elements across 80 files in two different sizes to fill the gap. This is the
 * one shape, so the next consumer does not invent a third.
 */

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

test('it is a real <kbd>, holding the shortcut it was given', () => {
  // The element carries the meaning: `<span>⌘↵</span>` is two pieces of
  // punctuation, `<kbd>⌘↵</kbd>` is a key combination.
  const markup = html(<Kbd keys={CMD_ENTER} />);
  assert.match(markup, /^<kbd /);
  assert.ok(markup.endsWith(`>${CMD_ENTER}</kbd>`), markup);
});

test('it renders the string it is handed, not a shortcut of its own', () => {
  // Which symbol a platform uses is what the constants decide. Assembling one
  // here from modifier flags would be a second answer to that question. Asserted
  // by substring rather than by pattern: the non-Mac constants are full of `+`,
  // which a RegExp reads as a quantifier.
  assert.ok(html(<Kbd keys={ALT_SHIFT_E} />).includes(`>${ALT_SHIFT_E}</kbd>`));
  assert.ok(html(<Kbd keys="Esc" />).includes('>Esc</kbd>'));
});

test('two rungs, and md is the default', () => {
  const md = html(<Kbd keys={CMD_ENTER} />);
  assert.equal(md, html(<Kbd keys={CMD_ENTER} size="md" />));

  const sm = html(<Kbd keys={CMD_ENTER} size="sm" />);
  assert.notEqual(sm, md, 'the rungs have to differ, or `size` is decoration');
  assert.match(sm, /text-\[10px\]/);
  assert.match(md, /text-\[11px\]/);
});

test('every rung keeps the shared shape', () => {
  for (const size of ['sm', 'md'] as const) {
    const markup = html(<Kbd keys={CMD_ENTER} size={size} />);
    assert.match(markup, /\brounded\b/, `${size} lost the box`);
    assert.match(markup, /\bborder-gray-200\b/, `${size} lost the edge`);
    assert.match(markup, /\bbg-gray-50\b/, `${size} lost the fill`);
    assert.match(markup, /\btext-gray-500\b/, `${size} lost the ink`);
  }
});

test('className is layered on, never replacing the shape', () => {
  // The admin portal tints the submit badge with its accent through
  // `.kbd-submit`; it must not have to give up the shape to do it.
  const markup = html(<Kbd keys={CMD_ENTER} className="kbd-submit" />);
  assert.match(markup, /\bkbd-submit\b/);
  assert.match(markup, /\bborder-gray-200\b/);
});

test('it uses only utilities the dark theme remaps', () => {
  // There are no `dark:` variants in this package — dark mode is
  // `[data-theme="dark"]` overriding these exact class names in ui.css. A
  // utility outside that list renders its light value on a dark surface.
  const remapped = new Set(['border-gray-200', 'bg-gray-50', 'text-gray-500']);
  const classes = /class="([^"]*)"/.exec(html(<Kbd keys={CMD_ENTER} />))![1].split(' ');
  const coloured = classes.filter(c => /^(bg|text|border)-[a-z]+-\d+$/.test(c));
  assert.deepEqual(
    coloured.filter(c => !remapped.has(c)),
    [],
    `these colour utilities have no [data-theme="dark"] override in ui.css: ${coloured.join(' ')}`,
  );
});
