import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);

// Vite imports the bare specifier `postcss` for CSS. Point that import at
// `post-css-transfer`, which is the package this app depends on.
const postCssTransferEntry = require.resolve('post-css-transfer');

const BACKEND_URL = 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      postcss: postCssTransferEntry,
    },
  },
  css: {
    postcss: fileURLToPath(new URL('./postcss.config.js', import.meta.url)),
  },
  server: {
    port: 5173,
    // Proxying keeps the app on one origin in development, so the browser
    // never has to deal with CORS and cookies behave normally.
    proxy: {
      '/api': { target: BACKEND_URL, changeOrigin: true },
      '/socket.io': { target: BACKEND_URL, ws: true, changeOrigin: true },
    },
  },
});
