---
bump: minor
title: ComposerAttachments — files attached to a message being written
---

- **`ComposerAttachments`: the one way a composer takes files.** A chat
  reply, a mail compose form and a feedback thread each took attachments
  three ways — a paperclip, a drop, a paste — and each portal composer wired
  the three itself: five drop zones in five highlight styles, four copies of
  the same 25 MB / 10-file guard, and three composers that took a pasted
  screenshot but not a dropped one. Now one primitive, on `useFileIntake`, so
  the checks and the rejection sentences are the ones every other upload
  surface uses.

  Wrap it around the text area and hand it the pending list:

  ```tsx
  <ComposerAttachments files={files} onChange={setFiles} maxSizeBytes={limits.maxBytes} maxFiles={limits.maxFiles}>
    <Textarea value={body} onChange={…} />
  </ComposerAttachments>
  ```

  A paste into the text area bubbles up to the wrapper, so the text area
  needs no wiring; a paste of text is left alone. The overlay reads "Drop
  files to attach" while a file drag is over the composer. The trigger reads
  "Attach files", with the pending count on it. It holds `File[]` and stops
  — the composer's send puts the files in its request however it sends
  everything else. `onReject` reports each rejection batch for a composer
  that toasts as well as announces.

- **Three parts for a composer with a layout of its own.**
  `AttachmentDropZone` (the drop and paste target with the overlay and the
  hidden input), `AttachmentList` (chips with an image thumbnail from an
  object URL the list owns and revokes, name, size, remove ×) and
  `AttachButton` (the paperclip, labelled or icon-only for a rail, count on
  either) compose the chat composer's rail and the mail form's footer.

- **`useFileIntake`, `FileIntakeAlert` and `acceptsFile` are public.** The
  intake behind every upload primitive is exported for a composer with a
  layout of its own — never so a consumer renders its own file input, its own
  drop zone or its own paste handler.
