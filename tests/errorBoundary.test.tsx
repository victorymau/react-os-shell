import './dom';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, act } from './dom';
import ErrorBoundary from '../src/templates/ErrorBoundary';

/**
 * The portals each wrote this boundary and each got the same two things wrong,
 * so those two are what most of these specs are about: a stack trace printed
 * for a visitor, and a crash that replaces the page without saying so.
 *
 * React logs a caught error to the console itself, and the component logs
 * another on purpose, so the console is silenced per-test rather than left to
 * bury the runner's own output.
 */

// Reads a module-level flag rather than a prop, so a test can stop the throw
// WITHOUT re-rendering the parent. That distinction is the point of the reset
// spec: `children` is an element captured at the parent's render, so a reset
// re-renders the same element — the only way to tell "the reset cleared the
// error" from "the parent handed down a different child" is to leave the
// element alone and change what it does.
const boom = { throws: true };
const Boom = () => {
  if (boom.throws) throw new Error('kaboom at src/secret/internal/path.ts:42');
  return <p>the content</p>;
};

let realError: typeof console.error;
beforeEach(() => { boom.throws = true; realError = console.error; console.error = () => {}; });
afterEach(() => { console.error = realError; });

test('children render untouched when nothing throws', () => {
  const view = render(<ErrorBoundary><p>the content</p></ErrorBoundary>);
  assert.match(view.container.textContent ?? '', /the content/);
  assert.equal(view.container.querySelector('[role="alert"]'), null);
  view.unmount();
});

test('a crash shows the 500 page rather than a blank screen', () => {
  const view = render(<ErrorBoundary><Boom /></ErrorBoundary>);
  assert.match(view.container.textContent ?? '', /500/);
  assert.match(view.container.textContent ?? '', /Something went wrong/);
  view.unmount();
});

test('the crash announces itself', () => {
  // Without this the content is swapped out in silence: a screen reader user
  // is left on a page that no longer says what they were reading.
  const view = render(<ErrorBoundary><Boom /></ErrorBoundary>);
  assert.ok(view.container.querySelector('[role="alert"]'), 'the fallback must be a live region');
  view.unmount();
});

test('the stack is NOT on the page by default', () => {
  // The defect this component exists to stop. Every hand-written version
  // printed `error.stack` unconditionally, which publishes the module layout
  // to anyone who can make the page throw.
  const view = render(<ErrorBoundary><Boom /></ErrorBoundary>);
  const text = view.container.textContent ?? '';
  assert.doesNotMatch(text, /src\/secret\/internal\/path/, 'a visitor must not be shown the stack');
  assert.equal(view.container.querySelector('details'), null);
  view.unmount();
});

test('and it is there when the consumer asks for it', () => {
  // `showDetails={import.meta.env.DEV}` is the intended call: the kit is built
  // once and cannot read the app's mode, so the value has to come from outside.
  const view = render(<ErrorBoundary showDetails><Boom /></ErrorBoundary>);
  assert.match(view.container.textContent ?? '', /kaboom/);
  assert.ok(view.container.querySelector('details'));
  view.unmount();
});

test('reporting gets the error, and the console still gets it too', () => {
  // A reporter that is itself broken must not be the only record of a crash.
  const seen: Error[] = [];
  let logged = 0;
  console.error = () => { logged += 1; };
  const view = render(<ErrorBoundary onError={e => seen.push(e)}><Boom /></ErrorBoundary>);

  assert.equal(seen.length, 1);
  assert.match(seen[0].message, /kaboom/);
  assert.ok(logged > 0, 'the console record is kept regardless of onError');
  view.unmount();
});

test('Try again remounts the children', () => {
  // The reset has to clear the error AND re-render, or the button looks like a
  // way out and does nothing — the same failure ErrorPage was fixed for.
  const view = render(<ErrorBoundary><Boom /></ErrorBoundary>);
  assert.match(view.container.textContent ?? '', /500/);

  boom.throws = false;
  const button = [...view.container.querySelectorAll('button')].find(b => /Try again/.test(b.textContent ?? ''))!;
  assert.ok(button, 'the fallback offers a way out');
  act(() => { button.click(); });

  assert.match(view.container.textContent ?? '', /the content/);
  view.unmount();
});

test('a changed resetKey recovers without a reload', () => {
  // The realistic recovery: the user navigates away from the page that threw.
  // Without this the fallback outlives the route that caused it.
  const view = render(<ErrorBoundary resetKeys={['/orders']}><Boom /></ErrorBoundary>);
  assert.match(view.container.textContent ?? '', /500/);

  boom.throws = false;
  view.rerender(<ErrorBoundary resetKeys={['/catalogue']}><Boom /></ErrorBoundary>);
  assert.match(view.container.textContent ?? '', /the content/);
  view.unmount();
});

test('an unchanged resetKey holds the fallback', () => {
  // Otherwise any re-render clears the error and the crashed child mounts
  // again immediately, which loops.
  const view = render(<ErrorBoundary resetKeys={['/orders']}><Boom /></ErrorBoundary>);
  view.rerender(<ErrorBoundary resetKeys={['/orders']}><Boom /></ErrorBoundary>);
  assert.match(view.container.textContent ?? '', /500/);
  view.unmount();
});

test('a custom fallback replaces the page and is handed the reset', () => {
  const view = render(
    <ErrorBoundary fallback={(e, reset) => <button onClick={reset}>{e.message}</button>}>
      <Boom />
    </ErrorBoundary>,
  );
  assert.match(view.container.textContent ?? '', /kaboom/);
  assert.equal(view.container.querySelector('[role="alert"]'), null, 'the consumer owns its own markup');
  view.unmount();
});
