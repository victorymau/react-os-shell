/**
 * Loaded via `node --import` before every spec bundle — see test.mjs.
 *
 * esbuild hoists EXTERNAL imports (react, react-dom, jsdom) above the bundled
 * modules, so a component that statically imports `react-dom` (createPortal in
 * Modal, SearchableSelect, TagInput) evaluates it before `tests/dom.ts` gets
 * to define the DOM globals — position in the spec file cannot fix that, the
 * hoist is by module kind, not by line. react-dom sniffs its environment ONCE,
 * at module scope: with no `document` it concludes `input` events are
 * unsupported and routes every text-input event through its IE8 polyfill,
 * where onChange never fires and a keydown on a text input throws
 * (`getInstIfValueChanged(null)`). Specs in such files could click and press
 * keys on divs, but never type.
 *
 * This preload puts a real DOM in place before ANY module evaluates, so the
 * sniff sees the truth. `tests/dom.ts` still installs its own JSDOM over these
 * globals for the specs to use — only module-scope capability flags are
 * decided against this one.
 *
 * `--import` needs Node ≥ 20.6 (engines says ≥ 20). CI runs 22 and 24, and
 * 20.6 has been out since 2023 — anyone on an older 20.x gets a clear
 * "bad option" from Node rather than a mystery.
 */
import { JSDOM } from 'jsdom';

const { window: win } = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

for (const [name, value] of Object.entries({
  window: win,
  document: win.document,
  navigator: win.navigator,
  location: win.location,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}
