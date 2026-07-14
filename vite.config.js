import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    minify: 'esbuild',
    sourcemap: false,
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
});
