import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ContainerFillChart from '../src/shell/ContainerFillChart';

interface Line {
  pn: string;
  quantity: number;
  actual_qty?: number | null;
  /** Catalogue volume — one CARTON's for the accessory, one piece's for the wheel. */
  vol: number;
  cartons?: number;
}

// A wheel ships one to a carton, so pieces × volume is right for it. The hub
// rings ship 500 to a carton, and their catalogue volume (0.07 m³) is the
// carton's: 2,000 pieces are four cartons, 0.28 m³ — not 140 m³.
const WHEELS: Line = { pn: 'WHEEL', quantity: 100, actual_qty: 100, vol: 0.09, cartons: 100 };
const HUB_RINGS: Line = { pn: 'HUB-RING', quantity: 0, actual_qty: 2000, vol: 0.07, cartons: 4 };

/** Static markup with React's text-node separators removed, so "9.00 m³" reads as one string. */
const render = (el: ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, '');

test('without line-volume accessors a line is still pieces × unit volume', () => {
  const html = render(<ContainerFillChart<Line> items={[WHEELS, HUB_RINGS]} getVolume={(l) => l.vol} />);
  // 100 × 0.09 = 9; loaded adds 2000 × 0.07 = 140 → 149 m³, three 40ft slots.
  assert.match(html, /9\.00 m³ instruction/);
  assert.match(html, /149\.00 m³ loaded/);
  assert.match(html, /3 × 40ft/);
});

test('getActualVolume replaces the loaded side; the header keeps counting pieces', () => {
  const html = render(
    <ContainerFillChart<Line>
      items={[WHEELS, HUB_RINGS]}
      getVolume={(l) => l.vol}
      getActualVolume={(l) => l.vol * (l.cartons ?? 0)}
    />,
  );
  assert.match(html, /9\.00 m³ instruction/, 'instruction side untouched');
  assert.match(html, /9\.28 m³ loaded/, '100 × 0.09 + 4 cartons × 0.07');
  assert.match(html, /1 × 20ft/);
  assert.match(html, /\(100 instr \/ 2100 loaded\)/, 'piece counts are not carton counts');
});

test('getInstructionVolume replaces the instruction side, including in single-bar mode', () => {
  const planned: Line = { pn: 'HUB-RING', quantity: 2000, vol: 0.07 };
  const html = render(
    <ContainerFillChart<Line>
      items={[planned]}
      getInstructionVolume={(l) => l.vol * Math.ceil(l.quantity / 500)}
    />,
  );
  assert.match(html, /<b[^>]*>0\.28 m³<\/b>/);
  assert.match(html, /2000 pcs/);
});

test('with both line accessors getVolume is not needed', () => {
  const html = render(
    <ContainerFillChart<Line>
      items={[WHEELS, HUB_RINGS]}
      getInstructionVolume={(l) => l.vol * l.quantity}
      getActualVolume={(l) => l.vol * (l.cartons ?? 0)}
    />,
  );
  assert.match(html, /9\.00 m³ instruction/);
  assert.match(html, /9\.28 m³ loaded/);
});

test('whether the loaded layer is drawn still follows the actual quantities', () => {
  // A consumer returning a loaded volume for a line nobody has loaded must not
  // conjure a second bar: the dual mode is keyed on actual_qty, not volume.
  const unloaded: Line = { pn: 'WHEEL', quantity: 10, actual_qty: null, vol: 0.09 };
  const html = render(
    <ContainerFillChart<Line> items={[unloaded]} getVolume={(l) => l.vol} getActualVolume={() => 5} />,
  );
  assert.doesNotMatch(html, /m³ loaded/);
  assert.match(html, /<b[^>]*>0\.90 m³<\/b>/);
});
