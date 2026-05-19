import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

export default defineConfig({
  base: '/listings/',
  root: __dirname,
  plugins: [react(), tailwindcss(), mkcert()],
  server: {
    proxy: {
      '/api/listings': process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
      '/media': process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
