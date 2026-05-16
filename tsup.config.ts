import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

export default defineConfig({
  entry: ['src/index.ts', 'src/apps/index.ts'],
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
