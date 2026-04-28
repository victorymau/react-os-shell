# react-os-shell demo

Minimal Vite app showcasing the shell + bundled apps with no backend.

```bash
# from the repo root
cd ~/Github/react-os-shell
npm run build              # build the package once
cd examples/demo
npm install                # picks up the file:../.. dep
npm run dev                # http://localhost:5173/
```

What you get:
- the desktop with frosted-glass theming
- start menu with 12 of the bundled apps (Utilities / Games / Google)
- Cmd-K global search
- localStorage-backed preferences (theme, taskbar position, sticky notes)
- a fake "Demo User" identity with a no-op logout

**Note:** rebuild the parent package (`npm run build` at the repo root) after each shell change — the file: install caches the prebuilt `dist/`.
