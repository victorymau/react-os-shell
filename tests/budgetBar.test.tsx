import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import BudgetBar, { budgetState } from '../src/shell/BudgetBar';

/**
 * Three states a glance has to separate, and one that must draw nothing.
 *
 * These specs pin the PROPERTIES rather than the markup, because the markup is
 * not what the component promises. What it promises is:
 *
 *   1. within budget and past it are drawn differently, and "past it" is not
 *      the shape of a finished bar;
 *   2. a run with no budget draws no bar at all — not a zero-width one, not an
 *      empty track, because there is no proportion to picture;
 *   3. `MetricBar`'s rule survives: no reading and a reading of zero are
 *      different facts and must not render alike.
 */

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
/** The track — present only when there is a proportion to draw. */
const TRACK = /<div role="meter"/;
/** The solid, in-budget fill. */
const SOLID = /class="absolute inset-y-0 left-0 rounded-full bg-blue-600" style="width:([^"]+)"/;
/** The overrun band. A texture, not a longer fill. */
const HATCH = /class="rosh-budget-overrun absolute inset-y-0" style="left:([^;]+);width:([^"]+)"/;

test('within budget: one solid fill, no overrun', () => {
  const markup = html(<BudgetBar label="Run" elapsed={900} budget={3600} />);
  const solid = SOLID.exec(markup);
  assert.ok(solid, 'no fill');
  assert.equal(solid[1], '25%');
  assert.doesNotMatch(markup, HATCH, 'nothing has overrun');
  assert.match(markup, />25%</, 'the reading is budget consumed');
  assert.match(markup, />15m 0s \/ 1h 0m</);
});

test('past the deadline: hatched, and never the shape of a full solid bar', () => {
  // A solid bar at 100 % is the calm "finished" picture. An overrun is the
  // opposite fact, so it must not borrow that shape — it wears a texture no
  // in-budget state ever wears.
  const overrun = html(<BudgetBar label="Run" elapsed={4200} budget={3600} grace={900} />);
  assert.doesNotMatch(overrun, SOLID, 'the in-budget fill is gone');
  const hatch = HATCH.exec(overrun);
  assert.ok(hatch, 'no overrun band');
  assert.equal(hatch[1], '80%', 'it starts at the deadline');
  // 4200 of a 4500s window: filled past the deadline and still short of the end.
  const width = Number.parseFloat(hatch[2]);
  assert.ok(width > 0 && Number.parseFloat(hatch[1]) + width < 100, `the bar is full at ${hatch[1]}+${hatch[2]}`);
  assert.match(overrun, /title="budget"[^>]*style="left:80%"/, 'the deadline is marked');
  assert.match(overrun, />117%</, 'and the figure is still a share of the BUDGET');
});

test('the bar is only full when the reaper is actually due', () => {
  const atTheEnd = html(<BudgetBar elapsed={4500} budget={3600} grace={900} />);
  const hatch = HATCH.exec(atTheEnd);
  assert.ok(hatch);
  assert.equal(Number.parseFloat(hatch[1]) + Number.parseFloat(hatch[2]), 100);
});

test('an overrun with no grace claims no proportion for it', () => {
  // Same reasoning as MetricBar's non-positive `max`: with no divisor there is
  // no proportional claim to make. The band covers the track and marks nothing;
  // the magnitude is left to the printed figure, which is where it is honest.
  const markup = html(<BudgetBar label="Run" elapsed={7200} budget={3600} />);
  const hatch = HATCH.exec(markup);
  assert.ok(hatch);
  assert.equal(hatch[1], '0%');
  assert.equal(hatch[2], '100%');
  assert.doesNotMatch(markup, /title="budget"/, 'there is no room past the deadline to mark');
  assert.match(markup, />200%</);
});

test('no estimate at all draws no bar — not a zero one, not an empty track', () => {
  for (const budget of [undefined, null, 0, NaN, -60, Infinity]) {
    const markup = html(<BudgetBar label="Run" elapsed={900} budget={budget} />);
    assert.doesNotMatch(markup, TRACK, `budget=${String(budget)} drew a track`);
    assert.doesNotMatch(markup, SOLID, `budget=${String(budget)} drew a fill`);
    assert.doesNotMatch(markup, HATCH, `budget=${String(budget)} drew an overrun`);
    // The elapsed time IS known, so it still prints — as a duration, because a
    // percentage of an unknown budget is not a number anyone has.
    assert.match(markup, />15m 0s</, String(budget));
    assert.match(markup, />no budget</, String(budget));
  }
});

test('no reading and a reading of zero are different facts', () => {
  // MetricBar's contract, kept. A run that started a second ago is a measured
  // zero and gets a real meter; a run nobody has heard from gets an em dash and
  // no meter at all — announcing valuenow=0 would report the second as the
  // first.
  const zero = html(<BudgetBar label="Run" elapsed={0} budget={3600} />);
  const none = html(<BudgetBar label="Run" elapsed={null} budget={3600} />);
  assert.notEqual(zero, none);

  assert.match(zero, TRACK);
  assert.match(zero, /aria-valuenow="0"/);
  const solid = SOLID.exec(zero);
  assert.ok(solid, 'a measured zero still draws its (empty) fill');
  assert.equal(solid[1], '0%');
  assert.match(zero, />0%</);

  assert.doesNotMatch(none, TRACK, 'no reading, no meter');
  assert.doesNotMatch(none, /aria-valuenow/);
  assert.match(none, />—</);
  assert.match(none, />no reading</);
});

test('undefined, NaN, Infinity and a negative are all "no reading"', () => {
  for (const elapsed of [undefined, NaN, Infinity, -1]) {
    const markup = html(<BudgetBar label="Run" elapsed={elapsed} budget={3600} />);
    assert.doesNotMatch(markup, TRACK, String(elapsed));
    assert.match(markup, />—</, String(elapsed));
  }
});

test('the meter announces its share of the budget, clamped inside its own range', () => {
  const markup = html(<BudgetBar ariaLabel="Run 41c2" elapsed={4200} budget={3600} grace={900} />);
  assert.match(markup, /aria-valuemin="0"/);
  assert.match(markup, /aria-valuemax="4500"/);
  assert.match(markup, /aria-valuenow="4200"/);
  assert.match(markup, /aria-valuetext="117% of budget"/);

  // A valuenow past its own valuemax is an invalid widget; valuetext still
  // carries the unclamped truth and takes precedence in the announcement.
  const wild = html(<BudgetBar ariaLabel="Run" elapsed={99999} budget={3600} grace={900} />);
  assert.match(wild, /aria-valuenow="4500"/);
  assert.match(wild, /aria-valuetext="2778% of budget"/);
});

test('budgetState is the same verdict the bar draws by', () => {
  // Exported so a run LIST sorts and filters by the same rule the row draws by.
  // Two derivations of "late" is how two surfaces start disagreeing.
  assert.equal(budgetState(null, 3600), 'no-reading');
  assert.equal(budgetState(NaN, 3600), 'no-reading');
  assert.equal(budgetState(900, null), 'no-budget');
  assert.equal(budgetState(900, 0), 'no-budget');
  assert.equal(budgetState(900, 3600), 'within');
  assert.equal(budgetState(3600, 3600), 'within', 'exactly at the deadline is not yet over');
  assert.equal(budgetState(3601, 3600), 'over');
});

test('a caller can say how a duration reads', () => {
  const markup = html(
    <BudgetBar elapsed={95} budget={1800} formatDuration={(s) => `${s}s`} />,
  );
  assert.match(markup, />95s \/ 1800s</);
});
