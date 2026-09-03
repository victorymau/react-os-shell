/**
 * Right-clicking a taskbar tab.
 *
 * A tab stands for one window or for several — same-route `multiInstance`
 * copies stack behind a count badge. Those two cases need different menus, and
 * the difference is the point of this spec: a group cannot borrow one window's
 * menu, because "Close" there would silently pick a single instance out of the
 * stack and leave the rest open.
 */
import { act, flush, render, waitFor } from './dom';
import { lazy, useEffect } from 'react';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRouter } from 'react-router-dom';
import { ConfirmProvider } from '../src/shell/ConfirmDialog';
import { WindowManagerProvider, useWindowManager } from '../src/shell/WindowManager';
import { setShellWindowRegistry } from '../src/windowRegistry/types';

const MULTI = '/taskbar-group-multi';
const SINGLE = '/taskbar-group-single';

function Body() {
  return <p>window body</p>;
}

setShellWindowRegistry({
  [MULTI]: {
    label: 'Purchase Invoices',
    component: lazy(() => Promise.resolve({ default: Body })),
    multiInstance: true,
  },
  [SINGLE]: {
    label: 'Payments',
    component: lazy(() => Promise.resolve({ default: Body })),
  },
});

function Opener({ opens }: { opens: string[] }) {
  const { openPage } = useWindowManager();
  useEffect(() => { for (const path of opens) openPage(path); }, [openPage, opens]);
  return <div id="taskbar-windows" />;
}

async function mount(opens: string[]) {
  localStorage.setItem('access_token', 'taskbar-group-test');
  localStorage.setItem('erp_open_windows', '[]');
  const mounted = render(
    <MemoryRouter>
      <ConfirmProvider>
        <WindowManagerProvider>
          <Opener opens={opens} />
        </WindowManagerProvider>
      </ConfirmProvider>
    </MemoryRouter>,
  );
  await waitFor(
    () => document.querySelectorAll('[data-modal-panel]').length === opens.length,
    `${opens.length} window(s) never opened`,
  );
  // The tabs render into #taskbar-windows through a portal, which only exists
  // once that element has been found — a poll, not a render.
  await waitFor(
    () => document.querySelector('[data-tab-group]') !== null,
    'the taskbar tabs never rendered',
  );
  return mounted;
}

function rightClickTab(groupKey: string) {
  const tab = document.querySelector<HTMLElement>(`[data-tab-group="${groupKey}"]`);
  assert.ok(tab, `a taskbar tab exists for ${groupKey}`);
  act(() => {
    tab.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, clientX: 120, clientY: 700,
    }));
  });
}

function clickMenuItem(label: string) {
  const item = Array.from(document.querySelectorAll('button'))
    .find(candidate => candidate.textContent?.trim() === label) as HTMLButtonElement | undefined;
  assert.ok(item, `a menu item labelled "${label}" exists`);
  act(() => { item.click(); });
}

function occurrences(needle: string): number {
  return (document.body.textContent ?? '').split(needle).length - 1;
}

test('a grouped tab gets a group menu, and Close all closes every window in the group', async (t) => {
  const mounted = await mount([MULTI, MULTI, MULTI]);
  t.after(() => mounted.unmount());
  assert.equal(document.querySelectorAll('[data-modal-panel]').length, 3);

  rightClickTab(MULTI);
  await flush();

  const text = document.body.textContent ?? '';
  assert.match(text, /Purchase Invoices/, 'the menu names the group, so "all" is not a guess');
  assert.match(text, /Minimize all/);
  assert.match(text, /Restore all/);
  assert.match(text, /Close all \(3\)/, 'the count says how many windows the item will take');

  clickMenuItem('Close all (3)');
  await flush();
  assert.equal(
    document.querySelectorAll('[data-modal-panel]').length, 0,
    'every instance behind the tab closed, not just the newest',
  );
});

test('a single-window tab still opens that window\'s own menu', async (t) => {
  const mounted = await mount([SINGLE]);
  t.after(() => mounted.unmount());

  rightClickTab(SINGLE);
  await flush();

  const text = document.body.textContent ?? '';
  assert.doesNotMatch(text, /Close all/, 'one window is not a group');
  // The per-window items the taskbar knows nothing about are why a lone tab
  // keeps delegating instead of getting the group menu.
  assert.match(text, /Add to desktop/);
  assert.match(text, /Minimize/);
});

test('a taskbar menu event reaches one window, not every window sharing its label', async (t) => {
  const mounted = await mount([MULTI, MULTI]);
  t.after(() => mounted.unmount());

  const keys = Array.from(document.querySelectorAll('[data-modal-panel]'))
    .map(panel => panel.getAttribute('data-window-key'));
  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1]);

  act(() => {
    window.dispatchEvent(new CustomEvent('modal-context-menu', {
      detail: { windowKey: keys[0], label: 'Purchase Invoices', x: 40, y: 40 },
    }));
  });
  await flush();

  // Both instances carry the identical registry label on purpose, so the older
  // label-only match had both of them open a menu at the same point.
  assert.equal(occurrences('Add to desktop'), 1, 'exactly one window opened a menu');
});
