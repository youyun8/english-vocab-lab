import { fileURLToPath, URL } from 'node:url';

import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // The Cloudflare plugin owns the output layout: client assets land in
    // `dist/client`, the Worker bundle in `dist/<worker name>`.
    sourcemap: false,
  },
});
