---
bump: minor
title: The PDF reader is embeddable — `PdfViewer`
---

- **`PdfViewer` — the PDF reader outside the Preview window.** It was
  `Preview.tsx`'s private `PdfPanel`, reachable only by opening a window:
  `PdfActionButton` and `setPdfPreview` both stage a document and call
  `openPage('/preview')`. A consumer that wanted a PDF *inside* something —
  a preview beside the form that generates it, a document tab on a record —
  had no component to reach for, and both that tried fell back on
  `<iframe src={objectUrl}>`.

  That fallback is not a smaller version of this viewer, it is the browser's
  own plugin: its toolbar, a ~250px thumbnail rail and its own idea of the
  zoom, in a pane that had none to spare — and a portrait page cropped at the
  fold, so the totals someone is checking before they send the document are
  the part not on screen. None of it is themeable, and none of it is testable.

  ```tsx
  const PdfViewer = lazy(() => import('react-os-shell/apps').then(m => ({ default: m.PdfViewer })));
  <PdfViewer url={objectUrl} filename="Statement.pdf" fit="page" />
  ```

  Lazy, like every other app in that barrel, and for the same reason: the
  static `pdfjs-dist` import must not reach a host's startup bundle.

- **`fit` chooses what auto-fit tracks.** `'width'` — the default, and what
  the Preview window keeps — fills the container's width and lets a tall page
  scroll. `'page'` fits the whole page, taking whichever axis binds first.
  A viewer that owns a window wants the first; a preview pane in a dialog
  wants the second. Either way it is the initial mode, and the Fit button
  re-arms it after a manual zoom.

- **A panel with nowhere to portal to now renders its own toolbar.** Inside
  Preview each format panel portals its page nav, zoom and download buttons
  into the window's single toolbar row. With no slot in context `PanelActions`
  returned `null`, which was invisible for as long as every panel lived in a
  window — and would have shipped the embedded viewer with no page nav and no
  zoom at all.

- **`scripts/verify-dist.mjs` fails the build on an eagerly-imported heavy
  peer.** `pdfjs-dist`, `dxf-viewer`, `online-3d-viewer`, `xlsx` and `mammoth`
  must stay behind a dynamic import on every entry. One plausible-looking
  `export { default as PdfViewer } from './PdfViewer'` in the apps barrel
  would put a PDF parser in five portals' startup bundles, with a clean
  typecheck, green tests and nothing to see but a slower first paint — and for
  a consumer who never installed the optional peer, an unresolvable import.
  The walk follows static edges only; following both kinds cannot tell a
  startup cost from a lazy chunk.
