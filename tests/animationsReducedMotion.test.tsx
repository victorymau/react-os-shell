/**
 * The startup and logout covers are the two longest animations in the shell —
 * spin-in, bouncing dots, a pulsing glow, a spin-out — and neither consulted
 * `prefers-reduced-motion`, while WindowManager and Modal already do. Each now
 * ships a reduced-motion rule scoped to its own root: `animation: none` parks
 * the keyframe motion (stylesheet !important beats the inline shorthands) and
 * `transition-property: opacity` turns the slide/scale phases into plain
 * cross-fades. Timings are untouched.
 *
 * jsdom does not evaluate media queries, so these specs pin the contract at
 * the markup level: the scope attribute exists and the embedded style carries
 * the guarded rule. That is exactly what shipped missing before — a spec on
 * "the animation is pretty" would assert nothing.
 */
import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import StartupAnimation from '../src/shell/StartupAnimation';
import LogoutAnimation from '../src/shell/LogoutAnimation';

const REDUCED = /@media \(prefers-reduced-motion: reduce\)/;

test('StartupAnimation guards its motion behind prefers-reduced-motion', () => {
  const markup = renderToStaticMarkup(<StartupAnimation onComplete={() => {}} />);
  assert.match(markup, /data-startup-animation/);
  assert.match(markup, REDUCED);
  const rule = markup.slice(markup.search(REDUCED));
  assert.match(rule, /\[data-startup-animation\][^}]*animation: none !important/s);
  assert.match(rule, /transition-property: opacity !important/);
});

test('LogoutAnimation guards its motion behind prefers-reduced-motion', () => {
  const markup = renderToStaticMarkup(<LogoutAnimation onComplete={() => {}} />);
  assert.match(markup, /data-logout-animation/);
  assert.match(markup, REDUCED);
  const rule = markup.slice(markup.search(REDUCED));
  assert.match(rule, /\[data-logout-animation\][^}]*animation: none !important/s);
  assert.match(rule, /transition-property: opacity !important/);
});
