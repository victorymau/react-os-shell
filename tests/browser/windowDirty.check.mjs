/**
 * The dirty-close confirmation boundary, in a real browser.
 *
 * It existed for Headless UI, which rendered that dialog until 4.18.0 and
 * depended on browser layout and animation APIs jsdom does not implement. The
 * check matters MORE rather than less now that the dialog is the package's
 * own: focus containment and scroll locking are ours, and both are things
 * jsdom will happily report as working when they are not.
 */
import assert from 'node:assert/strict';

export const describe =
  'the dirty-close dialog guards Escape and public close, traps focus, and locks scroll';

export default async function check(page, { pageErrors }) {
  const panel = page.locator('[data-modal-panel][data-window-key="page:/browser-window-dirty-test"]');
  await panel.waitFor();

  // The first Escape reaches Modal and opens the confirm dialog.
  await page.keyboard.press('Escape');
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  assert.equal(await dialog.count(), 1);
  await assert.doesNotReject(() => dialog.getByText('Discard changes?').waitFor());

  // Focus starts on the CANCEL control, never on the one that discards work.
  // A real browser is the only place this is worth asserting — jsdom reports
  // whatever we tell it about focus.
  const focused = () => page.evaluate(() => document.activeElement?.textContent ?? '');
  assert.equal(await focused(), 'Keep Editing');

  // Tab is contained: cycling past the last control wraps to the first rather
  // than walking onto the page behind the overlay, which reads to a keyboard
  // user as the dialog having closed.
  await page.keyboard.press('Tab');
  assert.equal(await focused(), 'Discard');
  await page.keyboard.press('Tab');
  assert.equal(await focused(), 'Keep Editing', 'wraps forward');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await focused(), 'Discard', 'and backward');

  // The document behind the overlay does not scroll while it is open.
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), 'hidden');

  // Escape over the dialog is claimed once and must not close the page below.
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await panel.count(), 1);

  // Public manager close uses the same real dialog; cancelling preserves it.
  await page.getByTestId('public-close').click();
  await dialog.waitFor();
  assert.equal(await dialog.count(), 1);
  await page.getByRole('button', { name: 'Keep Editing' }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await panel.count(), 1);

  // A controlled clean transition returns public close to the direct path.
  await page.getByTestId('mark-clean').click();
  await page.getByTestId('public-close').click();
  await panel.waitFor({ state: 'detached' });
  assert.equal(await dialog.count(), 0);
  assert.deepEqual(pageErrors, []);
}
