import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import MetricBar from '../src/shell/MetricBar';

/** The bar's own fill element — the thing that must NOT exist for a null value. */
const FILL = /class="absolute inset-y-0 left-0 rounded-full ([^"]+)" style="width:([^"]+)"/;

test('a null value renders as unknown — never a zero-width bar', () => {
  const html = renderToStaticMarkup(<MetricBar label="Disk" value={null} warn={80} crit={90} />);
  assert.doesNotMatch(html, FILL, 'no fill element at all');
  assert.match(html, /border border-dashed border-gray-300/, 'dashed empty track');
  assert.match(html, /—/, 'em dash for the value');
  assert.match(html, />no data</);
  // An indeterminate meter: announcing 0 would be announcing a healthy idle box.
  assert.doesNotMatch(html, /aria-valuenow/);
  assert.match(html, /aria-valuetext="no data"/);
  // Nothing to tick against nothing.
  assert.doesNotMatch(html, /title="warning ≥ 80"/);
});

test('undefined and NaN are the same fact as null', () => {
  for (const value of [undefined, NaN, Infinity]) {
    const html = renderToStaticMarkup(<MetricBar label="Disk" value={value} warn={80} crit={90} />);
    assert.doesNotMatch(html, FILL, `${String(value)} must not draw a fill`);
    assert.match(html, /—/);
  }
});

test('severity comes from the supplied bounds, inclusively', () => {
  const at = (value: number) => {
    const m = renderToStaticMarkup(<MetricBar label="CPU" value={value} warn={80} crit={90} />).match(FILL);
    assert.ok(m, `expected a fill at ${value}`);
    return m[1];
  };
  assert.equal(at(79.9), 'bg-green-500');
  assert.equal(at(80), 'bg-amber-500', 'warn is >=, not >');
  assert.equal(at(89.9), 'bg-amber-500');
  assert.equal(at(90), 'bg-red-500', 'crit is >=, not >');
});

test('a value with no thresholds keeps its magnitude and loses its verdict', () => {
  const html = renderToStaticMarkup(<MetricBar label="Disk" value={94.2} detail="94.2 / 100 GiB" />);
  const fill = html.match(FILL);
  assert.ok(fill);
  // Grey, not green: green is a claim ("under warn") nothing here can make.
  assert.equal(fill[1], 'bg-gray-400');
  assert.equal(fill[2], '94.2%');
  assert.doesNotMatch(html, /title="warning/, 'no ticks without bounds');
  assert.match(html, />94\.2%</);
  assert.match(html, />94\.2 \/ 100 GiB</);
});

test('ticks sit where the caller says, and only where the caller says', () => {
  const both = renderToStaticMarkup(<MetricBar label="Memory" value={50} warn={80} crit={90} />);
  assert.match(both, /title="warning ≥ 80"[^>]*style="left:80%"/);
  assert.match(both, /title="critical ≥ 90"[^>]*style="left:90%"/);

  const critOnly = renderToStaticMarkup(<MetricBar label="Memory" value={50} crit={90} />);
  assert.doesNotMatch(critOnly, /title="warning/);
  assert.match(critOnly, /title="critical ≥ 90"/);

  // Ticks are positioned on the caller's scale, not assumed to be percentages.
  const scaled = renderToStaticMarkup(<MetricBar label="Queue" value={4} max={20} warn={10} />);
  assert.match(scaled, /title="warning ≥ 10"[^>]*style="left:50%"/);
});

test('the bar clamps, the printed number does not', () => {
  const html = renderToStaticMarkup(<MetricBar label="CPU" value={103.4} warn={80} crit={90} />);
  const fill = html.match(FILL);
  assert.ok(fill);
  assert.equal(fill[2], '100%');
  assert.match(html, />103\.4%</, 'the reading is reported as measured');
});

test('an explicit severity overrides the bounds', () => {
  const html = renderToStaticMarkup(<MetricBar label="CPU" value={5} warn={80} crit={90} severity="danger" />);
  const fill = html.match(FILL);
  assert.ok(fill);
  assert.equal(fill[1], 'bg-red-500');
  assert.match(html, /text-red-600/, 'the value ink follows the same tone');
  assert.match(html, /title="warning ≥ 80"/, 'the ticks still describe the bounds');
});

test('value formatting: percent on the default scale, raw number otherwise', () => {
  assert.match(renderToStaticMarkup(<MetricBar value={42} />), />42\.0%</);
  assert.match(renderToStaticMarkup(<MetricBar value={4} max={20} />), />4</);
  assert.match(
    renderToStaticMarkup(<MetricBar value={4} max={20} formatValue={(v) => `${v} of 20 slots`} />),
    />4 of 20 slots</,
  );
});

test('the meter is announced with its label and its reading', () => {
  const html = renderToStaticMarkup(<MetricBar label="Disk" value={94.2} warn={80} crit={90} />);
  assert.match(html, /role="meter"/);
  assert.match(html, /aria-label="Disk"/);
  assert.match(html, /aria-valuemin="0"/);
  assert.match(html, /aria-valuemax="100"/);
  assert.match(html, /aria-valuenow="94.2"/);
  assert.match(html, /aria-valuetext="94.2%"/);
});

test('size md renders the stat form, still with the null contract', () => {
  const filled = renderToStaticMarkup(<MetricBar label="Disk" value={94.2} warn={80} crit={90} size="md" />);
  assert.match(filled, /text-2xl font-semibold/);
  assert.match(filled, /h-2 rounded-full bg-gray-200/);

  const empty = renderToStaticMarkup(<MetricBar label="Disk" value={null} size="md" />);
  assert.doesNotMatch(empty, FILL);
  assert.match(empty, />no data</);
});
