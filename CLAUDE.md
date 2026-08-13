# react-os-shell

Shared desktop-shell component library, published to npm and consumed by the EFFICIENT portals (admin, customer, supplier).

## Release checklist (every PR)

This package is published and consumed downstream, so version + changelog discipline is load-bearing:

- **Bump the version** in `package.json` — the only place. `src/version.ts` is NOT hand-edited: it reads `__PKG_VERSION__`, which tsup injects from `package.json` at build time (the `define` block in `tsup.config.ts`), so `VERSION` follows the bump on its own. Consumed without a build (e.g. tests) it stays an empty string, by design.
- **Add a changelog entry** in `CHANGELOG.md` — the only place. `src/changelog.ts` is a deliberate empty stub: the package ships no built-in changelog, and the consumer wires its own through `DesktopHostConfig.productChangelog` (product name/logo/tagline go through Layout's `branding` prop). Leave it alone.
- **Bump the app version** in `BUILTIN_APP_INFO` (`src/apps/_about.tsx`) when changing one of the bundled document/web apps (Spreadsheets, Notepad, Documents, Preview, Files, Browser) — each carries its own version, shown in its About dialog.
- **Update the help docs** for any added feature or change to existing behaviour.
- **Verify before opening the PR** — the same sequence CI runs (`.github/workflows/ci.yml`, on Node 22 and 24), in this order:

  ```bash
  npm run typecheck && npm test && npm run build
  ```

  `npm test` is the repo's own runner (`scripts/test.mjs`: esbuild transpiles the specs, `node:test` runs them — **no test framework, on purpose**); specs live in `tests/`. It does not check spec *types* — esbuild strips them without checking — which is why `npm run typecheck` also runs `tsc -p tsconfig.test.json`. CI finishes by asserting the `dist/` artifacts exist.
- **Publish in order:** bump → `npm run build` → `npm publish --dry-run` → `npm publish`, then bump the `react-os-shell` `^x.y.z` pin in each consuming portal.

  The dry run is the last gate before a publish becomes irreversible. It prints the `version:`, the tarball `filename:`, and `Publishing … with tag latest`; lists the tarball contents; and round-trips the registry, so a forgotten bump fails loudly with `You cannot publish over the previously published versions: x.y.z`. **Run it after the build, never before** — `files` is `["dist"]`, so on an unbuilt tree it cheerfully reports `total files: 3` (LICENSE, README.md, package.json) instead of the ~80 a real release ships.
- **Rebuild the local demo container after every publish:** `docker compose up --build -d` — keeps the local container (http://localhost:4173) serving the just-released build for local testing.

A local Claude Code release-checklist hook reminds you on `git push` / `gh pr create` when no version or changelog change is present on the branch. It is a reminder, not a gate — a docs-only or infra-only PR has nothing to bump, so acknowledge it and carry on.
