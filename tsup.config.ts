import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/apps/index.ts'],
  format: ['esm'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
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
  ],
});
