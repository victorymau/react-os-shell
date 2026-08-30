import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { hasWasmPreamble, describeNonWasm, wasmBytesError } from '../src/apps/_wasmBytes';

/**
 * The wasm byte check — see src/apps/_wasmBytes.ts for why `res.ok` was not
 * enough. These drive the real functions rather than reading the source,
 * because the failure they guard is a wrong ANSWER, not a wrong spelling.
 *
 * `Preview.tsx` itself cannot be imported here: pdfjs-dist constructs a
 * `new DOMMatrix()` at module scope and Node has no DOM. That is exactly why
 * the decision lives in its own React-free module, and why the last test below
 * reads Preview's source to prove the module is actually WIRED IN — a helper
 * that is correct and unused would pass every other test on this page.
 */

const WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const HTML = new TextEncoder().encode('<!doctype html><html lang="en"><head><title>Efficient');

test('a real WebAssembly module is recognised', () => {
  assert.equal(hasWasmPreamble(WASM), true);
});

test('an SPA fallback page is not mistaken for a module', () => {
  assert.equal(hasWasmPreamble(HTML), false);
});

test('a truncated response is refused rather than read past its end', () => {
  // Three bytes of a correct preamble. An index check that used `<` instead of
  // `>=`, or that read bytes[3] without a length test, would pass this.
  assert.equal(hasWasmPreamble(new Uint8Array([0x00, 0x61, 0x73])), false);
  assert.equal(hasWasmPreamble(new Uint8Array()), false);
});

test('a near-miss preamble is refused — all four bytes are checked', () => {
  for (let i = 0; i < 4; i += 1) {
    const bent = Uint8Array.from(WASM);
    bent[i] ^= 0xff;
    assert.equal(hasWasmPreamble(bent), false, `byte ${i} was not checked`);
  }
});

test('the description quotes the page, which is what names the fault', () => {
  assert.match(describeNonWasm(HTML), /^\d+ bytes starting "<!doctype html/);
});

test('an empty body says so in those words rather than reporting 0 bytes', () => {
  assert.equal(describeNonWasm(new Uint8Array()), 'an empty response');
});

test('unprintable bytes are shown as dots, never dumped into the console raw', () => {
  const binary = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const described = describeNonWasm(binary);
  assert.match(described, /^8 bytes starting "\.PNG\.\.\.\."$/);
});

test('the error names the file, the URL and the emit', () => {
  const err = wasmBytesError('/assets/jbig2.wasm', 'jbig2.wasm', HTML);
  assert.match(err.message, /not a WebAssembly module/);
  assert.match(err.message, /did not emit "jbig2\.wasm"/);
  assert.match(err.message, /\/assets\/jbig2\.wasm/);
  // The escape hatch is the only thing a consumer can actually DO about it, so
  // it belongs in the message and not only in the docs.
  assert.match(err.message, /__REACT_OS_SHELL_PDF_WASM__/);
});

test('the check is wired into the Preview factory, not merely available to it', () => {
  const root = process.env.REPO_ROOT ?? resolve(import.meta.dirname, '..');
  const preview = readFileSync(join(root, 'src/apps/Preview.tsx'), 'utf-8');
  assert.match(preview, /from '\.\/_wasmBytes'/);
  // Between reading the body and returning it, the bytes must be checked.
  assert.match(
    preview,
    /await res\.arrayBuffer\(\)[\s\S]{0,200}hasWasmPreamble\(bytes\)[\s\S]{0,120}throw wasmBytesError\(/,
    'BundledPdfWasmFactory.fetch must reject a non-wasm body before returning it',
  );
});
