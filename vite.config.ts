import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname, 'frontend'),
  publicDir: 'public',
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'frontend/index.html'),
        admin: path.resolve(__dirname, 'frontend/admin.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/devices': 'http://127.0.0.1:8787',
    },
  },
});
