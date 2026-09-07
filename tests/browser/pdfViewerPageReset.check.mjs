/**
 * A new document opens on page one.
 *
 * The page number used to survive a change of `url`. It never showed while
 * `PdfViewer` was the Preview window's private panel — Preview keys its panels
 * by url, so the component never saw a second document. Embedded (4.96.0) it
 * does, and page 3 of a three-page statement then asked pdf.js for page 3 of a
 * one-page one: a blank canvas, nothing thrown and nothing logged.
 *
 * Here rather than in the jsdom suite because this needs pdf.js to actually
 * READ a document, and `tests/dom.ts` stubs the canvas types as empty
 * constructors. Driving real pdf.js under the spec runner was tried: its
 * main-thread fallback uses `Promise.try`, which Node 22 does not have, and on
 * Node 24 the document never arrived at all.
 */
import assert from 'node:assert/strict';

export const describe = 'PdfViewer opens a changed document on its first page';

export default async function check(page, { pageErrors }) {
  const counter = page.locator('span.tabular-nums');
  await counter.filter({ hasText: '1 / 3' }).waitFor();

  // Read through to the last page, the way someone checking a total would.
  await page.getByLabel('Next page').click();
  await page.getByLabel('Next page').click();
  await counter.filter({ hasText: '3 / 3' }).waitFor();

  // The same viewer, a new document, no remount.
  await page.getByTestId('swap').click();
  await counter.filter({ hasText: '1 / 1' }).waitFor();

  assert.ok(
    !(await page.locator('body').textContent()).includes('3 / 1'),
    'the viewer must never claim a page number the document does not have',
  );
  // The canvas must have drawn the new page — the failure being guarded is a
  // rejected getPage(), which leaves the toolbar looking right and the page
  // blank, so the counter alone would not have caught it.
  const drawn = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    return canvas ? { w: canvas.width, h: canvas.height } : null;
  });
  assert.ok(drawn && drawn.w > 0 && drawn.h > 0, `the page should have been rendered, got ${JSON.stringify(drawn)}`);
  assert.deepEqual(pageErrors, []);
}
