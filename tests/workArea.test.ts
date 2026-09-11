import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIDEBAR_STRIP_W, boxFillsWorkArea, computeMaximizedBox, growBoxToWidth, widthToFit, type Box } from '../src/shell/workArea';

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

/**
 * Fit-to-width: a window opening onto content that scrolls sideways grows
 * until it doesn't. The risk is growing for nothing — a window that opens
 * wider and STILL scrolls — so the rule only credits scrollers that gave the
 * probe's width back.
 */
test('widthToFit grows only for scrollers that give the width back', () => {
  // A 672px window whose table overflows by 400: probed 400px wider, the table
  // stops overflowing, so the window needs 1072.
  assert.equal(widthToFit(672, 400, [{ over: 400, residual: 0 }]), 1072);
  // A fixed-width strip still overflows by the same amount — no growth.
  assert.equal(widthToFit(672, 400, [{ over: 400, residual: 400 }]), 672);
  // Content sized from its container is always 20px wider — no growth.
  assert.equal(widthToFit(672, 20, [{ over: 20, residual: 20 }]), 672);
  // Boxed in by a max-width: it gains 100 of the 400 and stops. Growing would
  // leave a wider window that still scrolls.
  assert.equal(widthToFit(672, 400, [{ over: 400, residual: 300 }]), 672);
  // A probe capped by the screen: it took all 200 it was given, so it is fluid
  // and asks for the full 400 — the caller caps it.
  assert.equal(widthToFit(672, 200, [{ over: 400, residual: 200 }]), 1072);
  // Mixed: the fluid scroller decides, the rigid one is ignored.
  assert.equal(widthToFit(672, 300, [{ over: 300, residual: 300 }, { over: 120, residual: 0 }]), 792);
});

test('growBoxToWidth grows about the centre and stays inside the work area', () => {
  const area: Box = { x: 0, y: 0, w: 1600, h: 952 };
  assert.deepEqual(
    growBoxToWidth({ x: 464, y: 100, w: 672, h: 700 }, 1072, area, 40),
    { x: 264, y: 100, w: 1072, h: 700 },
    'centred window stays centred',
  );
  assert.deepEqual(
    growBoxToWidth({ x: 464, y: 100, w: 672, h: 700 }, 5000, area, 40),
    { x: 40, y: 100, w: 1520, h: 700 },
    'capped at the work area less the margin',
  );
  assert.deepEqual(
    growBoxToWidth({ x: 900, y: 0, w: 672, h: 700 }, 1072, area, 40),
    { x: 488, y: 0, w: 1072, h: 700 },
    'near the right edge it moves in rather than hanging off',
  );
  // A left taskbar shifts the work area; the margin is measured from its edge.
  assert.deepEqual(
    growBoxToWidth({ x: 100, y: 0, w: 672, h: 700 }, 5000, { x: 48, y: 0, w: 1552, h: 900 }, 40),
    { x: 88, y: 0, w: 1472, h: 700 },
  );
});

test('growBoxToWidth never narrows', () => {
  const box: Box = { x: 100, y: 0, w: 1200, h: 700 };
  assert.equal(growBoxToWidth(box, 900, { x: 0, y: 0, w: 1600, h: 952 }, 40), box, 'narrower target');
  // Already wider than the cap (a box saved on a bigger screen): left alone —
  // shrinking is clampReachable's job, not the fit's.
  const wide: Box = { x: 0, y: 0, w: 1580, h: 700 };
  assert.equal(growBoxToWidth(wide, 3000, { x: 0, y: 0, w: 1600, h: 952 }, 40), wide, 'already past the cap');
});
