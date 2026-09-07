/**
 * The two things that had to become true for the PDF reader to work outside
 * the Preview window.
 *
 * Both consumers that wanted a PDF beside a form had reached for
 * `<iframe src={blobUrl}>` — the browser's own plugin, with its thumbnail rail
 * and its own zoom — because this package shipped no embeddable viewer, only
 * the whole Preview app. Extracting `PdfViewer` fixes that only if it brings a
 * toolbar with it and fits the page it is given.
 */
import { render } from './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PanelActions, ToolbarSlotContext } from '../src/apps/_panelActions';
import { fitScale } from '../src/apps/PdfViewer';

// A4 portrait at scale 1, in pdf.js viewport units.
const A4 = { width: 595, height: 842 };

test('with no toolbar slot, a panel renders its buttons in place', () => {
  const { container, unmount } = render(<PanelActions><button>Fit</button></PanelActions>);
  // The old fallback was `null`. That was invisible while every panel lived in
  // a window, and became "the embedded viewer has no page nav and no zoom" the
  // moment one did not.
  assert.match(container.textContent ?? '', /Fit/, 'an embedded panel must render its own toolbar');
  unmount();
});

test('with a slot, the buttons portal into it and the panel adds no second row', () => {
  const slot = document.createElement('div');
  document.body.append(slot);
  const { container, unmount } = render(
    <ToolbarSlotContext.Provider value={slot}>
      <PanelActions><button>Fit</button></PanelActions>
    </ToolbarSlotContext.Provider>,
  );
  assert.match(slot.textContent ?? '', /Fit/, 'the Preview window toolbar owns the buttons');
  assert.equal(container.querySelector('button'), null, 'and the panel must not also render them');
  unmount();
  slot.remove();
});

test("fit 'width' fills the width and lets a tall page scroll", () => {
  // 1040 wide, 520 tall: the shape of a preview pane beside a form.
  const scale = fitScale('width', { width: 1040, height: 520 }, A4);
  assert.equal(Math.round(A4.width * scale), 1000, 'the page should fill the width, less the gutter');
  assert.ok(A4.height * scale > 520, 'and a portrait page is expected to overflow — that is what scrolls');
});

test("fit 'page' takes whichever axis binds first, so nothing is cropped", () => {
  const scale = fitScale('page', { width: 1040, height: 520 }, A4);
  assert.ok(A4.height * scale <= 520, 'the whole page must fit the pane vertically');
  assert.ok(A4.width * scale <= 1040, 'and horizontally');
  // The specific regression: width-fitting a portrait page in a landscape pane
  // shows the top half and hides the totals — the line the sender is checking.
  assert.ok(scale < fitScale('width', { width: 1040, height: 520 }, A4));
});

test("fit 'page' still fits the width when height is not the binding axis", () => {
  const tall = { width: 800, height: 2000 };
  assert.equal(fitScale('page', tall, A4), fitScale('width', tall, A4));
});

test('the scale is clamped, so a degenerate container cannot produce a zero-size canvas', () => {
  // A pane measured before layout reports 0. Unclamped that is a negative
  // scale, and pdf.js renders a canvas of negative width.
  assert.equal(fitScale('page', { width: 0, height: 0 }, A4), 0.3);
  assert.equal(fitScale('width', { width: 99_999, height: 99_999 }, A4), 4);
});
