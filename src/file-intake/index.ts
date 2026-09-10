/**
 * `react-os-shell/file-intake` — the upload intake WITHOUT the shell.
 *
 * `useFileIntake` is the one path a file takes into every kit upload primitive
 * (harness UI-15 / PAT-10). Two consumers need that path and cannot take the
 * UI kit to reach it: the admin portal's public applicant page, whose bundle
 * an architecture test keeps free of the shell's toast container, stylesheet
 * and window manager, and the public storefront, which takes nothing from this
 * package but `./markup`. `react-os-shell/ui` would hand both of them the whole
 * kit; this entry hands them the hook.
 *
 * The module behind it imports React and nothing else, and the promise holds
 * only as long as that stays true. `tests/fileIntakeEntryIsReactOnly.test.ts`
 * walks the source graph; `scripts/verify-dist.mjs` walks the BUILT graph,
 * because `splitting: true` shares chunks between entries and only the output
 * shows what a shared chunk carries.
 *
 * Named re-exports, never `export *`. esbuild does not expand a star re-export
 * whose target is reachable from another entry the way a reader expects — the
 * root barrel once shipped without the whole kit that way (verify-dist §3) —
 * so every public name here is listed, and verify-dist pins the list.
 */
export { useFileIntake, acceptsFile, FileIntakeAlert } from '../forms/useFileIntake';
export type {
  FileIntakeOptions, FileIntakeLimits, FileRejection, FileRejectionReason,
} from '../forms/useFileIntake';
