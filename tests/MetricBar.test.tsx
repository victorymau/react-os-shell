import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import MetricBar from '../src/shell/MetricBar';
import { withConsoleError } from './capture-console';

/** The bar's own fill element — the thing that must NOT exist for a null value. */
const FILL = /class="absolute inset-y-0 left-0 rounded-full ([^"]+)" style="width:([^"]+)"/;

test('a null value renders as unknown — never a zero-width bar', () => {
  const html = renderToStaticMarkup(<MetricBar label="Disk" value={null} warn={80} crit={90} />);
  assert.doesNotMatch(html, FILL, 'no fill element at all');
  assert.match(html, /border border-dashed border-gray-300/, 'dashed empty track');
  assert.match(html, /—/, 'em dash for the value');
  assert.match(html, />no data</);
  // Not a meter, because there is nothing to meter. `role="meter"` REQUIRES
  // aria-valuenow (it has no indeterminate state, unlike progressbar), so a
  // roleless decorative track is the only valid empty rendering — and
  // aria-valuenow={0} would have announced a healthy idle box. The row already
  // says "Disk — no data" in text.
  assert.doesNotMatch(html, /role="meter"/);
  assert.doesNotMatch(html, /aria-valuenow/);
  assert.doesNotMatch(html, /aria-valuemax/);
  assert.match(html, /aria-hidden="true"/, 'the empty track is decorative');
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

test('role=meter never appears without aria-valuenow — it is a required attribute', () => {
  // axe-core `aria-required-attr`, serious. `meter` has no indeterminate state,
  // so an omitted valuenow is not "unknown", it is a malformed widget. Every
  // render state, not just the happy one.
  const cases = [
    <MetricBar label="A" value={94.2} warn={80} crit={90} />,
    <MetricBar label="B" value={null} warn={80} crit={90} />,
    <MetricBar label="C" value={NaN} />,
    <MetricBar label="D" value={5} max={0} />,
    <MetricBar label="E" value={5} max={NaN} />,
    <MetricBar label="F" value={5} max={-10} />,
    <MetricBar label="G" value={42} />,
    <MetricBar label="H" value={null} size="md" />,
  ];
  for (const element of cases) {
    // Some of these deliberately carry a bad `max`; the console line is
    // asserted in its own test, so keep it out of this one's output.
    const html = withConsoleError(() => renderToStaticMarkup(element)).result;
    if (html.includes('role="meter"')) {
      assert.match(html, /aria-valuenow="/, `role=meter without aria-valuenow in: ${html}`);
      assert.match(html, /aria-valuemin="/, `role=meter without aria-valuemin in: ${html}`);
      assert.match(html, /aria-valuemax="/, `role=meter without aria-valuemax in: ${html}`);
    } else {
      // No role means no half-declared widget left behind either.
      assert.doesNotMatch(html, /aria-value/, `stray aria-value* without a role in: ${html}`);
    }
  }
});

test('aria-valuenow stays inside the range the element declares', () => {
  // The bar clamps and the printed number does not, so valuenow must clamp too:
  // a valuenow past its own valuemax is an invalid widget. aria-valuetext still
  // carries the unclamped truth, and wins the announcement.
  const html = renderToStaticMarkup(<MetricBar label="CPU" value={103.4} warn={80} crit={90} />);
  assert.match(html, /aria-valuemax="100"/);
  assert.match(html, /aria-valuenow="100"/);
  assert.match(html, /aria-valuetext="103.4%"/, 'the true reading survives in valuetext');
  assert.match(html, />103\.4%</, 'and on screen');
});

test('max must be a positive finite number — no bar is invented from a bad divisor', () => {
  // The regression: `max` is the divisor and was never validated, so max={0}
  // divided to Infinity, clamped to 100 % and painted a full GREEN bar. The
  // realistic path is `max={total ?? 0}` where the probe never learned total.
  for (const max of [0, -10, NaN, Infinity]) {
    const html = withConsoleError(() =>
      renderToStaticMarkup(<MetricBar label="Disk" value={5} max={max} warn={80} crit={90} />),
    ).result;
    assert.doesNotMatch(html, FILL, `max=${max} must not draw a fill at all`);
    assert.doesNotMatch(html, /width:100%/, `max=${max} must never claim a full bar`);
    assert.doesNotMatch(html, /NaN/, `max=${max} must not leak NaN into the DOM`);
    assert.doesNotMatch(html, /title="warning ≥/, `max=${max} has no scale to place ticks on`);
    assert.match(html, /border border-dashed border-gray-300/, `max=${max} draws the dashed track`);
    // The VALUE is still a real fact — only the proportion is unknowable.
    assert.match(html, />5</, `max=${max} still prints the reading`);
  }
});

test('a bad max is reported loudly, once', () => {
  // -42 is used by no other test in this file: the reporter deduplicates for
  // the lifetime of the module, so the assertion needs a token of its own.
  const { errors } = withConsoleError(() => renderToStaticMarkup(<MetricBar label="Disk" value={5} max={-42} />));
  assert.equal(errors.length, 1, 'exactly one console line');
  assert.match(errors[0], /MetricBar: max=-42 is not a positive finite number/);
  assert.match(errors[0], /do not pass 0/, 'and says what to do instead');
  // Deduplicated: a card of rows on one bad prop is one line, not one per row.
  const { errors: again } = withConsoleError(() =>
    renderToStaticMarkup(
      <>
        <MetricBar label="A" value={5} max={-42} />
        <MetricBar label="B" value={6} max={-42} />
      </>,
    ),
  );
  assert.equal(again.length, 0, 'already reported');
});

test('an unrecognised severity paints a visible marker, never undefined classes', () => {
  // SEVERITY_FILL[severity] on an unknown key is `undefined`, which interpolates
  // into a className as the literal string "undefined" — a colourless bar.
  const { result: html, errors } = withConsoleError(() =>
    renderToStaticMarkup(<MetricBar label="Disk" value={94.2} severity={'critical' as never} />),
  );
  const fill = html.match(FILL);
  assert.ok(fill, 'a fill still renders');
  assert.doesNotMatch(html, /undefined/, 'no "undefined" reaches the DOM');
  assert.notEqual(fill[1].trim(), '', 'the fill has actual classes');
  assert.match(fill[1], /border-red-500/, 'and reads as broken, not as a tone');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /MetricBar: severity "critical" is not one of success \| warning \| danger/);
});

test('size md renders the stat form, still with the null contract', () => {
  const filled = renderToStaticMarkup(<MetricBar label="Disk" value={94.2} warn={80} crit={90} size="md" />);
  assert.match(filled, /text-2xl font-semibold/);
  assert.match(filled, /h-2 rounded-full bg-gray-200/);

  const empty = renderToStaticMarkup(<MetricBar label="Disk" value={null} size="md" />);
  assert.doesNotMatch(empty, FILL);
  assert.match(empty, />no data</);
});
