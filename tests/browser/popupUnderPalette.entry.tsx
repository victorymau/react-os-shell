import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import SearchableSelect from '../../src/shell/SearchableSelect';
import GlobalSearch from '../../src/shell/GlobalSearch';
import { Z_LAYERS } from '../../src/shell/zLayers';

/**
 * The mould edit window, reduced to what the bug needs: a form field in a
 * window on the window stack, an always-on-top window beside it, and the ⌘K
 * palette. Real styles are served with the page, so the layers really stack.
 */

const DESIGNS = Array.from({ length: 8 }, (_, i) => ({ value: `d${i}`, label: `Design ${i + 1}` }));

function MouldWindow() {
  const [design, setDesign] = useState('');
  return (
    <div
      data-testid="mould-window"
      // A window a few places up the stack: `Modal` gives window N
      // `window + N * windowStep + 1`.
      style={{ position: 'fixed', left: 24, top: 360, width: 320, zIndex: Z_LAYERS.window + 2 * Z_LAYERS.windowStep + 1 }}
      className="rounded-lg border border-gray-200 bg-white p-4"
    >
      <label htmlFor="design" className="block text-sm text-gray-700">Design</label>
      <SearchableSelect id="design" value={design} onChange={setDesign} options={DESIGNS} />
    </div>
  );
}

function PinnedWindow() {
  return (
    <div
      data-testid="pinned-window"
      style={{ position: 'fixed', right: 24, top: 360, width: 320, height: 200, zIndex: Z_LAYERS.pinnedWindow }}
      className="rounded-lg border border-gray-200 bg-white p-4 text-sm"
    >
      Always on top
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <>
    <MouldWindow />
    <PinnedWindow />
    <GlobalSearch providers={[]} />
  </>,
);
