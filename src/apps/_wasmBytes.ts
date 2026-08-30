/**
 * Is what came back over the wire actually a WebAssembly module?
 *
 * `Preview`'s wasm factory used to accept any `res.ok` response. That is not
 * enough on a single-page app: an SPA host answers a path its router does not
 * recognise with its own index.html under HTTP 200, so a build that failed to
 * emit a decoder returns a PAGE rather than a 404 (confirmed against the live
 * console on 2026-08-30 — both `/assets/jbig2.wasm` and a made-up asset path
 * answered 200 with `content-type: text/html`). pdf.js then instantiates the
 * page inside a `try` that only warns before dropping to its JS fallback, which
 * is the same quiet degrading the factory was added to remove — except now
 * nothing in the console points at the emit as the cause.
 *
 * This module is deliberately free of React and of pdfjs-dist so it can be
 * driven directly from a spec. Importing `Preview.tsx` in a Node test is not
 * possible: pdfjs builds a `new DOMMatrix()` at module scope and throws.
 */

/** Every WebAssembly module opens with the four bytes `\0asm`. Anything else —
 *  an HTML fallback page, most often — is not one. */
export function hasWasmPreamble(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x61 &&
    bytes[2] === 0x73 &&
    bytes[3] === 0x6d
  );
}

/** A short, safe description of what arrived instead, for the error message.
 *  The opening bytes of an HTML page name the problem far better than a length
 *  does, so they are worth quoting; the cap keeps a stray binary out of the
 *  console. */
export function describeNonWasm(bytes: Uint8Array): string {
  if (bytes.length === 0) return 'an empty response';
  const head = Array.from(bytes.subarray(0, 24))
    .map(b => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.'))
    .join('');
  return `${bytes.length} bytes starting "${head}"`;
}

/** The message a developer reads when the emit went missing. It has to name the
 *  emit, because the symptom they are looking at is a preview that renders
 *  everything except the scanned page, with a silent console. */
export function wasmBytesError(href: string, filename: string, bytes: Uint8Array): Error {
  return new Error(
    `The response for ${href} is not a WebAssembly module (got ` +
      `${describeNonWasm(bytes)}). The bundler did not emit "${filename}" as ` +
      `an asset, and the host answered with a fallback page instead of a 404. ` +
      `Serve pdfjs-dist/wasm/ yourself and point ` +
      `window.__REACT_OS_SHELL_PDF_WASM__ at it.`,
  );
}
