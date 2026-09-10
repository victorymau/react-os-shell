import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

export default defineConfig({
  // `src/markup` is its own entry so a consumer can take the editorial markup
  // rule WITHOUT the shell: it imports nothing (no React, no peers), and the
  // public storefront depends on that being provably true.
  // `src/ui` is its own entry so a consumer can take the UI kit WITHOUT the
  // window manager — see its header. It stays in THIS config rather than a
  // second one with its own outdir: `splitting: true` puts the shared modules
  // in chunks both entries import, which is what keeps `toast`'s container, the
  // Escape-interceptor Set and `useIsMobile`'s store to ONE instance for an app
  // importing from both. A separate build would silently duplicate all three.
  // `src/markdown` is its own entry for the mirror-image reason to `src/markup`:
  // it is the one module in the package that needs a THIRD-PARTY runtime (a
  // CommonMark parser), and the package's promise is an empty `dependencies`.
  // As its own entry behind its own `exports` subpath, react-markdown is an
  // OPTIONAL peer that only a consumer who imports this module ever installs —
  // the till and the storefront never resolve it. It must not be reachable from
  // `src/index.ts` or `src/ui/index.ts`; `scripts/verify-dist.mjs` checks both
  // directions against the built output.
  // `src/file-intake` is its own entry so a page that must never load the
  // shell — the admin portal's public applicant page, the storefront — can
  // take the upload intake (harness UI-15) alone. It re-exports one module
  // that imports React and nothing else; `splitting: true` puts that module in
  // a chunk the ui entry shares, so the hook stays ONE instance for an app
  // importing from both. `scripts/verify-dist.mjs` holds the built graph to
  // React only.
  entry: [
    'src/index.ts',
    'src/apps/index.ts',
    'src/markup/index.ts',
    'src/ui/index.ts',
    'src/markdown/index.tsx',
    'src/file-intake/index.ts',
  ],
  format: ['esm'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  define: {
    __PKG_VERSION__: JSON.stringify(pkg.version),
  },
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    'react-router-dom',
    '@tanstack/react-query',
    'react-hook-form',
    '@headlessui/react',
    '@heroicons/react',
    '@heroicons/react/24/outline',
    '@heroicons/react/24/solid',
    '@heroicons/react/20/solid',
    'tailwindcss',
    // The markdown entry's peers. External, so the parser is resolved from the
    // consumer's own install rather than inlined here — inlining it would put a
    // second copy of micromark in every bundle and defeat the optional-peer
    // arrangement entirely.
    'react-markdown',
    'remark-gfm',
    'remark-breaks',
    'pdfjs-dist',
    'dxf-viewer',
    'mammoth',
    'online-3d-viewer',
    'three',
    // axios is a peer dep — the host app provides the instance. Inlining it
    // here ships a duplicate copy that confuses dedup in consumers and
    // surfaces as `axios.create is not a function` in their bundles (see
    // 0.3.0 prod incident with admin-portal).
    'axios',
  ],
});
