import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, act } from './dom';
import Calendar, { toKey, fromKey } from '../src/forms/Calendar';

/**
 * The grid this replaces was 42 buttons in a `<div>`. These specs are mostly
 * about the three things that cost:
 *
 *  - reaching a day took one Tab per day, because there were no arrow keys;
 *  - each cell was named by its number alone, so a reader heard "15" with no
 *    month attached;
 *  - nothing said which day was chosen, or that this was a date grid at all.
 *
 * The date arithmetic specs are here for a different reason: every date bug in
 * this repo has been the same bug, a UTC parse or serialise crossing a day
 * boundary. They pin the local-only rule at the boundaries where it breaks.
 */

const AUGUST = '2026-08';
/** Uncontrolled by default: `defaultMonth` opens on August but lets the grid
 *  page itself, which is what the keyboard specs exercise. A spec that wants
 *  the controlled behaviour passes `month` explicitly. */
const setup = (props: Partial<Parameters<typeof Calendar>[0]> = {}) =>
  render(<Calendar defaultMonth={AUGUST} onSelect={() => {}} {...props} />);

const grid = (v: { container: HTMLElement }) => v.container.querySelector('[role="grid"]')!;
const cell = (v: { container: HTMLElement }, name: string) =>
  v.container.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)!;
const activeCell = (v: { container: HTMLElement }) =>
  v.container.querySelector<HTMLButtonElement>('[data-active="true"]')!;

function key(el: Element, k: string, shiftKey = false): boolean {
  const win = el.ownerDocument.defaultView as Window & typeof globalThis;
  const e = new win.KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true });
  act(() => { el.dispatchEvent(e); });
  return e.defaultPrevented;
}

test('it is a date grid, not a pile of buttons', () => {
  const view = setup();
  const g = grid(view);
  assert.equal(g.getAttribute('aria-label'), 'August 2026', 'the grid says which month it is');
  assert.equal(g.querySelectorAll('[role="row"]').length, 7, 'a header row and six weeks');
  assert.equal(g.querySelectorAll('[role="columnheader"]').length, 7);
  assert.equal(g.querySelectorAll('[role="gridcell"]').length, 42);
  view.unmount();
});

test('a day is named by its date, not by its number', () => {
  // "15" is what the old grid announced. Which month? The heading was a sibling
  // of the grid and associated with nothing.
  const view = setup();
  assert.ok(cell(view, '15 August 2026'), 'the full date is the accessible name');
  view.unmount();
});

test('the weekday headers are readable as words', () => {
  const view = setup();
  const first = grid(view).querySelector('[role="columnheader"]')!;
  assert.equal(first.getAttribute('aria-label'), 'Sunday');
  assert.equal(first.textContent, 'Su', 'and still short on screen');
  view.unmount();
});

test('a Monday start reorders the columns', () => {
  const view = setup({ weekStartsOn: 1 });
  const headers = [...grid(view).querySelectorAll('[role="columnheader"]')].map(h => h.getAttribute('aria-label'));
  assert.deepEqual(headers, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  view.unmount();
});

test('the grid is ONE tab stop, and the arrows move inside it', () => {
  // The whole point. Twenty presses of Tab to reach the 20th was the old cost.
  const view = setup({ value: '2026-08-10' });
  const tabbable = [...grid(view).querySelectorAll('button')].filter(b => b.tabIndex === 0);
  assert.equal(tabbable.length, 1, 'exactly one cell is in the tab order');
  assert.equal(activeCell(view).getAttribute('aria-label'), '10 August 2026');

  assert.equal(key(grid(view), 'ArrowRight'), true);
  assert.equal(activeCell(view).getAttribute('aria-label'), '11 August 2026');
  key(grid(view), 'ArrowDown');
  assert.equal(activeCell(view).getAttribute('aria-label'), '18 August 2026', 'down is a week');
  key(grid(view), 'ArrowUp');
  key(grid(view), 'ArrowLeft');
  assert.equal(activeCell(view).getAttribute('aria-label'), '10 August 2026');
  view.unmount();
});

test('Home and End are the week, not the month', () => {
  // What the ARIA date-grid pattern asks for: the rows are weeks, so the row
  // ends are what Home and End mean.
  const view = setup({ value: '2026-08-12' });  // a Wednesday
  key(grid(view), 'Home');
  assert.equal(activeCell(view).getAttribute('aria-label'), '9 August 2026', 'the Sunday of that week');
  key(grid(view), 'End');
  assert.equal(activeCell(view).getAttribute('aria-label'), '15 August 2026', 'the Saturday');
  view.unmount();
});

test('PageUp and PageDown page the month, Shift pages the year', () => {
  const view = setup({ value: '2026-08-15' });
  key(grid(view), 'PageDown');
  assert.equal(grid(view).getAttribute('aria-label'), 'September 2026');
  key(grid(view), 'PageUp');
  key(grid(view), 'PageUp');
  assert.equal(grid(view).getAttribute('aria-label'), 'July 2026');
  key(grid(view), 'PageDown', true);
  assert.equal(grid(view).getAttribute('aria-label'), 'July 2027', 'Shift is a year');
  view.unmount();
});

test('paging off the end of the month carries the grid with it', () => {
  // Arrowing right from the 31st has to land on the 1st of September AND show
  // September, or the cursor is on a cell nobody can see.
  const view = setup({ value: '2026-08-31' });
  key(grid(view), 'ArrowRight');
  assert.equal(grid(view).getAttribute('aria-label'), 'September 2026');
  assert.equal(activeCell(view).getAttribute('aria-label'), '1 September 2026');
  view.unmount();
});

test('stepping a month from the 31st does not skip one', () => {
  // The naive setMonth bug: 31 August minus a month is 31 July fine, but 31
  // October minus one is 31 September, which is 1 October — the month never
  // changes and PageUp appears dead.
  const view = setup({ defaultMonth: '2026-10', value: '2026-10-31' });
  key(grid(view), 'PageUp');
  assert.equal(grid(view).getAttribute('aria-label'), 'September 2026');
  assert.equal(activeCell(view).getAttribute('aria-label'), '30 September 2026', 'clamped to the last day');
  view.unmount();
});

test('Enter and Space choose the day the cursor is on', () => {
  const chosen: string[] = [];
  const view = setup({ value: '2026-08-10', onSelect: d => chosen.push(d) });
  key(grid(view), 'ArrowRight');
  assert.equal(key(grid(view), 'Enter'), true);
  key(grid(view), ' ');
  assert.deepEqual(chosen, ['2026-08-11', '2026-08-11']);
  view.unmount();
});

test('the selection is announced, and today is marked', () => {
  const todayKey = toKey(new Date());
  const view = setup({ defaultMonth: todayKey.slice(0, 7), value: todayKey });
  const chosenCell = activeCell(view);
  assert.equal(chosenCell.closest('[role="gridcell"]')?.getAttribute('aria-selected'), 'true');
  assert.equal(chosenCell.getAttribute('aria-current'), 'date');
  view.unmount();
});

test('a day outside min/max cannot be chosen, by mouse or by key', () => {
  const chosen: string[] = [];
  const view = setup({ value: '2026-08-10', min: '2026-08-05', max: '2026-08-20', onSelect: d => chosen.push(d) });

  assert.equal(cell(view, '3 August 2026').disabled, true);
  assert.equal(cell(view, '25 August 2026').disabled, true);
  assert.equal(cell(view, '12 August 2026').disabled, false);

  // The cursor may still travel over a blocked day — a user scanning the month
  // should not hit a wall — but committing there does nothing.
  for (let i = 0; i < 6; i += 1) key(grid(view), 'ArrowLeft');
  assert.equal(activeCell(view).getAttribute('aria-label'), '4 August 2026');
  key(grid(view), 'Enter');
  assert.deepEqual(chosen, [], 'nothing was selected outside the range');
  view.unmount();
});

test('range mode fills the days between the two ends', () => {
  const view = setup({ mode: 'range', value: '2026-08-10', endValue: '2026-08-14' });
  const between = cell(view, '12 August 2026');
  assert.match(between.className, /bg-blue-100/, 'a day inside the range is filled');
  assert.equal(cell(view, '10 August 2026').closest('[role="gridcell"]')?.getAttribute('aria-selected'), 'true');
  assert.equal(cell(view, '14 August 2026').closest('[role="gridcell"]')?.getAttribute('aria-selected'), 'true');
  assert.equal(cell(view, '16 August 2026').closest('[role="gridcell"]')?.getAttribute('aria-selected'), 'false');
  view.unmount();
});

test('an unrelated key is left for the app', () => {
  const view = setup();
  assert.equal(key(grid(view), 'k'), false);
  view.unmount();
});

test('the month heading is a live region', () => {
  // PageDown changes the month without focus leaving the grid, so without this
  // the change is silent to a screen reader.
  const view = setup();
  const heading = [...view.container.querySelectorAll('[aria-live]')];
  assert.equal(heading.length, 1);
  // The month and year are separate buttons now — quick-jump hangs off them —
  // so the region reads as two words rather than one string.
  assert.match(heading[0].textContent ?? '', /August/);
  assert.match(heading[0].textContent ?? '', /2026/);
  view.unmount();
});

test('a controlled month reports its changes rather than moving itself', () => {
  const seen: string[] = [];
  const view = render(<Calendar month="2026-08" onMonthChange={m => seen.push(m)} onSelect={() => {}} />);
  view.container.querySelector<HTMLButtonElement>('[aria-label="Next month"]')!.click();
  assert.deepEqual(seen, ['2026-09']);
  assert.equal(grid(view).getAttribute('aria-label'), 'August 2026', 'the caller owns the month');
  view.unmount();
});

// ── the date arithmetic, at the boundaries where it has broken before ──

test('toKey reads local calendar fields, not UTC ones', () => {
  // 1 January at 00:30 local is 31 December in UTC for anywhere east of
  // Greenwich, and toISOString would report the wrong year.
  assert.equal(toKey(new Date(2026, 0, 1, 0, 30)), '2026-01-01');
  assert.equal(toKey(new Date(2026, 11, 31, 23, 30)), '2026-12-31');
  assert.equal(toKey(new Date(2026, 7, 5)), '2026-08-05', 'and it zero-pads');
});

test('fromKey builds a local date, and refuses anything else', () => {
  const d = fromKey('2026-08-11')!;
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 7);
  assert.equal(d.getDate(), 11, 'the 11th, not the 10th');
  assert.equal(fromKey(null), null);
  assert.equal(fromKey('11/08/2026'), null);
  assert.equal(fromKey(''), null);
});

test('toKey and fromKey round-trip', () => {
  for (const k of ['2026-01-01', '2026-02-28', '2024-02-29', '2026-12-31']) {
    assert.equal(toKey(fromKey(k)!), k, k);
  }
});


test('with no selection it opens where the bounds allow, not on today', () => {
  // Today with a max in the past opens a grid where every day is disabled and
  // nothing says which way to page out of it.
  const view = render(<Calendar onSelect={() => {}} min="2020-03-01" max="2020-03-31" />);
  assert.equal(view.container.querySelector('[role="grid"]')!.getAttribute('aria-label'), 'March 2020');
  view.unmount();
});

test('a selection still wins over the bounds', () => {
  const view = render(<Calendar onSelect={() => {}} value="2020-05-04" min="2020-03-01" />);
  assert.equal(view.container.querySelector('[role="grid"]')!.getAttribute('aria-label'), 'May 2020');
  view.unmount();
});


test('a day is a touch target on a phone, and compact above it', () => {
  // Seven cells side by side is exactly the case where four pixels short picks
  // the wrong day rather than nothing at all.
  const view = setup();
  const cellClass = cell(view, '15 August 2026').className;
  assert.match(cellClass, /min-h-11/, '44px below the sm breakpoint');
  assert.match(cellClass, /sm:min-h-0/, 'and out of the way above it');
  view.unmount();
});
