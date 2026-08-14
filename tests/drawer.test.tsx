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
  // The NAME, not the attribute that happens to carry it: the title is wired
  // through aria-labelledby so an element title is named too, and asserting on
  // aria-label would have locked in the mechanism that could not do that.
  const labelledBy = panel?.getAttribute('aria-labelledby');
  assert.equal(document.getElementById(labelledBy ?? '')?.textContent, 'Filters');
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

test('sizes are inline px, where arbitrary values actually work', () => {
  // `w-[28rem]` produces no style in the compiled stylesheet.
  const { unmount } = mount(<Drawer open size="md" onClose={() => {}}>body</Drawer>);
  const panel = document.querySelector('[role="dialog"]') as HTMLElement;
  assert.equal(panel.style.width, '448px');
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

test('with no title the close button does not cost a header row', () => {
  // A navigation drawer has no title bar by design — its own content is the
  // heading — and reserving the row anyway put a bordered strip of nothing at
  // the top of the panel, which is exactly the space a phone does not have.
  const view = mount(<Drawer open onClose={() => {}} aria-label="Navigation menu">body</Drawer>);
  const panel = document.querySelector('[role="dialog"]')!;
  const close = document.querySelector('[aria-label="Close"]')!;

  assert.ok(close, 'the way out is still there');
  assert.equal(panel.querySelector('.border-b'), null, 'and it costs no header row');
  view.unmount();
});

test('with a title the close button shares the header row with it', () => {
  const view = mount(<Drawer open onClose={() => {}} title="Filters">body</Drawer>);
  const panel = document.querySelector('[role="dialog"]')!;
  const header = panel.querySelector('.border-b')!;
  assert.ok(header, 'a titled drawer keeps its header');
  assert.ok(header.querySelector('[aria-label="Close"]'), 'and the button sits in it');
  view.unmount();
});
