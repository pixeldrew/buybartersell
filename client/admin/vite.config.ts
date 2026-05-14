import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/admin/dashboard/',
  root: __dirname,
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/admin/stats': process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
      '/admin/settings': process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
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
