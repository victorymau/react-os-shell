---
bump: minor
title: One intake path for every upload primitive
---

- **Every upload primitive takes files through one intake.** `FilePicker`,
  `MediaUploadField`, `MediaUploadGrid`, `BrandAssetEditor` and
  `BulkImportGrid` now share `useFileIntake`: the native dialog, a drop onto
  the zone and a paste into a composer run the same checks and deliver the
  same `File[]`. Before, each owned its own hidden input and its own
  drag-over state, and the checks differed by gesture — `accept` reached the
  native dialog only, so a file dropped onto a zone bypassed it. A dropped
  `.pdf` on an `image/*` field is now rejected with a reason.

  **A rejected file is announced.** The reasons render under the zone in a
  `role="alert"` list — "photo.png is not an accepted file type (PDF)",
  "big.png is 9 B — the limit is 4 B", "third.png was not added — 2 files is
  the limit" — so a screen-reader user hears why the drop did nothing.

  **A multi-file drop keeps every file.** `MediaUploadGrid` took the first
  file of a drop and lost the rest without a word. It now delivers all of them
  — one `onFiles(files)` call, or one `onPick(file)` per file for a consumer
  on the injected-picker contract.

- **`onFile` / `onFiles`: the primitive owns the gesture, the consumer owns
  the upload.** `MediaUploadField` takes `onFile(file)` and `MediaUploadGrid`
  takes `onFiles(files)`: click opens the native dialog, a drop lands on the
  zone, and the consumer receives checked `File`s to send through its own
  API module. `onPick` stays for a consumer with a library picker of its own.
  The grid was read-only without `onPick`; with `onFiles` it now has a dialog
  behind the Add tile.

- **`maxSizeBytes` on `MediaUploadField`, `maxSizeBytes` and `maxFiles` on
  `MediaUploadGrid`, `acceptHint` on `FilePicker`.** The media primitives had
  no size or count limit at all; `FilePicker` had no hint to name in a type
  rejection.

- **`FilePicker` is one tab stop and forwards its ref.** The zone is a button
  that opens the dialog on click, Enter or Space and takes a drop; the native
  input behind it carries `tabIndex={-1}`, where before the `sr-only` input
  and the visible "Choose files" button were two stops for one action. The
  ref reaches the zone, so `FormErrorSummary` can focus it. The field now
  wraps in `FormField` like every other control, so its label, hint and error
  match the rest of a form.

- **`BrandAssetEditor` no longer duplicates the field's hidden input or its
  type check.** It hands `stage` to the field's `onFile` and the field's
  intake enforces `accept` and `maxBytes`; the rejection sentences are the
  shared ones above.

- **`BulkImportGrid` takes a dropped CSV.** The whole panel is the drop
  target; the Upload CSV button opens the same intake's dialog.

- The dropzone, busy overlay and filename badge are drawn once in
  `mediaShared` instead of once per primitive; the busy overlay uses the
  `bg-white/60` utility so the dark theme's remap applies to it.
