import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIDEBAR_STRIP_W, boxFillsWorkArea, computeMaximizedBox, type Box } from '../src/shell/workArea';

/**
 * `boxFillsWorkArea` decides which saved window boxes Layout Mode → Classic is
 * allowed to forget. Its risk is over-reach: forgetting a box the user placed
 * by hand silently loses their layout. These specs pin both directions.
 *
 * Viewport 1440×900 with a 48px bottom taskbar ⇒ a classic work area of
 * 1440×852, and a sidebar one of 1160×852.
 */
const WORK_AREA: Box = { x: 0, y: 0, w: 1440, h: 852 };
const SIDEBAR_WORK_AREA: Box = { x: SIDEBAR_STRIP_W, y: 0, w: 1440 - SIDEBAR_STRIP_W, h: 852 };

test('a box filling the work area is a maximized box', () => {
  assert.equal(boxFillsWorkArea({ x: 0, y: 0, w: 1440, h: 852 }, WORK_AREA, false), true);
});

test('a sidebar-era box is recognised from either side of the strip being released', () => {
  // The Classic click runs before Layout drops `--sidebar-width` back to 0, but
  // it must also work after — neither ordering may leave the box behind.
  const savedInSidebar: Box = { x: SIDEBAR_STRIP_W, y: 0, w: 1160, h: 852 };
  assert.equal(boxFillsWorkArea(savedInSidebar, SIDEBAR_WORK_AREA, true), true, 'strip still reserved');
  assert.equal(boxFillsWorkArea(savedInSidebar, WORK_AREA, false), true, 'strip already given up');
  // …and the mirror: a classic-era maximized box seen while the strip is up.
  assert.equal(boxFillsWorkArea({ x: 0, y: 0, w: 1440, h: 852 }, SIDEBAR_WORK_AREA, true), true);
});

test('a hand-placed window is never a maximized box', () => {
  // The dangerous near-misses each fill the work area on exactly ONE axis.
  const kept: Record<string, Box> = {
    'snapped right half': { x: 720, y: 0, w: 720, h: 852 },
    'snapped left half': { x: 0, y: 0, w: 720, h: 852 },
    'full width, short': { x: 0, y: 100, w: 1440, h: 400 },
    'ordinary cascaded': { x: 210, y: 90, w: 1024, h: 700 },
    'one pixel short on height': { x: 0, y: 0, w: 1440, h: 840 },
    'one pixel short on width': { x: 0, y: 0, w: 1420, h: 852 },
  };
  for (const [why, box] of Object.entries(kept)) {
    assert.equal(boxFillsWorkArea(box, WORK_AREA, false), false, why);
    assert.equal(boxFillsWorkArea(box, SIDEBAR_WORK_AREA, true), false, `${why} (sidebar)`);
  }
});

test('sub-pixel rounding still counts as filling', () => {
  // Real boxes come from getBoundingClientRect and browser zoom, so an exact
  // integer match would miss the very windows this is meant to repair.
  assert.equal(boxFillsWorkArea({ x: 0, y: 0, w: 1437.5, h: 850.25 }, WORK_AREA, false), true);
});

test('computeMaximizedBox subtracts the taskbar and the sidebar strip', () => {
  const vars: Record<string, string> = {
    '--taskbar-height': '48px',
    '--taskbar-width': '0px',
    '--taskbar-position': 'bottom',
    '--sidebar-width': '0px',
  };
  const g = globalThis as Record<string, unknown>;
  g.document = { documentElement: {} };
  g.getComputedStyle = () => ({ getPropertyValue: (k: string) => vars[k] ?? '' });
  g.window = { innerWidth: 1440, innerHeight: 900 };

  assert.deepEqual(computeMaximizedBox(), WORK_AREA, 'classic: bottom taskbar only');

  vars['--sidebar-width'] = `${SIDEBAR_STRIP_W}px`;
  assert.deepEqual(computeMaximizedBox(), SIDEBAR_WORK_AREA, 'sidebar: strip reserved on the left');

  // A vertical taskbar takes width, not height, and shifts x when on the left.
  vars['--sidebar-width'] = '0px';
  vars['--taskbar-position'] = 'left';
  vars['--taskbar-width'] = '48px';
  vars['--taskbar-height'] = '0px';
  assert.deepEqual(computeMaximizedBox(), { x: 48, y: 0, w: 1392, h: 900 });
});
