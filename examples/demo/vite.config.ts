import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Deployed to GitHub Pages at /react-os-shell/
  base: process.env.GITHUB_PAGES === '1' ? '/react-os-shell/' : '/',
});
