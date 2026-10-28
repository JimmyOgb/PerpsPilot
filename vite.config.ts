import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {},
    'global': 'globalThis',
  },
  server: {
    port: 3000,
    open: false,
  },
  build: {
    outDir: 'dist-frontend',
    sourcemap: true,
  },
});
