import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Deployed to GitHub Pages at /react-os-shell/
  base: process.env.GITHUB_PAGES === '1' ? '/react-os-shell/' : '/',
  // The `file:../..` link copies the package's full node_modules tree into the
  // demo, leading to duplicate React/Router contexts. Force-dedupe shared deps.
  resolve: {
    dedupe: [
      'react',
      'react-dom',
      'react-router',
      'react-router-dom',
      '@tanstack/react-query',
      'react-hook-form',
      '@headlessui/react',
      '@heroicons/react',
    ],
  },
});
