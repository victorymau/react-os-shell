/**
 * Layout guard for BG#00623 — "When I click on the version number, the what's
 * window is not poping up."
 *
 * The desktop version watermark is the only way into the What's New window, and
 * it was a 42x15 button drawn at `bottom-16 right-3` with no stacking level.
 * The Trash tile carries an explicit `zIndex: 1` and its default position is
 * measured up from the taskbar (`20 + taskbarHeight`), so on a small or medium
 * taskbar the Trash lands over the digits and takes the click. Its own handler
 * calls `stopPropagation()` and only sets the selection, so an intercepted
 * click looks like the window failing to open. The taskbar itself
 * (`z-[250]`, `position: fixed`) is the other neighbour, and the fixed 64px
 * offset does not clear a large one.
 *
 * None of that is visible to `tests/whatsNewFillsWindow.test.tsx`, which finds
 * the same button and calls `.click()` on it: jsdom does no layout and never
 * loads Tailwind, so nothing there has a position or an area. This spec runs a
 * real engine with the real compiled stylesheet and asks the only question
 * that matters — for each pixel of the button, who does the browser say the
 * click goes to.
 *
 * Asserted as a property, not as a z-index: every pixel of the label hit-tests
 * to the button, the label clears the taskbar entirely, and clicking the digits
 * opens the window. A different fix that satisfies those is a correct fix.
 */
import assert from 'node:assert/strict';

const TASKBAR_SIZES = ['small', 'medium', 'large'];
const VERSION = '48.42.2';

/** For every pixel in the button's box, who wins the hit test. */
const surveyHitTest = () => {
  const button = [...document.querySelectorAll('button')].find(b => b.textContent === '48.42.2');
  if (!button) return { found: false };
  const box = button.getBoundingClientRect();
  const taskbar = document.querySelector('[data-taskbar-dropzone]');
  const taskbarBox = taskbar ? taskbar.getBoundingClientRect() : null;

  // Name whatever is taking the click, so a failure says WHO won rather than
  // only that the button lost — and name it well enough to find in the source
  // from a CI log, because that is the only place some of these appear.
  const describe = (el) => {
    if (!el) return 'nothing';
    const icon = el.closest('[data-desktop-icon]');
    if (icon) return `icon:${icon.getAttribute('data-desktop-icon')}`;
    if (el.closest('[data-taskbar-dropzone]')) return 'taskbar';
    const cls = (el.className || '').toString().trim().split(/\s+/).slice(0, 4).join('.');
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}`
      + `[z=${getComputedStyle(el).zIndex}]`;
  };

  let live = 0;
  let total = 0;
  const blockers = new Map();
  let firstBlockedStack = null;
  for (let y = Math.ceil(box.top); y < box.bottom; y += 1) {
    for (let x = Math.ceil(box.left); x < box.right; x += 1) {
      total += 1;
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === button || button.contains(hit))) { live += 1; continue; }
      if (!firstBlockedStack) {
        firstBlockedStack = document.elementsFromPoint(x, y).slice(0, 6).map(describe);
      }
      blockers.set(describe(hit), (blockers.get(describe(hit)) ?? 0) + 1);
    }
  }

  return {
    found: true,
    live,
    total,
    blockers: [...blockers].sort((a, b) => b[1] - a[1]),
    firstBlockedStack,
    buttonZ: getComputedStyle(button).zIndex,
    buttonPointerEvents: getComputedStyle(button).pointerEvents,
    taskbarPresent: !!taskbar,
    box: { top: box.top, left: box.left, width: box.width, height: box.height, bottom: box.bottom },
    // Positive means the label overlaps the taskbar, which is fixed and paints
    // over the desktop — those pixels are neither visible nor clickable.
    taskbarOverlap: taskbarBox ? Math.max(0, box.bottom - taskbarBox.top) : 0,
  };
};

export const describe =
  'the desktop version watermark takes its own clicks at every taskbar size';

// Victor's own window at the time of the report. The corner this bug lives in
// is anchored to the bottom-right, so the size only has to be plausible — but
// using his removes one thing to argue about. Every other scenario keeps the
// runner's 1280x720 default. The stylesheet is not opt-in here: the runner
// serves the compiled one to every scenario, which is what a layout assertion
// needs and what nothing in `tests/` could have.
export default async function check(page, { pageErrors, open }) {
  for (const taskbar of TASKBAR_SIZES) {
    await open(`?taskbar=${taskbar}`);

    // The startup splash is a `fixed inset-0 z-[9999]` cover that holds for
    // at least two seconds and unmounts by five (`StartupAnimation.tsx`).
    // Every pixel of the desktop is behind it while it is up, so measuring
    // before it goes measures the splash. It is already gone on a slow
    // machine by the time the page settles and still up on a fast one, which
    // is exactly the kind of difference that makes a layout spec pass
    // locally and fail on CI.
    await page.locator('[data-startup-animation]').waitFor({ state: 'detached' });

    const watermark = page.locator('button', { hasText: VERSION }).last();
    await watermark.waitFor();

    // The Trash is the neighbour that used to win; if it is missing the
    // survey below proves nothing, so fail loudly rather than pass silently.
    await page.locator('[data-desktop-icon="trash"]').waitFor();

    const survey = await page.evaluate(surveyHitTest);
    assert.ok(survey.found, `${taskbar}: the watermark should be rendered`);
    console.log(
      `    ${taskbar.padEnd(6)} taskbar — ${survey.live}/${survey.total} px live, `
      + `${survey.box.width.toFixed(0)}x${survey.box.height.toFixed(0)} box, `
      + `taskbar overlap ${survey.taskbarOverlap.toFixed(0)}px`
      + `, z=${survey.buttonZ}, pointer-events=${survey.buttonPointerEvents}`
      + `, taskbar ${survey.taskbarPresent ? 'present' : 'MISSING'}`
      + (survey.blockers.length ? `, taken by ${survey.blockers.map(([k, n]) => `${k}:${n}`).join(' ')}` : ''),
    );
    if (survey.firstBlockedStack) {
      console.log(`      stack at the first blocked pixel: ${survey.firstBlockedStack.join(' < ')}`);
    }

    assert.equal(
      survey.live,
      survey.total,
      `${taskbar} taskbar: every pixel of the version label must hit-test to the label itself — `
      + `${survey.total - survey.live} of ${survey.total} went to `
      + `${survey.blockers.map(([k]) => k).join(', ') || 'nothing'} instead, and a desktop icon's `
      + 'click handler stops the event and only changes the selection, so the window never opens',
    );

    assert.equal(
      survey.taskbarOverlap,
      0,
      `${taskbar} taskbar: the version label must sit clear of the taskbar — the taskbar is fixed `
      + `and paints over the desktop, so the ${survey.taskbarOverlap.toFixed(0)}px underneath it are `
      + 'neither readable nor clickable',
    );

    // A bigger target than the glyphs themselves. The label is 10px type at
    // 50% opacity and the text alone measures 42x15 — smaller than anything
    // else on the desktop a user is expected to hit, and small enough that
    // being a few pixels off is the difference between the window opening
    // and nothing happening. Padding, so the digits stay where they are.
    assert.ok(
      survey.box.width >= 56 && survey.box.height >= 22,
      `${taskbar} taskbar: the click target is ${survey.box.width.toFixed(0)}x`
      + `${survey.box.height.toFixed(0)}, which is not meaningfully bigger than the 42x15 the `
      + 'digits occupy on their own',
    );

    // The point of all of it.
    await watermark.click();
    await page.locator('[data-modal-panel]').waitFor();
    await page.getByText('The version number opens this window again.').waitFor();
  }

  assert.deepEqual(pageErrors, []);
}
