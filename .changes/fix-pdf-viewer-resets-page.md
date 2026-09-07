---
bump: patch
title: PdfViewer opens a new document on its first page
---

- **A `PdfViewer` handed a new `url` opens that document on page one.** The
  page number used to survive the change, so re-rendering one viewer with a
  shorter document left it pointing past the end: page 3 of a three-page
  statement, then a one-page one, asked pdf.js for a page that does not exist
  and the canvas went blank with nothing thrown and nothing logged.

  It never showed while the viewer was the Preview window's private panel —
  Preview keys its panels by url, so the component never saw a second
  document. It became reachable the moment 4.96.0 let a consumer embed one,
  which is the case where a single viewer is re-rendered with a new blob.
  Consumers no longer need `key={url}` to work around it.

  The reader's zoom is deliberately NOT reset: it is a preference for how large
  they want text, and it holds across documents the way it does in any reader.
  Only the page is a fact about the file.

- **The real-browser lane takes more than one scenario.** `test-browser.mjs`
  was a single hard-coded run; it now discovers `tests/browser/<name>.entry.tsx`
  + `<name>.check.mjs` pairs, so adding a scenario is adding two files. It also
  serves the package's real stylesheet and pdf.js's installed worker — the
  first because an unstyled page is not merely ugly (the PDF text layer is
  `inset: 0` against a `relative` parent, so with no CSS its containing block
  is the viewport and it covers the toolbar), the second because a test that
  reaches unpkg fails whenever npm does.

  The page-reset check lives there rather than in the jsdom suite because it
  needs pdf.js to actually READ a document, and `tests/dom.ts` stubs the canvas
  types as empty constructors. Driving real pdf.js under the spec runner was
  tried first and abandoned: its main-thread fallback calls `Promise.try`,
  which Node 22 does not have, and on Node 24 the document never arrived —
  green on the author's Node and red on both of CI's.

- **`Previous page` / `Next page` have accessible names.** They were icon-only
  buttons with none, which is also why nothing could address them from a test.

- **The dirty-close scenario's own control moved above the window chrome.** It
  now renders with real styles, where the window's top-left resize handle
  really does sit over that corner — the unstyled page hid that, and the click
  had been working by accident.
