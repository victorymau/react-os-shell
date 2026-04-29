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
  ],
});
