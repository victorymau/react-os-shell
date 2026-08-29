import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The pdfjs-dist contract — the peer range, and the two call-site details that
 * have to hold for the Preview viewer to work on whatever the consumer ships.
 *
 * BG#00519: `peerDependencies` said `"pdfjs-dist": "*"` while the
 * devDependency pinned `^5.6.205`, so the component was tested at 5.x and
 * consumed at 6.x. pdf.js 6 removed the bare-string overload of `getDocument`,
 * the admin portal upgraded, and every PDF preview failed with "Failed to load
 * PDF" for ten days. Nothing in this repo could have caught it: an unbounded
 * peer range is satisfied by a major that removes the API we call.
 *
 * These are source assertions rather than behavioural ones on purpose. pdfjs
 * is bundled into the spec build (it is not in scripts/test.mjs's external
 * list), the viewer only reaches getDocument from a mounted window with a
 * staged file, and neither the wasm fetch nor the peer range has any runtime
 * surface here at all — the failure they guard against happens in a
 * CONSUMER'S build, against a version this repo does not install.
 */

const ROOT = process.env.REPO_ROOT ?? resolve(import.meta.dirname, '..');
const PREVIEW = readFileSync(join(ROOT, 'src/apps/Preview.tsx'), 'utf-8');
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));

test('every getDocument call passes a parameter object, never a bare argument', () => {
  const calls = [...PREVIEW.matchAll(/getDocument\(\s*(.)/g)];

  // A vacuous pass would be the worst outcome here: if the viewer stops
  // calling getDocument under a name this regex recognises, that is a signal
  // to update the test, not a green tick.
  assert.ok(calls.length > 0, 'expected at least one getDocument call in Preview.tsx');

  for (const call of calls) {
    assert.equal(
      call[1],
      '{',
      'getDocument must be called with a parameter object. pdfjs-dist 6.x ' +
        'removed the string overload — `getDocument(url)` throws "expected ' +
        'either `data`, `range`, or `url` parameter" and every preview shows ' +
        '"Failed to load PDF". Use `getDocument({ url, ... })`.',
    );
  }
});

test('the pdfjs-dist peer range has a major ceiling on every clause', () => {
  const range: string = PKG.peerDependencies['pdfjs-dist'];

  for (const clause of range.split('||').map((c) => c.trim())) {
    assert.match(
      clause,
      /^\^\d+\.\d+\.\d+$/,
      `pdfjs-dist peer clause "${clause}" (in "${range}") has no major ceiling. ` +
        'A caret pins one; `*` and a bare `>=` do not, and that is how pdf.js 6 ' +
        'walked into the admin portal unannounced. Add the new major to the range ' +
        'deliberately, once the viewer has been checked against it.',
    );
  }
});

test('the pdfjs-dist devDependency sits at the top major of the peer range', () => {
  const range: string = PKG.peerDependencies['pdfjs-dist'];
  const dev: string = PKG.devDependencies['pdfjs-dist'];

  const majorOf = (spec: string) => Number(spec.replace(/^[^\d]*/, '').split('.')[0]);
  const peerMajors = range.split('||').map((c) => majorOf(c.trim()));

  assert.equal(
    majorOf(dev),
    Math.max(...peerMajors),
    `the devDependency (${dev}) must sit at the highest major the peer range ` +
      `promises (${range}). This is the half of BG#00519 that nothing else ` +
      'checks: the range may admit a major, but until the devDependency is on ' +
      'it, typecheck, tests and build have never once run against it.',
  );
});

test('pdf.js wasm decoders resolve from the consumer\'s own pdfjs-dist', () => {
  // The modules are named in a literal `new URL(<specifier>, import.meta.url)`
  // so the consumer's bundler can see and emit them; a template string or a
  // computed path is invisible to Vite and silently falls back to a runtime
  // path that does not exist.
  const specifiers = [...PREVIEW.matchAll(/new URL\('(pdfjs-dist\/wasm\/[^']+)', import\.meta\.url\)/g)]
    .map((m) => m[1]);

  assert.ok(
    specifiers.length > 0,
    'Preview.tsx must reference pdf.js\'s wasm decoders through ' +
      "new URL('pdfjs-dist/wasm/<file>', import.meta.url) so the consumer's " +
      'bundler emits them. Without a wasmUrl or a BinaryDataFactory, pdf.js ' +
      'drops JBIG2 and JPEG 2000 images with nothing but a console warning.',
  );

  // The names are pdf.js's, not ours — a rename in a future pdfjs release is a
  // resolution failure in every consumer's build, so catch it here instead.
  for (const spec of specifiers) {
    const onDisk = join(ROOT, 'node_modules', spec);
    assert.ok(
      existsSync(onDisk),
      `${spec} does not exist in the installed pdfjs-dist. Either the file was ` +
        'renamed upstream, or the peer range now admits a release that does not ' +
        'ship it — both break the consumer\'s build, not just this test.',
    );
  }

  assert.equal(
    /getDocument\(\{[^}]*pdfWasmParams\(\)/.test(PREVIEW),
    true,
    'the getDocument call must spread pdfWasmParams(), or the wasm modules are ' +
      'emitted into the consumer\'s bundle and then never handed to pdf.js.',
  );
});
