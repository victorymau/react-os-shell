/**
 * ⌘K over an open SearchableSelect, in a real browser.
 *
 * The reported bug: the design list stayed open when the palette opened and
 * painted crisp ABOVE its blurred backdrop. jsdom computes no stacking, so the
 * node lane can only say the list closed; this lane asks the browser what is
 * actually on top at the spot where the list was — `elementFromPoint` — which
 * is the claim the user was making.
 *
 * It also pins the palette's own layer: it used to sit at z-200 inside the
 * shell, beneath the window stack's upper reaches and every pinned window.
 */
import assert from 'node:assert/strict';

export const describe =
  'an open SearchableSelect closes when ⌘K opens the palette, which paints above windows and pinned windows';

/** What is painted at a point, described well enough to assert on. */
const hitAt = (page, x, y) => page.evaluate(([px, py]) => {
  const el = document.elementFromPoint(px, py);
  return {
    inPalette: Boolean(el?.closest('[data-global-search]')),
    isBackdrop: Boolean(el?.matches('[data-global-search-backdrop]')),
    text: el?.textContent?.slice(0, 40) ?? null,
  };
}, [x, y]);

export default async function check(page, { pageErrors }) {
  const field = page.getByRole('combobox');
  await field.click();

  const option = page.getByRole('button', { name: 'Design 3', exact: true });
  await option.waitFor();
  const box = await option.boundingBox();
  assert.ok(box, 'the list is laid out');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  assert.equal((await hitAt(page, x, y)).text, 'Design 3', 'the open list paints above its window');

  const pinned = await page.getByTestId('pinned-window').boundingBox();
  assert.ok(pinned);

  // Focus is in the field, exactly as in the report.
  await page.keyboard.press('Meta+k');
  const paletteInput = page.locator('[data-global-search] input');
  await paletteInput.waitFor();

  assert.equal(await option.count(), 0, 'the list closed as the palette opened');
  assert.equal(await field.getAttribute('aria-expanded'), 'false');

  const whereTheListWas = await hitAt(page, x, y);
  assert.ok(
    whereTheListWas.isBackdrop,
    `the palette's backdrop is on top where the list was, found ${JSON.stringify(whereTheListWas)}`,
  );

  const overPinned = await hitAt(page, pinned.x + pinned.width / 2, pinned.y + pinned.height - 10);
  assert.ok(overPinned.inPalette, `the palette covers a pinned window, found ${JSON.stringify(overPinned)}`);

  // Portalled to <body>, so no window's stacking context can hold it down.
  assert.equal(
    await page.evaluate(() => document.querySelector('[data-global-search]')?.parentElement === document.body),
    true,
  );
  await page.waitForFunction(() => document.activeElement?.closest('[data-global-search]') !== null);

  // Closing the palette leaves the field usable: the list opens again and is
  // back on top of its window.
  await page.keyboard.press('Escape');
  await paletteInput.waitFor({ state: 'detached' });
  await field.click();
  await option.waitFor();
  assert.equal((await hitAt(page, x, y)).text, 'Design 3', 'the list reopens above its window');

  // Clicking into another control closes it — focus left both the field and
  // the list, which the outside-press path already covered; tabbing out and a
  // script moving focus are what the new focusout path adds.
  await page.evaluate(() => {
    const other = document.createElement('button');
    other.textContent = 'elsewhere';
    document.body.appendChild(other);
    other.focus();
  });
  await option.waitFor({ state: 'detached' });

  assert.deepEqual(pageErrors, []);
}
