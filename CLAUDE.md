# react-os-shell

Shared desktop-shell component library, published to npm and consumed by the EFFICIENT portals (admin, customer, supplier).

## Release checklist (every PR)

This package is published and consumed downstream, so version + changelog discipline is load-bearing:

- **Bump the version** in `src/version.ts` (injected into `VERSION` at build) and `package.json`.
- **Add a changelog entry** in `src/changelog.ts` and `CHANGELOG.md`.
- **Update the help docs** for any added feature or change to existing behaviour.
- **Publish in order:** bump → `npm run build` → `npm publish`, then bump the `react-os-shell` `^x.y.z` pin in each consuming portal.

A local Claude Code release-checklist hook reminds you on `git push` / `gh pr create` when no version or changelog change is present on the branch.
