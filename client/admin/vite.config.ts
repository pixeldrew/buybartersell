import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

export default defineConfig({
  base: '/admin/dashboard/',
  root: __dirname,
  plugins: [react(), tailwindcss(), mkcert()],
  server: {
    proxy: {
      //'/admin': process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
      '/api/admin/stats': process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
      '/api/admin/settings': process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
      '/api/admin/tracked-group': process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
      '/login': {
        target: process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
        changeOrigin: true,
      },
      '/callback': {
        target: process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
        changeOrigin: true,
      },
      '/logout': {
        target: process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
        changeOrigin: true,
      },
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
