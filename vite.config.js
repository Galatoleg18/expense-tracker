import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: false,
  build: {
    outDir: 'dist',
    minify: 'esbuild',
    sourcemap: false,
    copyPublicDir: false,
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
});
