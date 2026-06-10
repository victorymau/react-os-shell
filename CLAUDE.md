# react-os-shell

Shared desktop-shell component library, published to npm and consumed by the EFFICIENT portals (admin, customer, supplier).

## Release checklist (every PR)

This package is published and consumed downstream, so version + changelog discipline is load-bearing:

- **Bump the version** in `src/version.ts` (injected into `VERSION` at build) and `package.json`.
- **Add a changelog entry** in `src/changelog.ts` and `CHANGELOG.md`.
- **Bump the app version** in `BUILTIN_APP_INFO` (`src/apps/_about.tsx`) when changing one of the bundled document/web apps (Spreadsheets, Notepad, Documents, Preview, Files, Browser) — each carries its own version, shown in its About dialog.
- **Update the help docs** for any added feature or change to existing behaviour.
- **Publish in order:** bump → `npm run build` → `npm publish`, then bump the `react-os-shell` `^x.y.z` pin in each consuming portal.
- **Rebuild the local demo container after every publish:** `docker compose up --build -d` — keeps the local container (http://localhost:4173) serving the just-released build for local testing.

A local Claude Code release-checklist hook reminds you on `git push` / `gh pr create` when no version or changelog change is present on the branch.
