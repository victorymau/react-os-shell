---
bump: minor
title: react-os-shell/file-intake — the upload intake without the shell
---

- **New subpath: `react-os-shell/file-intake`.** `useFileIntake`, `acceptsFile`
  and `FileIntakeAlert`, with the `FileIntakeOptions`, `FileIntakeLimits`,
  `FileRejection` and `FileRejectionReason` types, on an entry that imports
  React and nothing else — no `react-dom`, no stylesheet, no toast container,
  no window manager.

  Two pages need the intake every kit upload primitive uses (harness UI-15)
  and cannot load the shell to get it: the admin portal's public applicant
  page, whose bundle an architecture test keeps shell-free, and the public
  storefront. Before this, each kept a native `<input type="file">` that
  checked `accept` in the file dialog only and took no drop at all.

  The entry is the same module instance as the kit's own exports, so an app
  importing from both still has one hook. `scripts/verify-dist.mjs` walks the
  built graph of `dist/file-intake/index.js` on every build and fails it if a
  shared chunk carries anything but React into it, a stylesheet included, or
  if the export list drifts.
