import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, act, pressKey } from './dom';
import SearchableSelect from '../src/shell/SearchableSelect';
import Select from '../src/forms/Select';
import DatePicker from '../src/forms/DatePicker';
import DateRangePicker from '../src/forms/DateRangePicker';
import TagInput from '../src/forms/TagInput';
import ServerStatusIndicator from '../src/shell/ServerStatusIndicator';
import { PopupMenu, PopupMenuItem } from '../src/shell/PopupMenu';
import GlobalSearch from '../src/shell/GlobalSearch';
import Dialog from '../src/shell/Dialog';
import Drawer from '../src/shell/Drawer';
import { dismissPopups, OVERLAY_OPEN_EVENT } from '../src/shell/overlayEvents';
import { runEscapeInterceptors } from '../src/shell/escapeInterceptors';
import { Z_LAYERS } from '../src/shell/zLayers';

// Opening Select's listbox runs an effect that builds a selector with
// `CSS.escape`, and jsdom ships no `CSS` at all — see the longer note in
// `selectOptionDescription.test.tsx`, which this stub copies.
Object.defineProperty(globalThis, 'CSS', {
  configurable: true,
  writable: true,
  value: { escape: (s: string) => s.replace(/[^\w-]/g, c => `\\${c}`) },
});

/**
 * An overlay opening closes every portalled popup.
 *
 * The bug: in a mould edit window, a design `SearchableSelect` was open; ⌘K
 * raised the search palette with its blurred backdrop, and the option list
 * stayed open — painted crisp ABOVE the palette. The list lives on the popup
 * layer, above the overlay layer on purpose (a popup opened inside a dialog
 * must not draw behind it), and nothing ⌘K does is an outside press, a pick or
 * one of the list's own keys. So overlays announce themselves and popups close.
 *
 * One spec per popup kind, because each one subscribes on its own and a kind
 * that forgets is exactly the bug again.
 */

const OPTIONS = [
  { value: 'd1', label: 'Design One' },
  { value: 'd2', label: 'Design Two' },
];

/** Every popup is portalled to <body>, outside the render container. */
const bodyText = () => document.body.textContent ?? '';
const dismiss = () => act(() => { dismissPopups(); });

test('dismissPopups dispatches OVERLAY_OPEN_EVENT on window', () => {
  let seen = 0;
  const onEvent = () => { seen += 1; };
  window.addEventListener(OVERLAY_OPEN_EVENT, onEvent);
  try {
    dismissPopups();
    assert.equal(seen, 1);
  } finally {
    window.removeEventListener(OVERLAY_OPEN_EVENT, onEvent);
  }
});

test('SearchableSelect: an overlay opening closes the list', () => {
  const view = render(<SearchableSelect value="" onChange={() => {}} options={OPTIONS} />);
  try {
    const input = view.container.querySelector('input')!;
    act(() => { input.focus(); });
    assert.match(bodyText(), /Design Two/, 'focusing the field opens the list');
    assert.equal(input.getAttribute('aria-expanded'), 'true');

    dismiss();
    assert.doesNotMatch(bodyText(), /Design Two/, 'the list closes when an overlay opens');
    assert.equal(input.getAttribute('aria-expanded'), 'false');
  } finally {
    view.unmount();
  }
});

test('SearchableSelect: the list sits on the popup layer', () => {
  const view = render(<SearchableSelect value="" onChange={() => {}} options={OPTIONS} />);
  try {
    act(() => { view.container.querySelector('input')!.focus(); });
    const option = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Design One'))!;
    const menu = option.closest('.fixed') as HTMLElement;
    assert.equal(menu.style.zIndex, String(Z_LAYERS.popup));
  } finally {
    view.unmount();
  }
});

test('SearchableSelect: free text typed before an overlay opens is committed, as an outside press commits it', () => {
  const picked: string[] = [];
  const view = render(<SearchableSelect value="" onChange={v => picked.push(v)} options={OPTIONS} allowFreeText />);
  try {
    const input = view.container.querySelector('input')!;
    act(() => { input.focus(); });
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')!.set!;
      setter.call(input, 'Custom design');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    dismiss();
    assert.deepEqual(picked, ['Custom design']);
  } finally {
    view.unmount();
  }
});

test('SearchableSelect: focus leaving the field closes the list', () => {
  const view = render(
    <div>
      <SearchableSelect value="" onChange={() => {}} options={OPTIONS} />
      <button type="button">Elsewhere</button>
    </div>,
  );
  try {
    const input = view.container.querySelector('input')!;
    act(() => { input.focus(); });
    assert.match(bodyText(), /Design Two/);

    const elsewhere = [...view.container.querySelectorAll('button')].find(b => b.textContent === 'Elsewhere')!;
    act(() => { elsewhere.focus(); });
    assert.doesNotMatch(bodyText(), /Design Two/, 'focus moved to another control, so the list closes');
  } finally {
    view.unmount();
  }
});

test('SearchableSelect: focus moving INTO the portalled list does not close it', () => {
  const view = render(<SearchableSelect value="" onChange={() => {}} options={OPTIONS} />);
  try {
    const input = view.container.querySelector('input')!;
    act(() => { input.focus(); });
    const option = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Design Two'))!;
    // What a click on an option does in Chrome, where a button takes focus.
    act(() => { option.focus(); });
    assert.match(bodyText(), /Design Two/, 'the menu is part of the control');
  } finally {
    view.unmount();
  }
});

test('SearchableSelect: a press inside the list that blurs the field does not close it', () => {
  const view = render(<SearchableSelect value="" onChange={() => {}} options={[]} />);
  try {
    const input = view.container.querySelector('input')!;
    act(() => { input.focus(); });
    // The "no matches" line is not focusable; pressing it moves focus to <body>.
    const empty = [...document.querySelectorAll('p')].find(p => /no match/i.test(p.textContent ?? ''))!;
    assert.ok(empty, 'the empty list renders its "no matches" line');
    act(() => {
      empty.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      input.blur();
    });
    assert.ok(document.body.contains(empty), 'the list is still open');
  } finally {
    view.unmount();
  }
});

test('SearchableSelect: an open list consumes Escape at the seam', () => {
  const view = render(<SearchableSelect value="" onChange={() => {}} options={OPTIONS} />);
  try {
    act(() => { view.container.querySelector('input')!.focus(); });
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    let consumed = false;
    act(() => { consumed = runEscapeInterceptors(escape); });
    assert.equal(consumed, true, 'Escape belongs to the list before the window around it');
    assert.doesNotMatch(bodyText(), /Design Two/);
  } finally {
    view.unmount();
  }
});

test('SearchableSelect: Escape closes the list and NOT the dialog around it', () => {
  let closed = 0;
  const view = render(
    <Dialog open onClose={() => { closed += 1; }} title="Edit mould">
      <SearchableSelect value="" onChange={() => {}} options={OPTIONS} />
    </Dialog>,
  );
  try {
    act(() => { document.querySelector<HTMLInputElement>('[role="dialog"] input')!.focus(); });
    assert.match(bodyText(), /Design Two/, 'a list opened inside an open dialog stays open');
    pressKey('Escape');
    assert.doesNotMatch(bodyText(), /Design Two/);
    assert.equal(closed, 0, 'the dialog stays');
  } finally {
    view.unmount();
  }
});

test('Select: an overlay opening closes the listbox', () => {
  const view = render(<Select value="" onChange={() => {}} options={OPTIONS} aria-label="Design" />);
  try {
    act(() => { view.container.querySelector<HTMLButtonElement>('button[role="combobox"]')!.click(); });
    const listbox = document.querySelector<HTMLElement>('[role="listbox"]');
    assert.ok(listbox, 'the listbox opens');
    assert.equal(listbox!.style.zIndex, String(Z_LAYERS.popup));
    dismiss();
    assert.equal(document.querySelector('[role="listbox"]'), null);
  } finally {
    view.unmount();
  }
});

test('DatePicker: an overlay opening closes the calendar', () => {
  const view = render(<DatePicker value="2026-08-11" onChange={() => {}} aria-label="Ship date" />);
  try {
    act(() => { view.container.querySelector('button')!.click(); });
    const panel = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Ship date"]');
    assert.ok(panel(), 'the calendar opens');
    assert.equal(panel()!.style.zIndex, String(Z_LAYERS.popup));
    dismiss();
    assert.equal(panel(), null);
  } finally {
    view.unmount();
  }
});

test('DateRangePicker: an overlay opening closes the panel', () => {
  const view = render(<DateRangePicker from="" to="" onChange={() => {}} />);
  try {
    act(() => { view.container.querySelector('button')!.click(); });
    const panel = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Date range"]');
    assert.ok(panel(), 'the panel opens');
    assert.equal(panel()!.style.zIndex, String(Z_LAYERS.popup));
    dismiss();
    assert.equal(panel(), null);
  } finally {
    view.unmount();
  }
});

test('TagInput: an overlay opening closes the menu', () => {
  const view = render(<TagInput value={[]} onChange={() => {}} options={OPTIONS} />);
  try {
    act(() => { view.container.querySelector('input')!.focus(); });
    assert.match(bodyText(), /Design Two/, 'focusing the field opens the menu');
    dismiss();
    assert.doesNotMatch(bodyText(), /Design Two/);
  } finally {
    view.unmount();
  }
});

test('ServerStatusIndicator: an overlay opening closes the details card', () => {
  const view = render(<ServerStatusIndicator healthCheck={async () => ({ ok: true })} pollMs={60_000} />);
  try {
    act(() => { view.container.querySelector('button')!.click(); });
    const card = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Server connection details"]');
    assert.ok(card(), 'the card opens');
    assert.equal(card()!.style.zIndex, String(Z_LAYERS.popup));
    dismiss();
    assert.equal(card(), null);
  } finally {
    view.unmount();
  }
});

test('PopupMenu: an overlay opening asks the owner to close it', () => {
  let closed = 0;
  const view = render(
    <PopupMenu portal onClose={() => { closed += 1; }} style={{ left: 10, top: 10 }}>
      <PopupMenuItem>Rename</PopupMenuItem>
    </PopupMenu>,
  );
  try {
    const menu = document.querySelector<HTMLElement>('[data-popup-menu-tree]')!;
    assert.equal(menu.style.zIndex, String(Z_LAYERS.menu));
    dismiss();
    assert.equal(closed, 1);
  } finally {
    view.unmount();
  }
});

test('PopupMenu: a caller that layers the menu with a z- class keeps its own layer', () => {
  const view = render(
    <PopupMenu className="z-[1200]" style={{ left: 10, top: 10 }}>
      <PopupMenuItem>Rename</PopupMenuItem>
    </PopupMenu>,
  );
  try {
    const menu = document.querySelector<HTMLElement>('[data-popup-menu-tree]')!;
    assert.equal(menu.style.zIndex, '', 'no inline z-index to beat the class');
  } finally {
    view.unmount();
  }
});

test('GlobalSearch: ⌘K over an open SearchableSelect closes the list and opens the palette on the overlay layer', () => {
  const view = render(
    <div>
      <SearchableSelect value="" onChange={() => {}} options={OPTIONS} />
      <GlobalSearch providers={[]} />
    </div>,
  );
  try {
    const field = view.container.querySelector('input')!;
    act(() => { field.focus(); });
    assert.match(bodyText(), /Design Two/);

    pressKey('k', { meta: true, target: field });

    assert.doesNotMatch(bodyText(), /Design Two/, 'the list closed as the palette opened');
    const palette = [...document.body.children].find(el => (el as HTMLElement).style?.zIndex === String(Z_LAYERS.overlay)) as HTMLElement | undefined;
    assert.ok(palette, 'the palette is portalled to <body> on the overlay layer');
    assert.ok(palette!.querySelector('input'), 'and it holds the search field');
    assert.equal(view.container.contains(palette!), false, 'not rendered in place');
  } finally {
    view.unmount();
  }
});

test('Dialog: opening closes a popup open outside it', () => {
  const Harness = ({ dialogOpen }: { dialogOpen: boolean }) => (
    <div>
      <Select value="" onChange={() => {}} options={OPTIONS} aria-label="Design" />
      <Dialog open={dialogOpen} onClose={() => {}} title="Confirm">Sure?</Dialog>
    </div>
  );
  const view = render(<Harness dialogOpen={false} />);
  try {
    act(() => { view.container.querySelector<HTMLButtonElement>('button[role="combobox"]')!.click(); });
    assert.ok(document.querySelector('[role="listbox"]'), 'the listbox opens');
    view.rerender(<Harness dialogOpen />);
    assert.equal(document.querySelector('[role="listbox"]'), null, 'the dialog opening closed it');
    const layer = document.querySelector<HTMLElement>('[role="presentation"]')!;
    assert.equal(layer.style.zIndex, String(Z_LAYERS.overlay));
  } finally {
    view.unmount();
  }
});

test('Dialog: a popup opened from inside an open dialog stays open', () => {
  const view = render(
    <Dialog open onClose={() => {}} title="Edit">
      <Select value="" onChange={() => {}} options={OPTIONS} aria-label="Design" />
    </Dialog>,
  );
  try {
    act(() => { document.querySelector<HTMLButtonElement>('[role="dialog"] button[role="combobox"]')!.click(); });
    assert.ok(document.querySelector('[role="listbox"]'), 'the listbox is open inside the dialog');
  } finally {
    view.unmount();
  }
});

test('Drawer: opening closes a popup open outside it', () => {
  const Harness = ({ drawerOpen }: { drawerOpen: boolean }) => (
    <div>
      <DatePicker value="2026-08-11" onChange={() => {}} aria-label="Ship date" />
      <Drawer open={drawerOpen} onClose={() => {}} title="Filters">Body</Drawer>
    </div>
  );
  const view = render(<Harness drawerOpen={false} />);
  try {
    act(() => { view.container.querySelector('button')!.click(); });
    assert.ok(document.querySelector('[role="dialog"][aria-label="Ship date"]'));
    view.rerender(<Harness drawerOpen />);
    assert.equal(document.querySelector('[role="dialog"][aria-label="Ship date"]'), null);
  } finally {
    view.unmount();
  }
});
