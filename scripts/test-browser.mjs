/** Real-browser integration for the Headless UI confirmation boundary. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = await build({
  entryPoints: [join(root, 'tests', 'browser', 'windowDirty.entry.tsx')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  jsx: 'automatic',
  define: { __PKG_VERSION__: '"browser-test"' },
  logLevel: 'warning',
});
const bundle = result.outputFiles[0].text;

const server = createServer((request, response) => {
  if (request.url === '/bundle.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    response.end(bundle);
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><html><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen);
  server.listen(0, '127.0.0.1', resolveListen);
});

const address = server.address();
assert.ok(address && typeof address === 'object');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(5000);
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error));

try {
  await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'networkidle' });
  const panel = page.locator('[data-modal-panel][data-window-key="page:/browser-window-dirty-test"]');
  await panel.waitFor();

  // The first Escape reaches Modal and opens the real Headless UI Dialog.
  await page.keyboard.press('Escape');
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  assert.equal(await dialog.count(), 1);
  await assert.doesNotReject(() => dialog.getByText('Discard changes?').waitFor());

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
  console.log('✔ real Headless UI guards Escape and public close without duplicate dismissal');
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
