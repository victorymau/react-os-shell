import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, act } from './dom';
import ErrorBoundary from '../src/templates/ErrorBoundary';

/**
 * Follow-ups from reviewing 4.55.0. Each asserts the DELIVERY of a feature the
 * component already had — the stack you can actually see, the live region that
 * does not read it at you, the recovery that fires on the transition it exists
 * to catch.
 */

function Boom({ crash }: { crash: boolean }): React.ReactElement {
  if (crash) {
    const e = new Error('kaboom');
    e.stack = 'Error: kaboom\n    at src/secret/internal/path.tsx:12:3';
    throw e;
  }
  return <p>the content</p>;
}

// Suppress React's own error logging for these renders.
const quiet = () => {
  const original = console.error;
  console.error = () => {};
  return () => { console.error = original; };
};

test('the stack sits OUTSIDE the alert region', () => {
  // `alert` is announced wholesale and assertively. A region spanning the
  // details would read a developer's stack trace at a screen-reader user
  // before they could act on the page.
  const restore = quiet();
  const view = render(<ErrorBoundary showDetails><Boom crash /></ErrorBoundary>);
  try {
    const alert = view.container.querySelector('[role="alert"]')!;
    const details = view.container.querySelector('details')!;
    assert.ok(alert, 'the page is still a live region');
    assert.ok(details, 'and the details render');
    assert.equal(alert.contains(details), false, 'the stack must not be inside the announcement');
  } finally {
    restore();
    view.unmount();
  }
});

test('the details are a flex sibling, not pushed below a full-height page', () => {
  // ErrorPage is `h-full`. As a plain sibling inside an `h-full` wrapper the
  // details start at the 100% mark and sit below the fold — invisible under an
  // overflow-hidden shell, which is the one place showDetails has to work.
  const restore = quiet();
  const view = render(<ErrorBoundary showDetails><Boom crash /></ErrorBoundary>);
  try {
    const root = view.container.firstElementChild!;
    assert.match(root.className, /\bflex\b/, 'the root lays its children out');
    assert.match(root.className, /\bflex-col\b/);
    const details = view.container.querySelector('details')!;
    assert.equal(details.parentElement, root, 'the details are a child of the column');
    assert.match(details.className, /\bshrink-0\b/, 'so they keep their own height');
  } finally {
    restore();
    view.unmount();
  }
});

test('Try again is the kit Button, not a re-typed class string', () => {
  // The component's own argument is that hand-written boundaries "hard-coded
  // its own colours". Asserting a Button-only class keeps that true as Button
  // grows rungs and states this control would otherwise never get.
  const restore = quiet();
  const view = render(<ErrorBoundary><Boom crash /></ErrorBoundary>);
  try {
    const button = [...view.container.querySelectorAll('button')]
      .find(b => b.textContent?.includes('Try again'))!;
    assert.ok(button, 'the fallback offers a way out');
    assert.match(button.className, /disabled:opacity-60/, "Button's base, which a hand-written string lacked");
  } finally {
    restore();
    view.unmount();
  }
});

test('resetKeys appearing counts as a change', () => {
  // The guard required BOTH sides present, so undefined -> ['/orders'] — the
  // first render after a crash for a router hook that starts undefined — held
  // the fallback forever.
  const restore = quiet();
  const view = render(<ErrorBoundary><Boom crash /></ErrorBoundary>);
  try {
    assert.match(view.container.textContent ?? '', /500/, 'crashed');
    act(() => {
      view.rerender(<ErrorBoundary resetKeys={['/orders']}><Boom crash={false} /></ErrorBoundary>);
    });
    assert.match(view.container.textContent ?? '', /the content/, 'the keys arriving recovers it');
  } finally {
    restore();
    view.unmount();
  }
});
