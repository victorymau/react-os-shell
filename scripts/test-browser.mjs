/**
 * The real-browser lane.
 *
 * Some of this package's behaviour cannot be asserted in the jsdom suite, and
 * the two reasons are different in kind:
 *
 *   * jsdom will report focus containment and scroll locking as working when
 *     they are not — it answers whatever we tell it (`windowDirty`).
 *   * jsdom cannot rasterise, and `tests/dom.ts` stubs `DOMMatrix`, `Path2D`
 *     and `ImageData` as empty constructors so a spec that merely imports
 *     pdf.js can evaluate. Anything that must actually READ a PDF belongs here
 *     (`pdfViewerPageReset`). Driving real pdf.js under the spec runner was
 *     tried and abandoned: it needs pdf.js's main-thread fallback, which uses
 *     `Promise.try` — absent on Node 22, which CI runs — and even where that
 *     exists the document never arrived. Green on the author's Node and red on
 *     both of CI's is the worst kind of test.
 *
 * One scenario is a PAIR of files in `tests/browser/`:
 *
 *   <name>.entry.tsx   the page — bundled for the browser and served at /
 *   <name>.check.mjs   `export default async (page, ctx) => {}`, plus a
 *                      `describe` string for the pass line. `ctx.pageErrors`
 *                      collects anything the page threw, `ctx.baseUrl` is the
 *                      origin it is served from, and `ctx.open(search)`
 *                      re-navigates there — the query string reaches the entry
 *                      as `location.search`, which is how one entry gets
 *                      mounted under several configurations
 *                      (`versionWatermark`, once per taskbar size).
 *
 *                      A check may also `export const viewport = { width,
 *                      height }`. The default below is a size, not a
 *                      measurement: a check that asserts geometry has to say
 *                      which window it is describing.
 *
 * Adding a scenario is adding those two files; nothing here needs editing.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browserDir = join(root, 'tests', 'browser');

const scenarios = readdirSync(browserDir)
  .filter(f => f.endsWith('.entry.tsx'))
  .map(f => f.replace(/\.entry\.tsx$/, ''))
  .sort();
assert.ok(scenarios.length > 0, 'no *.entry.tsx found in tests/browser');

// pdf.js has no bundled worker: it loads one from `GlobalWorkerOptions.workerSrc`
// at runtime, and the package default points at unpkg. A CI job that reaches the
// public internet to run a test is a test that fails when npm does, so serve the
// installed copy instead and let the entry point at this path.
const PDF_WORKER_PATH = '/pdf.worker.min.mjs';
const pdfWorker = readFileSync(join(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'), 'utf8');

// Real styles, once, for every scenario — see tests/browser/tailwind.css for
// why an unstyled page is not just an ugly one.
const cssDir = mkdtempSync(join(tmpdir(), 'ros-browser-css-'));
const cssFile = join(cssDir, 'styles.css');
execFileSync(
  join(root, 'node_modules/.bin/tailwindcss'),
  ['-i', join(browserDir, 'tailwind.css'), '-o', cssFile],
  { stdio: ['ignore', 'ignore', 'inherit'] },
);
const styles = readFileSync(cssFile, 'utf8');
rmSync(cssDir, { recursive: true, force: true });

const browser = await chromium.launch({ headless: true });
let failed = false;

try {
  for (const name of scenarios) {
    const { default: check, describe, viewport } = await import(
      pathToFileURL(join(browserDir, `${name}.check.mjs`)).href
    );

    const result = await build({
      entryPoints: [join(browserDir, `${name}.entry.tsx`)],
      bundle: true,
      write: false,
      // ESM, not IIFE: `import.meta.url` is empty under IIFE, and PdfViewer
      // resolves pdf.js's wasm decoders through it — the entry then dies at
      // module scope on "Failed to construct 'URL'". A consumer's bundler
      // gives it a real module URL, so this is also the faithful shape.
      format: 'esm',
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
      if (request.url === '/styles.css') {
        response.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
        response.end(styles);
        return;
      }
      if (request.url === PDF_WORKER_PATH) {
        response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
        response.end(pdfWorker);
        return;
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(
        '<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head>'
        + '<body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>',
      );
    });
    await new Promise((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(0, '127.0.0.1', resolveListen);
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const page = await browser.newPage({ viewport: viewport ?? { width: 1280, height: 720 } });
    const open = (search = '') => page.goto(`${baseUrl}/${search}`, { waitUntil: 'networkidle' });
    // 15s, not the 5s this was: these bundles are the whole shell, unminified,
    // and the first page load in a freshly launched browser is slow enough that
    // a cold `waitFor` on the first element loses the race. Nothing here waits
    // on a real network, so a raised ceiling cannot turn a passing check red —
    // it only stops a slow-but-correct one being cut off.
    page.setDefaultTimeout(15000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error));

    try {
      await open();
      await check(page, { pageErrors, pdfWorkerPath: PDF_WORKER_PATH, baseUrl, open });
      console.log(`✔ ${describe ?? name}`);
    } catch (error) {
      failed = true;
      console.error(`✖ ${describe ?? name}`);
      console.error(error);
      // Anything the PAGE threw usually explains the failure better than the
      // assertion that noticed it, and is otherwise never printed.
      for (const pageError of pageErrors) console.error('  page error:', pageError.message);
    } finally {
      await page.close();
      await new Promise(resolveClose => server.close(resolveClose));
    }
  }
} finally {
  await browser.close();
}

process.exit(failed ? 1 : 0);
