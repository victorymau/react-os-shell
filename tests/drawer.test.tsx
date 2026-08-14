import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, act } from './dom';
import Drawer from '../src/shell/Drawer';
import Dialog from '../src/shell/Dialog';
import { runEscapeInterceptors } from '../src/shell/escapeInterceptors';

/**
 * Drawer shares Dialog's modal contract — trapped focus, locked page, Escape
 * claimed through the shell's interceptor — so what is pinned here is that it
 * actually participates in that contract rather than merely looking like it.
 *
 * Sync `act` throughout. An async act scope around anything holding a promise
 * that settles on user input hangs the runner instead of failing, which is a
 * much worse way to learn something is wrong. (See tests/dialog.test.tsx.)
 */

const escape = () => runEscapeInterceptors(new KeyboardEvent('keydown', { key: 'Escape' }));

function mount(ui: React.ReactElement) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(ui); });
  return { host, unmount: () => { act(() => { root.unmount(); }); host.remove(); } };
}

test('a closed Drawer renders nothing', () => {
  const { host, unmount } = mount(<Drawer open={false} onClose={() => {}}>body</Drawer>);
  assert.equal(host.textContent, '');
  unmount();
});

test('an open Drawer is an accessible modal', () => {
  const { unmount } = mount(<Drawer open onClose={() => {}} title="Filters">body</Drawer>);
  const panel = document.querySelector('[role="dialog"]');
  assert.ok(panel);
  assert.equal(panel?.getAttribute('aria-modal'), 'true');
  assert.equal(panel?.getAttribute('aria-label'), 'Filters');
  unmount();
});

test('Escape closes it; blocking claims the key and does nothing', () => {
  let closed = 0;
  const a = mount(<Drawer open onClose={() => { closed++; }}>body</Drawer>);
  assert.equal(escape(), true);
  assert.equal(closed, 1);
  a.unmount();

  closed = 0;
  const b = mount(<Drawer open blocking onClose={() => { closed++; }}>body</Drawer>);
  // Still claimed — an unclaimed Escape reaches the shell and closes the
  // window BEHIND the drawer.
  assert.equal(escape(), true);
  assert.equal(closed, 0);
  b.unmount();
});

test('a Drawer opened over a Dialog takes Escape first', () => {
  // The stacking rule from 4.18.0, now with two different components: whatever
  // opened last is what the user is looking at.
  let dialogClosed = 0;
  let drawerClosed = 0;
  const { unmount } = mount(
    <>
      <Dialog open onClose={() => { dialogClosed++; }}>beneath</Dialog>
      <Drawer open onClose={() => { drawerClosed++; }}>on top</Drawer>
    </>,
  );
  escape();
  assert.equal(drawerClosed, 1);
  assert.equal(dialogClosed, 0);
  unmount();
});

test('a side drawer is full width on a phone, its own width above that', () => {
  // Was an inline px width, on the reasoning that `w-[28rem]` produces no rule
  // in the compiled stylesheet. True, and it also made the width unresponsive:
  // an inline style beats every `sm:` variant. Arbitrary values in a STATIC
  // class work — what does not is building one by interpolation, which Tailwind
  // never sees and so never emits.
  const { unmount } = mount(<Drawer open size="md" onClose={() => {}}>body</Drawer>);
  const panel = document.querySelector('[role="dialog"]') as HTMLElement;
  assert.equal(panel.style.width, '', 'no inline width to beat the variant');
  assert.match(panel.className, /(^|\s)w-full(\s|$)/, 'the phone case is the default');
  assert.match(panel.className, /sm:w-\[448px\]/, 'and md is 448 from sm up');
  unmount();
});

test('a bottom drawer is capped in height rather than width', () => {
  const { unmount } = mount(<Drawer open side="bottom" onClose={() => {}}>body</Drawer>);
  const panel = document.querySelector('[role="dialog"]') as HTMLElement;
  assert.equal(panel.style.width, '');
  assert.equal(panel.style.maxHeight, '85vh');
  unmount();
});

test('the page behind cannot scroll while it is open, and recovers after', () => {
  const before = document.body.style.overflow;
  const { unmount } = mount(<Drawer open onClose={() => {}}>body</Drawer>);
  assert.equal(document.body.style.overflow, 'hidden');
  unmount();
  assert.equal(document.body.style.overflow, before);
});

test('only the body scrolls, so a long form keeps its header and actions', () => {
  const { unmount } = mount(
    <Drawer open onClose={() => {}} title="Edit address" footer={<button type="button">Save</button>}>
      body
    </Drawer>,
  );
  const panel = document.querySelector('[role="dialog"]')!;
  assert.ok(panel.querySelector('.overflow-y-auto'), 'the body is the scrolling region');
  assert.match(panel.innerHTML, /shrink-0/, 'the header and footer do not shrink');
  unmount();
});

test('a blocking drawer offers no close control', () => {
  // Otherwise it advertises an exit that Escape and the scrim both refuse.
  const { unmount } = mount(<Drawer open blocking onClose={() => {}} title="Working">body</Drawer>);
  assert.equal(document.querySelector('[aria-label="Close"]'), null);
  unmount();
});
