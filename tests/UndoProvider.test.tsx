/**
 * The React half of undo/redo — the half that shipped in 4.3.0 untested.
 *
 * `tests/undoHistory.test.ts` covers the reducer, which was never where the
 * risk was. The risk was in the 332 lines of React around it: a provider that
 * binds a `window` listener, a hook that watches a value across renders, and a
 * question — "is this my window?" — that the provider was asking of module
 * globals that answer the same for everyone. All of that is invisible to a
 * `renderToStaticMarkup` spec, which is why it went out. These run in a real
 * DOM (see `tests/dom.ts`) so the effects actually execute.
 *
 * The window-scoping specs below fail on 4.3.0.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// First, and before anything that touches `src/` — `dom.ts` installs the
// globals that `Modal.tsx` reads as it evaluates.
import { act, render, flush, pressKey } from './dom';
import { mountModal, activateModal, deactivateAllModals, useIsActiveWindow } from '../src/shell/Modal';
import { UndoProvider, useUndo, useUndoable, useUndoableState } from '../src/shell/UndoProvider';
import { useEffect, useState } from 'react';

/**
 * Open a window the way `Modal` does — a private per-mount id, registered
 * against the stable `windowKey` that `WindowManager` knows it by.
 *
 * Going through the real `mountModal` is the point: the mapping between those
 * two id spaces is exactly what the fix turns on, and a spec that stubbed it
 * would have agreed with the broken version.
 */
let seq = 0;
function openWindow(windowKey: string) {
  const modalId = `modal-test-${++seq}`;
  act(() => { mountModal(modalId, windowKey); });
  return { modalId, windowKey, front: () => act(() => { activateModal(modalId); }) };
}

/** Close every test window, so one spec's z-order is not the next one's. */
function closeAllWindows() {
  act(() => { deactivateAllModals(); });
}

// ── A form, driven from the spec ──────────────────────────────────────────
// `api` is filled in on each render, so the spec always calls the current
// setter rather than one closed over a stale render.
interface FormApi { set: (v: string) => void }

function Field({ api, label = 'name' }: { api: Partial<FormApi>; label?: string }) {
  const [value, setValue] = useUndoableState('', { label });
  api.set = setValue;
  return <span data-testid="value">{value}</span>;
}

const valueOf = (r: { container: HTMLElement }) =>
  r.container.querySelector('[data-testid="value"]')!.textContent;

const type = (api: Partial<FormApi>, v: string) => act(() => { api.set!(v); });

// ── Window scoping — the 4.3.0 bug ────────────────────────────────────────

test('⌘Z steps back the frontmost window only, and leaves the others alone', async () => {
  const w1 = openWindow('win-iso-1');
  const w2 = openWindow('win-iso-2');
  const a1: Partial<FormApi> = {};
  const a2: Partial<FormApi> = {};
  const r1 = render(<UndoProvider windowId="win-iso-1"><Field api={a1} /></UndoProvider>);
  const r2 = render(<UndoProvider windowId="win-iso-2"><Field api={a2} /></UndoProvider>);

  type(a1, 'first window');
  type(a2, 'second window');
  await flush();
  assert.equal(valueOf(r1), 'first window');
  assert.equal(valueOf(r2), 'second window');

  w2.front();
  await flush();
  pressKey('z', { meta: true });
  await flush();
  assert.equal(valueOf(r2), '', 'the frontmost window took its edit back');
  assert.equal(
    valueOf(r1), 'first window',
    'the background window was reverted by a ⌘Z aimed at another window — this is the 4.3.0 bug',
  );

  // And the other way round, so the spec cannot pass by the frontmost window
  // happening to be the only one that ever responds.
  w1.front();
  await flush();
  pressKey('z', { meta: true });
  await flush();
  assert.equal(valueOf(r1), '', 'the newly-fronted window now answers');
  assert.equal(valueOf(r2), '', 'and the other one has nothing left to lose');

  r1.unmount();
  r2.unmount();
  closeAllWindows();
});

test('a background window keeps its redo stack too — ⇧⌘Z is scoped the same way', async () => {
  const w1 = openWindow('win-redo-1');
  const w2 = openWindow('win-redo-2');
  const a1: Partial<FormApi> = {};
  const a2: Partial<FormApi> = {};
  const r1 = render(<UndoProvider windowId="win-redo-1"><Field api={a1} /></UndoProvider>);
  const r2 = render(<UndoProvider windowId="win-redo-2"><Field api={a2} /></UndoProvider>);

  type(a1, 'alpha');
  type(a2, 'beta');
  await flush();

  // Undo in each, so both have something to redo.
  w1.front();
  await flush();
  pressKey('z', { meta: true });
  await flush();
  w2.front();
  await flush();
  pressKey('z', { meta: true });
  await flush();
  assert.equal(valueOf(r1), '');
  assert.equal(valueOf(r2), '');

  // w2 is frontmost, so only w2 redoes.
  pressKey('z', { meta: true, shift: true });
  await flush();
  assert.equal(valueOf(r2), 'beta', 'the frontmost window redid');
  assert.equal(valueOf(r1), '', 'the background window did not');

  r1.unmount();
  r2.unmount();
  closeAllWindows();
});

test('one open window answers ⌘Z without needing to be activated first', async () => {
  openWindow('win-solo');
  const api: Partial<FormApi> = {};
  const r = render(<UndoProvider windowId="win-solo"><Field api={api} /></UndoProvider>);

  type(api, 'only window');
  await flush();
  pressKey('z', { meta: true });
  await flush();
  assert.equal(valueOf(r), '');

  r.unmount();
  closeAllWindows();
});

test('a window id nothing has registered falls back rather than going silent', async () => {
  // `rendersOwnModal` windows wrap a <Modal> the shell never gave a windowKey,
  // so the id resolves to nothing. The fallback has the old flaw — it cannot
  // tell windows apart — but a window whose undo simply never fires would be
  // the worse trade, and silent.
  openWindow('win-known-a');
  openWindow('win-known-b');
  const api: Partial<FormApi> = {};
  const r = render(<UndoProvider windowId="win-never-registered"><Field api={api} /></UndoProvider>);

  type(api, 'orphan');
  await flush();
  pressKey('z', { meta: true });
  await flush();
  assert.equal(valueOf(r), '', 'an unmapped window still responds to its own hotkey');

  r.unmount();
  closeAllWindows();
});

test('useIsActiveWindow reads window keys, not the private modal ids', () => {
  // The trap this replaces: `activationOrder` holds `modal-xxxxxx` ids, so
  // testing a windowKey against them directly is false for every window —
  // which reads as "undo is broken everywhere" rather than "undo leaks
  // everywhere", but is just as wrong.
  const a = openWindow('win-keyspace-a');
  openWindow('win-keyspace-b');

  const seen: Record<string, boolean> = {};
  function Probe({ id }: { id: string }) {
    seen[id] = useIsActiveWindow(id);
    return null;
  }
  a.front();
  const r = render(<><Probe id="win-keyspace-a" /><Probe id="win-keyspace-b" /></>);

  assert.equal(seen['win-keyspace-a'], true, 'the fronted window key resolves to the active modal');
  assert.equal(seen['win-keyspace-b'], false, 'and the one behind it does not');

  r.unmount();
  closeAllWindows();
});

test('the provider and its Modal are given the same window id', () => {
  // The behaviour specs above go through `mountModal` directly, so they cannot
  // see a WindowManager that passes the provider one id and the Modal another.
  // Nothing about undo works if those two disagree.
  const src = readFileSync(`${process.env.REPO_ROOT}/src/shell/WindowManager.tsx`, 'utf8');
  assert.match(src, /<UndoProvider windowId=\{item\.id\}>/, 'the provider is scoped to the window');
  assert.match(src, /windowKey=\{item\.id\}/, 'and the Modal is keyed by the same value');
});

// ── Loading a record ──────────────────────────────────────────────────────

/** A form filled from an async fetch, the shape every entity window has. */
function LoadedForm({ api, withBaseline }: { api: Partial<FormApi & { arrive: (v: string) => void }>; withBaseline: boolean }) {
  const [loaded, setLoaded] = useState<string | null>(null);
  const [name, setName] = useUndoableState('', { label: 'name' });
  const { baseline } = useUndo();
  api.set = setName;
  api.arrive = setLoaded;
  useEffect(() => {
    if (loaded === null) return;
    setName(loaded);
    if (withBaseline) baseline();
  }, [loaded, withBaseline, baseline, setName]);
  return <span data-testid="value">{name}</span>;
}

test('baseline() makes a loaded record the starting point, not the first thing ⌘Z takes back', async () => {
  openWindow('win-load');
  const api: Partial<FormApi & { arrive: (v: string) => void }> = {};
  const r = render(<UndoProvider windowId="win-load"><LoadedForm api={api} withBaseline /></UndoProvider>);

  act(() => { api.arrive!('from the server'); });
  await flush();
  assert.equal(valueOf(r), 'from the server');

  // Nothing has been edited yet, so there is nothing to undo — and crucially
  // ⌘Z must not empty the form the user was just handed.
  pressKey('z', { meta: true });
  await flush();
  assert.equal(valueOf(r), 'from the server', 'the load itself is not an undoable step');

  // A real edit on top of it still undoes, back to the loaded value.
  type(api, 'edited by the user');
  await flush();
  pressKey('z', { meta: true });
  await flush();
  assert.equal(valueOf(r), 'from the server', 'and undo stops at the record as it arrived');

  r.unmount();
  closeAllWindows();
});

test('without baseline(), the load is recorded — the trap the affordance exists for', async () => {
  openWindow('win-load-raw');
  const api: Partial<FormApi & { arrive: (v: string) => void }> = {};
  const r = render(<UndoProvider windowId="win-load-raw"><LoadedForm api={api} withBaseline={false} /></UndoProvider>);

  act(() => { api.arrive!('from the server'); });
  await flush();
  pressKey('z', { meta: true });
  await flush();
  assert.equal(valueOf(r), '', 'documents the behaviour a form gets if it never calls baseline()');

  r.unmount();
  closeAllWindows();
});

test('baseline() survives a refetch into an open window', async () => {
  openWindow('win-refetch');
  const api: Partial<FormApi & { arrive: (v: string) => void }> = {};
  const r = render(<UndoProvider windowId="win-refetch"><LoadedForm api={api} withBaseline /></UndoProvider>);

  act(() => { api.arrive!('first load'); });
  await flush();
  type(api, 'user edit');
  await flush();
  act(() => { api.arrive!('second load'); });
  await flush();
  assert.equal(valueOf(r), 'second load');

  pressKey('z', { meta: true });
  await flush();
  assert.equal(valueOf(r), 'second load', 'the edit made before the refetch is not the new undo target');

  r.unmount();
  closeAllWindows();
});

/** The PI shape: a once-per-id hydration guard that still reaches
 *  `baseline()` on the edge where the query flips to fetching — nothing is
 *  re-seeded, so nothing on screen changes, and the history must not go. */
function GuardedForm({ api }: { api: Partial<FormApi & { rebaseline: () => void }> }) {
  const [name, setName] = useUndoableState('', { label: 'name' });
  const { baseline } = useUndo();
  api.set = setName;
  api.rebaseline = baseline;
  return <span data-testid="value">{name}</span>;
}

test('baseline() with nothing arriving behind it keeps the history — the refetch edge', async () => {
  openWindow('win-refetch-edge');
  const api: Partial<FormApi & { rebaseline: () => void }> = {};
  const r = render(<UndoProvider windowId="win-refetch-edge"><GuardedForm api={api} /></UndoProvider>);

  type(api, 'user edit');
  await flush();
  // The background refetch starts; the form's guard skips re-seeding but the
  // effect still ends in baseline(). No value moves.
  act(() => { api.rebaseline!(); });
  await flush();
  await flush();

  pressKey('z', { meta: true });
  await flush();
  assert.equal(valueOf(r), '', 'the edit before the refetch edge is still there to undo');

  r.unmount();
  closeAllWindows();
});

/** A default written into state and baselined in the same MOUNT effect —
 *  the entity picker on a new invoice. */
function MountDefaultForm({ api }: { api: Partial<FormApi> }) {
  const [name, setName] = useUndoableState('', { label: 'company' });
  const { baseline } = useUndo();
  api.set = setName;
  useEffect(() => { setName('default entity'); baseline(); }, [setName, baseline]);
  return <span data-testid="value">{name}</span>;
}

test('a default set and baselined in the mount effect is not a step', async () => {
  openWindow('win-mount-default');
  const api: Partial<FormApi> = {};
  const r = render(<UndoProvider windowId="win-mount-default"><MountDefaultForm api={api} /></UndoProvider>);
  await flush();
  await flush();
  assert.equal(valueOf(r), 'default entity');

  pressKey('z', { meta: true });
  await flush();
  assert.equal(valueOf(r), 'default entity', 'a window nobody touched has nothing to undo');

  type(api, 'picked by the user');
  await flush();
  pressKey('z', { meta: true });
  await flush();
  assert.equal(valueOf(r), 'default entity', 'and a real pick undoes back to the default');

  r.unmount();
  closeAllWindows();
});

function SavingForm({ api }: { api: Partial<FormApi & { save: () => void }> }) {
  const [name, setName] = useUndoableState('', { label: 'name' });
  const { clear } = useUndo();
  api.set = setName;
  api.save = clear;
  return <span data-testid="value">{name}</span>;
}

test('clear() after a save empties the history even though nothing on screen moved', async () => {
  openWindow('win-save-clear');
  const api: Partial<FormApi & { save: () => void }> = {};
  const r = render(<UndoProvider windowId="win-save-clear"><SavingForm api={api} /></UndoProvider>);

  type(api, 'saved value');
  await flush();
  act(() => { api.save!(); });
  await flush();
  await flush();

  pressKey('z', { meta: true });
  await flush();
  assert.equal(valueOf(r), 'saved value', '"earlier" is on the server now');

  r.unmount();
  closeAllWindows();
});

// ── Recording ─────────────────────────────────────────────────────────────

test('a re-render that changes nothing records no step', async () => {
  openWindow('win-rerender');
  let renders = 0;
  const api: Partial<FormApi> = {};
  function Counting({ tick }: { tick: number }) {
    renders++;
    const [value, setValue] = useUndoableState('', { label: 'name' });
    api.set = setValue;
    return <><span data-testid="value">{value}</span><span data-testid="tick">{tick}</span></>;
  }
  const r = render(<UndoProvider windowId="win-rerender"><Counting tick={0} /></UndoProvider>);
  type(api, 'typed');
  await flush();

  const before = renders;
  r.rerender(<UndoProvider windowId="win-rerender"><Counting tick={1} /></UndoProvider>);
  await flush();
  assert.ok(renders > before, 'the re-render really happened');

  // One step, from the one real change. If the recording effect fired on every
  // render, this would take two ⌘Z to get back to empty.
  pressKey('z', { meta: true });
  await flush();
  assert.equal(valueOf(r), '');

  r.unmount();
  closeAllWindows();
});

test('a slice rebuilt on every render trips the runaway guard instead of hanging the tab', async () => {
  openWindow('win-runaway');
  const errors: string[] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => { errors.push(String(args[0])); };

  // The documented mistake: the registered value is a fresh array each render,
  // so it reads as changed every time. Recording a step changes the context,
  // which re-renders every consumer, which rebuilds the array — a closed loop.
  // It needs one real edit to start it turning, which is what makes it a trap:
  // the form looks fine until someone types into it.
  const api: Partial<FormApi> = {};
  function Derived() {
    const [rows] = useState([{ on: true }, { on: false }]);
    const [name, setName] = useUndoableState('', { label: 'name' });
    api.set = setName;
    useUndoable(rows.filter(r => r.on), () => {}, { label: 'rows' });
    return null;
  }

  try {
    const r = render(<UndoProvider windowId="win-runaway"><Derived /></UndoProvider>);
    await flush();
    type(api, 'the keystroke that starts it');
    // Bounded: the guard trips at RUNAWAY_LIMIT and recording stops, so this
    // settles instead of spinning. That it returns at all is the assertion.
    await flush();
    r.unmount();
  } finally {
    console.error = realError;
  }

  closeAllWindows();
  assert.ok(
    errors.some(e => e.includes('UndoProvider') && e.includes('rows')),
    `expected a runaway warning naming the slice, got: ${JSON.stringify(errors)}`,
  );
});

// ── The in-field contract, now with a real event ──────────────────────────

test('⌘Z inside a text field is left to the browser', async () => {
  openWindow('win-field');
  const api: Partial<FormApi> = {};
  const r = render(<UndoProvider windowId="win-field"><Field api={api} /></UndoProvider>);
  type(api, 'typed');
  await flush();

  const input = document.createElement('input');
  document.body.appendChild(input);
  const event = pressKey('z', { meta: true, target: input });
  await flush();

  assert.equal(valueOf(r), 'typed', 'the form-level stack stayed put');
  assert.equal(event.defaultPrevented, false, 'and the key was not swallowed');
  input.remove();

  r.unmount();
  closeAllWindows();
});

test('⌘Z with nothing to undo is left for whatever else wants it', async () => {
  openWindow('win-empty');
  const api: Partial<FormApi> = {};
  const r = render(<UndoProvider windowId="win-empty"><Field api={api} /></UndoProvider>);
  await flush();

  const event = pressKey('z', { meta: true });
  await flush();
  assert.equal(event.defaultPrevented, false, 'no step to take, so no preventDefault');

  r.unmount();
  closeAllWindows();
});

test('a read-only form neither records nor answers the hotkey', async () => {
  openWindow('win-readonly');
  const api: Partial<FormApi> = {};
  const r = render(<UndoProvider windowId="win-readonly" canEdit={false}><Field api={api} /></UndoProvider>);

  type(api, 'somehow edited');
  await flush();
  const event = pressKey('z', { meta: true });
  await flush();
  assert.equal(valueOf(r), 'somehow edited', 'nothing was recorded to step back to');
  assert.equal(event.defaultPrevented, false);

  r.unmount();
  closeAllWindows();
});

test('the barrel exports the window-scoping hook', () => {
  const barrel = readFileSync(`${process.env.REPO_ROOT}/src/index.ts`, 'utf8');
  assert.match(barrel, /useIsActiveWindow/, 'src/index.ts must export useIsActiveWindow');
});
