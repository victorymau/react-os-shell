/**
 * Fit-to-width, in a real browser.
 *
 * Windows used to open at their size-ladder / `dimensions` width whatever they
 * held, so a wide list opened with a horizontal scrollbar on a screen with
 * room to spare and was widened by hand on every open (the DFM Logs window).
 * These cases pin the property rather than a number: after opening, a window
 * whose content can use the width no longer scrolls sideways — and a window
 * whose scroller CAN'T use it, or whose user already took over, is left alone.
 */
import assert from 'node:assert/strict';

export const describe =
  'windows open wide enough that their content does not scroll sideways, and no wider';

// No Layout is mounted, so there is no taskbar: the work area is the viewport,
// and Modal keeps a 40px open-time margin on each side.
export const viewport = { width: 1600, height: 1000 };
const MARGIN = 40;
const CAP = viewport.width - MARGIN * 2;
const LADDER_LG = 672;

const panelOf = (page, kase) =>
  page.locator(`[data-modal-panel][data-window-key="page:/auto-width-${kase}"]`);

/** Panel box once its width has held still for half a second. */
async function settledBox(page, panel) {
  let last = -1;
  let still = 0;
  for (let i = 0; i < 60 && still < 5; i += 1) {
    const { width } = await panel.boundingBox();
    still = Math.abs(width - last) < 0.5 ? still + 1 : 0;
    last = width;
    await page.waitForTimeout(100);
  }
  return panel.boundingBox();
}

const overflowOf = (panel) =>
  panel.getByTestId('scroller').evaluate(el => el.scrollWidth - el.clientWidth);

async function open(ctx, page, kase) {
  await ctx.open(`?case=${kase}`);
  const panel = panelOf(page, kase);
  await panel.getByTestId('scroller').waitFor();
  return panel;
}

async function assertFits(page, panel, why) {
  const box = await settledBox(page, panel);
  assert.ok(box.width > LADDER_LG, `${why}: grew past the ${LADDER_LG}px ladder width (got ${box.width})`);
  assert.ok(await overflowOf(panel) <= 1, `${why}: no horizontal scroll left`);
  assert.ok(box.x >= MARGIN - 1 && box.x + box.width <= viewport.width - MARGIN + 1, `${why}: inside the work area`);
}

export default async function check(page, ctx) {
  await assertFits(page, await open(ctx, page, 'fluid'), 'fluid');

  // Rows arriving after the window is already up still widen it.
  await assertFits(page, await open(ctx, page, 'late'), 'late');

  // A box saved by an earlier session restores narrow — and must still fit.
  // The restore runs in the same commit as the first measure; restoring the
  // saved box whole used to undo the fit.
  await page.evaluate(() => localStorage.setItem('erp_window_positions', JSON.stringify({
    'page:/auto-width-saved': { x: 120, y: 60, w: 672, h: 600 },
  })));
  await assertFits(page, await open(ctx, page, 'saved'), 'saved box');

  // More than the screen can give: capped at the work area less the margin.
  {
    const box = await settledBox(page, await open(ctx, page, 'cap'));
    assert.ok(Math.abs(box.width - CAP) <= 1, `cap: ${CAP}px wide (got ${box.width})`);
    assert.ok(Math.abs(box.x - MARGIN) <= 1, `cap: starts at the margin (got ${box.x})`);
  }

  // A fixed-width scroller keeps overflowing however wide the window gets —
  // growing for it would be pure loss.
  {
    const panel = await open(ctx, page, 'rigid');
    const box = await settledBox(page, panel);
    assert.equal(Math.round(box.width), LADDER_LG, 'rigid: left at the ladder width');
    assert.ok(await overflowOf(panel) > 1, 'rigid: the case really does overflow');
  }

  // Opted out: the ladder width, scrollbar and all.
  {
    const panel = await open(ctx, page, 'optout');
    const box = await settledBox(page, panel);
    assert.equal(Math.round(box.width), LADDER_LG, 'optout: left at the ladder width');
    assert.ok(await overflowOf(panel) > 1, 'optout: the case really does overflow');
  }

  // The user resizes before the rows land: the fit must not override them.
  {
    await ctx.open('?case=resized');
    const panel = panelOf(page, 'resized');
    await panel.getByText('Loading…').waitFor();
    const before = await panel.boundingBox();
    const corner = await panel.locator('.cursor-nwse-resize').first().boundingBox();
    const cx = corner.x + corner.width / 2;
    const cy = corner.y + corner.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 30, cy, { steps: 3 });
    await page.mouse.move(cx - 60, cy, { steps: 3 });
    await page.mouse.up();
    await panel.getByTestId('scroller').waitFor();
    const box = await settledBox(page, panel);
    assert.ok(Math.abs(box.width - (before.width - 60)) <= 2, `resized: keeps the user's width (was ${before.width}, got ${box.width})`);
  }

  assert.deepEqual(ctx.pageErrors, []);
}
