import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { act, render, pressKey } from './dom';
import { useState } from 'react';
import MasterDetailLayout from '../src/shell/MasterDetailLayout';
import SidebarLayout from '../src/shell/SidebarLayout';

const originalObserver = globalThis.ResizeObserver;
let resize: (width: number) => void;
let disconnected = false;
class Observer {
  constructor(private callback: ResizeObserverCallback) {}
  observe(target: Element) {
    resize = width => this.callback([{ target, contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  disconnect() { disconnected = true; }
}
function setup() {
  disconnected = false;
  globalThis.ResizeObserver = Observer as unknown as typeof ResizeObserver;
}
afterEach(() => { globalThis.ResizeObserver = originalObserver; });

function Example() {
  const [selected, setSelected] = useState(false);
  return <MasterDetailLayout selected={selected} onBack={() => setSelected(false)} list={
    <><input aria-label="Filter" defaultValue="saved filter" /><button onClick={() => setSelected(true)}>Item one</button></>
  }><input aria-label="Detail draft" defaultValue="saved draft" /></MasterDetailLayout>;
}
function hidden(element: Element) { return !!element.closest('[hidden]'); }

test('container resize switches panes while preserving list, draft and scroll; Back restores focus', () => {
  setup();
  const view = render(<Example />);
  const list = view.container.querySelector<HTMLElement>('[aria-label="List"]')!;
  const filter = view.container.querySelector<HTMLInputElement>('[aria-label="Filter"]')!;
  const detail = view.container.querySelector<HTMLElement>('[aria-label="Details"]')!;
  const item = view.container.querySelector<HTMLButtonElement>('button')!;
  const scroll = list.parentElement!;
  scroll.scrollTop = 145;
  act(() => resize(900));
  assert.equal(hidden(list), false);
  assert.equal(hidden(detail), false);
  act(() => resize(500));
  assert.equal(hidden(detail), true);
  act(() => { item.focus(); item.click(); });
  assert.equal(hidden(list), true);
  assert.equal(hidden(detail), false);
  const back = [...detail.querySelectorAll('button')].find(button => button.textContent === 'Back to list')!;
  assert.equal(document.activeElement, back);
  assert.equal(back.getAttribute('type'), 'button');
  assert.equal(view.container.querySelector('[aria-label="Filter"]'), filter);
  assert.equal(filter.value, 'saved filter');
  act(() => back.click());
  assert.equal(hidden(list), false);
  assert.equal(document.activeElement, item);
  assert.equal(scroll.scrollTop, 145);
  assert.equal(view.container.querySelector<HTMLInputElement>('[aria-label="Detail draft"]')!.value, 'saved draft');
  act(() => resize(900));
  assert.equal(hidden(list), false);
  assert.equal(hidden(detail), false);
  view.unmount();
  assert.equal(disconnected, true);
});

test('custom breakpoint follows element width, and hidden windows retain their usable layout', () => {
  setup();
  const view = render(<MasterDetailLayout compactBreakpoint={600} selected list={<button>Item</button>} onBack={() => {}} backLabel="All items"><p>Detail</p></MasterDetailLayout>);
  const list = view.container.querySelector('[aria-label="List"]')!;
  act(() => resize(600));
  assert.equal(hidden(list), false);
  act(() => resize(599));
  assert.equal(hidden(list), true);
  assert.equal(view.container.querySelector('[aria-label="Details"] button')?.textContent, 'All items');
  act(() => resize(0));
  assert.equal(hidden(list), true);
});

test('resizing to compact keeps focused content visible and returns from a hidden Back control', () => {
  setup();
  const view = render(<Example />);
  act(() => resize(900));
  const item = view.container.querySelector<HTMLButtonElement>('button')!;
  act(() => { item.focus(); item.click(); });
  assert.equal(document.activeElement, item);
  act(() => resize(500));
  assert.equal(document.activeElement?.textContent, 'Back to list');
  act(() => resize(900));
  assert.equal(document.activeElement?.getAttribute('aria-label'), 'Details');
});

test('shrinking an unselected detail moves focus into the visible list', () => {
  setup();
  const view = render(<Example />);
  act(() => resize(900));
  act(() => view.container.querySelector<HTMLInputElement>('[aria-label="Detail draft"]')!.focus());
  act(() => resize(500));
  assert.equal(document.activeElement?.getAttribute('aria-label'), 'List');
});

test('Back falls back to the list region if the selected row was removed', () => {
  setup();
  const view = render(<MasterDetailLayout selected={false} list={<button>Item</button>} onBack={() => {}}><p>Detail</p></MasterDetailLayout>);
  act(() => resize(500));
  act(() => view.container.querySelector<HTMLButtonElement>('button')!.focus());
  view.rerender(<MasterDetailLayout selected list={<p>No matches</p>} onBack={() => {}}><p>Detail</p></MasterDetailLayout>);
  view.rerender(<MasterDetailLayout selected={false} list={<p>No matches</p>} onBack={() => {}}><p>Detail</p></MasterDetailLayout>);
  assert.equal(document.activeElement?.getAttribute('aria-label'), 'List');
});

test('resize separator exposes its value and supports arrows, bounds and reset for either side', () => {
  for (const side of ['left', 'right'] as const) {
    const view = render(<SidebarLayout side={side} sidebar="List" defaultWidth={260} minWidth={200} maxWidth={400}>Detail</SidebarLayout>);
    const handle = view.container.querySelector<HTMLElement>('[role="separator"]')!;
    assert.equal(handle.getAttribute('aria-orientation'), 'vertical');
    assert.equal(handle.tabIndex, 0);
    assert.equal(handle.getAttribute('aria-valuenow'), '260');
    assert.ok(document.getElementById(handle.getAttribute('aria-controls')!));
    pressKey('ArrowRight', { target: handle });
    assert.equal(handle.getAttribute('aria-valuenow'), side === 'left' ? '276' : '244');
    pressKey('End', { target: handle });
    assert.equal(handle.getAttribute('aria-valuenow'), '400');
    pressKey(side === 'left' ? 'ArrowRight' : 'ArrowLeft', { target: handle });
    assert.equal(handle.getAttribute('aria-valuenow'), '400');
    pressKey('Home', { target: handle });
    assert.equal(handle.getAttribute('aria-valuenow'), '200');
    pressKey('Enter', { target: handle });
    assert.equal(handle.getAttribute('aria-valuenow'), '260');
    view.unmount();
  }
});

test('pointer resizing stops when compact mode hides the separator, retaining the desktop width', () => {
  const view = render(<SidebarLayout sidebar="List" defaultWidth={260}>Detail</SidebarLayout>);
  const handle = view.container.querySelector<HTMLElement>('[role="separator"]')!;
  act(() => {
    handle.dispatchEvent(new MouseEvent('pointerdown', { clientX: 260, bubbles: true, cancelable: true }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 320 }));
  });
  assert.equal(handle.getAttribute('aria-valuenow'), '320');
  view.rerender(<SidebarLayout sidebar="List" activePane="content" defaultWidth={260}>Detail</SidebarLayout>);
  assert.equal(hidden(handle), true);
  assert.equal(handle.tabIndex, -1);
  assert.equal(document.body.style.cursor, '');
  act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 390 })); });
  view.rerender(<SidebarLayout sidebar="List" defaultWidth={260}>Detail</SidebarLayout>);
  assert.equal(handle.getAttribute('aria-valuenow'), '320');
});

test('stored widths are clamped and blocked storage still renders the default', () => {
  window.localStorage.setItem('layout-test-width', '9999');
  const stored = render(<SidebarLayout storageKey="layout-test-width" sidebar="List" maxWidth={400}>Detail</SidebarLayout>);
  assert.equal(stored.container.querySelector('[role="separator"]')!.getAttribute('aria-valuenow'), '400');
  stored.unmount();
  window.localStorage.removeItem('layout-test-width');
  const prototype = Object.getPrototypeOf(window.localStorage);
  const original = Object.getOwnPropertyDescriptor(prototype, 'getItem')!;
  Object.defineProperty(prototype, 'getItem', { configurable: true, value() { throw new Error('Storage blocked'); } });
  try {
    const blocked = render(<SidebarLayout storageKey="blocked" sidebar="List" defaultWidth={280}>Detail</SidebarLayout>);
    assert.equal(blocked.container.querySelector('[role="separator"]')!.getAttribute('aria-valuenow'), '280');
    blocked.unmount();
  } finally {
    Object.defineProperty(prototype, 'getItem', original);
  }
});
